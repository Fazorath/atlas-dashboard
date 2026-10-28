"""Canvas, via its calendar feed. The only module in Atlas that knows what a
Canvas ICS file looks like.

Why the feed and not the API: Canvas OAuth needs a developer key an institution
admin has to issue, and students can't get one. The feed needs no auth at all —
its URL carries a token — at the price of carrying only what a calendar can:
title, due time, course. No submission status, no grades. Completion is yours,
kept in `assignment_status`, which this module never touches.

What a Canvas feed looks like, as far as this module relies on it:

- Every assignment is a VEVENT whose UID starts `event-assignment-`.
- Calendar events are `event-calendar-event-`. Where a course has scheduled
  live meetings, these are them — **Class sessions**: a time you join, with the
  meeting link in the description. They are archived to `class_sessions`, and
  are never ticked and never counted toward "Due this week".
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
from app.models import Assignment, ClassSession
from app.sources import Unreachable

log = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(30.0)
ASSIGNMENT_UID = "event-assignment-"
CLASS_UID = "event-calendar-event-"

_SUMMARY = re.compile(r"\A(?P<title>.*?)\s*\[(?P<course>[^\[\]]+)\]\s*\Z", re.S)
_FRAGMENT_ID = re.compile(r"assignment_(\d+)")
_COURSE_CTX = re.compile(r"course_(\d+)")
_LINK = re.compile(r"https?://[^\s)\]>\"']+")
#: Meeting hosts worth preferring when a description carries several links.
_MEETING_HOSTS = ("zoom.us", "teams.microsoft", "meet.google", "webex", "bigbluebutton")


@dataclass(frozen=True)
class FeedAssignment:
    """One assignment, in Atlas's shape."""

    ics_uid: str
    title: str
    course: str | None
    due_at: datetime
    all_day: bool
    url: str | None


@dataclass(frozen=True)
class FeedClass:
    """One Class session, in Atlas's shape."""

    ics_uid: str
    title: str
    course: str | None
    start_at: datetime
    end_at: datetime | None
    location: str | None
    join_url: str | None
    url: str | None


@dataclass(frozen=True)
class Feed:
    assignments: list[FeedAssignment]
    classes: list[FeedClass]


def _join_url(description: str) -> str | None:
    """The meeting link out of a class's description — a meeting host's if
    there is one, else the first link at all."""
    links = _LINK.findall(description or "")
    for link in links:
        if any(host in link for host in _MEETING_HOSTS):
            return link
    return links[0] if links else None


def _redact(text: str, url: str | None = None) -> str:
    """The feed URL is a credential — its token reads your calendar with no
    other auth. It must never reach sync_runs, a log line, or an API response."""
    for secret in {settings.canvas_ics_url, url or ""}:
        if secret:
            text = text.replace(secret, "<CANVAS_ICS_URL>")
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


def parse_feed(body: bytes | str) -> Feed:
    calendar = Calendar.from_ical(body)
    found: dict[str, FeedAssignment] = {}
    classes: dict[str, FeedClass] = {}
    skipped = 0

    for event in calendar.walk("VEVENT"):
        uid = str(event.get("UID", ""))
        start = event.get("DTSTART")
        if start is None:
            skipped += 1
            continue

        if uid.startswith(CLASS_UID):
            title, course = _split_summary(str(event.get("SUMMARY", "")) or "Class")
            start_at, _ = _due(start.dt)
            end = event.get("DTEND")
            url = event.get("URL")
            classes[uid] = FeedClass(
                ics_uid=uid,
                title=title or "Class",
                course=course,
                start_at=start_at,
                end_at=_due(end.dt)[0] if end is not None else None,
                location=str(event.get("LOCATION") or "") or None,
                join_url=_join_url(str(event.get("DESCRIPTION") or "")),
                url=str(url) if url else None,
            )
            continue

        if not uid.startswith(ASSIGNMENT_UID):
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

    log.info(
        "canvas feed: %d assignments, %d class sessions, %d other events skipped",
        len(found), len(classes), skipped,
    )
    return Feed(assignments=list(found.values()), classes=list(classes.values()))


async def fetch_feed(url: str | None = None) -> Feed:
    """`url` overrides the configured feed — Setup's Test passes its own."""
    url = url or settings.canvas_ics_url
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            response = await client.get(url)
    except httpx.HTTPError as exc:
        raise Unreachable(
            _redact(f"Canvas feed unreachable: {type(exc).__name__}: {exc}", url)
        ) from None

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
    feed = await fetch_feed()
    assignments = feed.assignments
    seen_at = datetime.now(UTC)

    classes_written = await _sync_classes(session, feed.classes, seen_at)

    if not assignments:
        # An empty feed is far likelier to be a feed problem than a term with
        # nothing due. Don't mark the whole archive "removed" on its say-so.
        log.warning("canvas feed held no assignments; leaving the archive as it was")
        await session.commit()
        return classes_written

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
    return len(rows) + classes_written


async def _sync_classes(session: AsyncSession, classes: list[FeedClass], seen_at: datetime) -> int:
    """Upsert Class sessions on the same rules as assignments: an empty list
    changes nothing, and an upcoming one the feed stops listing is hidden."""
    if not classes:
        return 0
    rows = [
        {
            "ics_uid": c.ics_uid,
            "title": c.title,
            "course": c.course,
            "start_at": c.start_at,
            "end_at": c.end_at,
            "location": c.location,
            "join_url": c.join_url,
            "url": c.url,
            "last_seen": seen_at,
            "removed_at": None,
        }
        for c in classes
    ]
    stmt = insert(ClassSession).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["ics_uid"],
        set_={c: stmt.excluded[c] for c in rows[0] if c != "ics_uid"},
    )
    await session.execute(stmt)
    await session.execute(
        update(ClassSession)
        .where(ClassSession.last_seen < seen_at)
        .where(ClassSession.start_at >= seen_at)
        .where(ClassSession.removed_at.is_(None))
        .values(removed_at=seen_at)
    )
    return len(rows)
