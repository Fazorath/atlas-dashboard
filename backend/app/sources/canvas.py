"""Canvas, via its calendar feed. The only module in Atlas that knows what a
Canvas ICS file looks like.

Why the feed and not the API: Canvas OAuth needs a developer key an institution
admin has to issue, and students can't get one. The feed needs no auth at all —
its URL carries a token — at the price of carrying only what a calendar can:
title, due time, course. No submission status, no grades. Completion is yours,
kept in `assignment_status`, which this module never touches.

What a Canvas feed looks like, as far as this module relies on it:

- Every assignment is a VEVENT whose UID starts `event-assignment-`. Calendar
  events (lectures, office hours) are `event-calendar-event-` and are skipped:
  this is a list of things to hand in, not a timetable.
- SUMMARY is `Title [Course Name]`. The last bracketed suffix is the course.
- DTSTART is the due instant in UTC — except for anything due at 11:59pm, which
  Canvas publishes as a bare DATE. That becomes 23:59 local, flagged `all_day`.
- URL points at the calendar page with `#assignment_<id>` and the course in
  `include_contexts=course_<id>`. Both are rebuilt into the assignment's own page
  when present, because a link to a calendar month is not where you want to land.

Everything above this module sees `FeedAssignment`, so a different LMS later is
a rewrite of this file and nothing else — the same promise weather makes.
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from urllib.parse import parse_qs, urlsplit

import httpx
from icalendar import Calendar
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_zone
from app.config import settings
from app.models import Assignment

log = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(30.0)
ASSIGNMENT_UID = "event-assignment-"

_SUMMARY = re.compile(r"\A(?P<title>.*?)\s*\[(?P<course>[^\[\]]+)\]\s*\Z", re.S)
_FRAGMENT_ID = re.compile(r"assignment_(\d+)")
_COURSE_CTX = re.compile(r"course_(\d+)")


@dataclass(frozen=True)
class FeedAssignment:
    """One assignment, in Atlas's shape."""

    ics_uid: str
    title: str
    course: str | None
    due_at: datetime
    all_day: bool
    url: str | None


def _redact(text: str) -> str:
    """The feed URL is a credential — its token reads your calendar with no
    other auth. It must never reach sync_runs, a log line, or an API response."""
    if settings.canvas_ics_url:
        text = text.replace(settings.canvas_ics_url, "<CANVAS_ICS_URL>")
    return text


def _split_summary(summary: str) -> tuple[str, str | None]:
    summary = " ".join(summary.split())
    match = _SUMMARY.match(summary)
    if not match or not match["title"]:
        return summary, None
    return match["title"], match["course"].strip()


def _due(value: date | datetime) -> tuple[datetime, bool]:
    """A DATE is "end of that day, local"; a DATE-TIME is an instant."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            # Floating time. Canvas doesn't send these, but if it did, the
            # student's own zone is the only sensible reading.
            value = value.replace(tzinfo=local_zone())
        return value.astimezone(UTC), False
    end_of_day = datetime.combine(value, time(23, 59), tzinfo=local_zone())
    return end_of_day.astimezone(UTC), True


def _assignment_url(raw: str | None) -> str | None:
    """Rebuild Canvas's calendar link into the assignment's own page."""
    if not raw:
        return None
    parts = urlsplit(raw)
    assignment = _FRAGMENT_ID.search(parts.fragment or "")
    contexts = parse_qs(parts.query).get("include_contexts", [])
    course = next((m for c in contexts if (m := _COURSE_CTX.search(c))), None)
    if assignment and course and parts.scheme and parts.netloc:
        return f"{parts.scheme}://{parts.netloc}/courses/{course[1]}/assignments/{assignment[1]}"
    return raw


def parse_feed(body: bytes | str) -> list[FeedAssignment]:
    calendar = Calendar.from_ical(body)
    found: dict[str, FeedAssignment] = {}
    skipped = 0

    for event in calendar.walk("VEVENT"):
        uid = str(event.get("UID", ""))
        start = event.get("DTSTART")
        if not uid.startswith(ASSIGNMENT_UID) or start is None:
            skipped += 1
            continue

        title, course = _split_summary(str(event.get("SUMMARY", "")) or "Untitled")
        due_at, all_day = _due(start.dt)
        url = event.get("URL")
        found[uid] = FeedAssignment(
            ics_uid=uid,
            title=title or "Untitled",
            course=course,
            due_at=due_at,
            all_day=all_day,
            url=_assignment_url(str(url) if url else None),
        )

    log.info("canvas feed: %d assignments, %d other events skipped", len(found), skipped)
    return list(found.values())


async def fetch_feed() -> list[FeedAssignment]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            response = await client.get(settings.canvas_ics_url)
    except httpx.HTTPError as exc:
        raise RuntimeError(_redact(f"Canvas feed unreachable: {type(exc).__name__}: {exc}")) from None

    if response.status_code >= 400:
        # 401/404 is what a regenerated feed token looks like: Canvas invalidates
        # the old URL the moment you reset it.
        hint = " — was the feed URL reset in Canvas?" if response.status_code in (401, 403, 404) else ""
        raise RuntimeError(f"Canvas feed answered HTTP {response.status_code}{hint}")

    # A wrong URL on the right host tends to return a 200 login page, not an
    # error. Say so, rather than "Expected BEGIN:VCALENDAR" from deep in a parser.
    if b"BEGIN:VCALENDAR" not in response.content[:2048]:
        kind = response.headers.get("content-type", "unknown content")
        raise RuntimeError(f"Canvas feed URL returned {kind}, not a calendar")

    return parse_feed(response.content)


async def sync_canvas(session: AsyncSession) -> int:
    """Upsert every assignment in the feed. Returns rows touched.

    Never names `assignment_status`, so your ticks can't be clobbered by a sync.
    """
    assignments = await fetch_feed()
    seen_at = datetime.now(UTC)

    if not assignments:
        # An empty feed is far likelier to be a feed problem than a term with
        # nothing due. Don't mark the whole archive "removed" on its say-so.
        log.warning("canvas feed held no assignments; leaving the archive as it was")
        return 0

    rows = [
        {
            "ics_uid": a.ics_uid,
            "title": a.title,
            "course": a.course,
            "due_at": a.due_at,
            "all_day": a.all_day,
            "url": a.url,
            "last_seen": seen_at,
            "removed_at": None,
        }
        for a in assignments
    ]
    stmt = insert(Assignment).values(rows)
    # first_seen is left alone on conflict; everything Canvas owns is refreshed,
    # and removed_at clears so a republished assignment comes back.
    stmt = stmt.on_conflict_do_update(
        index_elements=["ics_uid"],
        set_={c: stmt.excluded[c] for c in rows[0] if c != "ics_uid"},
    )
    await session.execute(stmt)

    # Something still upcoming that the feed no longer lists was deleted or
    # unpublished. Past rows are left alone: ageing out of the feed's window is
    # exactly what the archive exists to survive.
    await session.execute(
        update(Assignment)
        .where(Assignment.last_seen < seen_at)
        .where(Assignment.due_at >= seen_at)
        .where(Assignment.removed_at.is_(None))
        .values(removed_at=seen_at)
    )
    await session.commit()
    return len(rows)
