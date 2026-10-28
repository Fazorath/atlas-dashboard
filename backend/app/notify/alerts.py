"""The Alerts Atlas can send, and when each one is due (ADR 0007).

An Alert is one kind of notification with one rule. Each has a `pick_*`
function that is plain Python over plain rows — `now` in, the things due out —
so the timing rules are tested without a database. `collect` is the thin part
that reads the rows.

Cron runs every 5 minutes, so a rule is a window, not an instant: a clock-time
Alert is due from its time until the day ends, a lead-time Alert from `lead`
before the thing until the thing starts. What already went out is filtered by
the caller against `notify_sent`, on the keys these return.
"""

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_zone
from app.models import (
    Assignment,
    AssignmentStatus,
    Habit,
    HabitEntry,
    NotifySetting,
    OAuthToken,
    SyncRun,
    SyncStatus,
    WorkShift,
    WorkWeek,
)
from app.models.board import OWNER_ID
from app.modules import enabled_modules
from app.sources.google_health import PROVIDER as GOOGLE


@dataclass(frozen=True)
class Item:
    #: Names the thing, so it alerts once (see `notify_sent`).
    key: str
    #: Its line in the notification body.
    line: str


@dataclass(frozen=True)
class Rule:
    """An Alert's effective settings: its defaults, or your row over them."""

    enabled: bool
    at: time | None = None
    lead_minutes: int | None = None


@dataclass(frozen=True)
class Due:
    """An unticked assignment, as the homework rules see it."""

    uid: str
    title: str
    due_at: datetime
    all_day: bool


@dataclass(frozen=True)
class Shift:
    date: date
    start: time
    end: time


@dataclass(frozen=True)
class HabitTicks:
    """A Habit you tick by hand, and the local days it was done."""

    id: int
    name: str
    icon: str | None
    ticks: frozenset[date]


@dataclass(frozen=True)
class Failing:
    """A Source whose latest run failed, and when this run of failures began."""

    source: str
    #: The upstream's name, as the Status screen writes it ("Canvas").
    label: str
    since: datetime
    #: The latest run's error, as the sync runner wrote it.
    error: str | None = None
    #: True when another Alert already tells you what to do about it.
    covered: bool = False


@dataclass(frozen=True)
class GoogleSignIn:
    """The Google Health connection, as the reconnect rule sees it."""

    #: When you last went through consent; a reconnect makes a new one.
    connected_at: datetime
    #: Google's 7-day deadline for a Testing-status app, if it gave one.
    expires_at: datetime | None
    #: Why Google refused the sign-in, once it has.
    refused: str | None


Collect = Callable[[AsyncSession, datetime, Rule], Awaitable[list[Item]]]


@dataclass(frozen=True)
class Alert:
    id: str
    #: The module that must be on (atlas.yaml) for this Alert to run, or None
    #: for one about Atlas's own plumbing.
    module: str | None
    #: Where a tap lands.
    url: str
    label: str
    #: One line for the settings list, describing the rule.
    detail: str
    default: Rule
    collect: Collect
    title: Callable[[list[Item]], str]
    #: How a lead-time Alert's setting reads: "90 min before", or "6 h after"
    #: for one that waits for something to have gone on that long.
    lead_word: Literal["before", "after"] = "before"


# ── formatting ────────────────────────────────────────────────────────────────


def clock(t: time | datetime) -> str:
    """3:00 PM — the way the Work and School screens write times."""
    return f"{t:%I:%M %p}".lstrip("0")


def _on_day(local: datetime, now: datetime, when: str) -> str:
    """Prefix the weekday when `local` isn't today: "Wed 9:00 AM"."""
    return when if local.date() == now.date() else f"{local:%a} {when}"


def _due_line(d: Due, now: datetime) -> str:
    local = d.due_at.astimezone(now.tzinfo)
    return f"{d.title} · {_on_day(local, now, 'end of day' if d.all_day else clock(local))}"


def _stamp(t: datetime) -> str:
    """A moment, to the minute in UTC, for a sent key."""
    return f"{t.astimezone(UTC):%Y-%m-%dT%H:%M}"


def _key(d: Due) -> str:
    # The due time is part of the key: a moved deadline is a new thing to know.
    return f"{d.uid}@{_stamp(d.due_at)}"


def _at_or_after(now: datetime, at: time) -> bool:
    return now.time() >= at


# ── homework ──────────────────────────────────────────────────────────────────


def pick_evening(now: datetime, at: time, due: Sequence[Due]) -> list[Item]:
    """From `at` on, everything due tomorrow (local day), in one notification."""
    if not _at_or_after(now, at):
        return []
    tomorrow = now.date() + timedelta(days=1)
    hits = [d for d in due if d.due_at.astimezone(now.tzinfo).date() == tomorrow]
    return [Item(_key(d), _due_line(d, now)) for d in sorted(hits, key=lambda d: d.due_at)]


def pick_last_call(now: datetime, lead: timedelta, due: Sequence[Due]) -> list[Item]:
    """`lead` before each due time, until it is due."""
    hits = [d for d in due if d.due_at - lead <= now < d.due_at]
    return [Item(_key(d), _due_line(d, now)) for d in sorted(hits, key=lambda d: d.due_at)]


def pick_overdue(now: datetime, at: time, due: Sequence[Due]) -> list[Item]:
    """Once, from `at` on the morning after the due day. Only that day: an
    older miss isn't news, and a first run mustn't dig up the whole term."""
    if not _at_or_after(now, at):
        return []
    yesterday = now.date() - timedelta(days=1)
    hits = [
        d for d in due
        if d.due_at <= now and d.due_at.astimezone(now.tzinfo).date() == yesterday
    ]
    return [Item(_key(d), d.title) for d in sorted(hits, key=lambda d: d.due_at)]


async def _unticked(session: AsyncSession, now: datetime) -> list[Due]:
    rows = (
        await session.execute(
            select(Assignment)
            .outerjoin(AssignmentStatus, AssignmentStatus.ics_uid == Assignment.ics_uid)
            .where(Assignment.removed_at.is_(None))
            .where(AssignmentStatus.ics_uid.is_(None))
            .where(Assignment.due_at >= now - timedelta(days=2))
            .where(Assignment.due_at < now + timedelta(days=3))
        )
    ).scalars()
    return [Due(a.ics_uid, a.title, a.due_at, a.all_day) for a in rows]


async def _evening(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    return pick_evening(now, rule.at or time(19), await _unticked(session, now))


async def _last_call(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    lead = timedelta(minutes=rule.lead_minutes or 180)
    return pick_last_call(now, lead, await _unticked(session, now))


async def _overdue(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    return pick_overdue(now, rule.at or time(8), await _unticked(session, now))


# ── work ──────────────────────────────────────────────────────────────────────

#: The day from which a missing next Week starts nagging. Monday is 0.
WEEK_NAG_FROM = 4  # Friday


def pick_shift(now: datetime, lead: timedelta, shifts: Sequence[Shift]) -> list[Item]:
    """`lead` before each Shift starts, until it starts."""
    out = []
    for s in shifts:
        start = datetime.combine(s.date, s.start, now.tzinfo)
        if start - lead <= now < start:
            out.append(Item(f"{s.date}@{s.start:%H:%M}", f"{clock(s.start)} – {clock(s.end)}"))
    return out


def pick_week_missing(now: datetime, at: time, next_week_entered: bool) -> list[Item]:
    """From Friday at `at`, once a day, until next Week is entered. On Monday
    it has become this Week, and the nagging stops by itself."""
    if next_week_entered or now.weekday() < WEEK_NAG_FROM or not _at_or_after(now, at):
        return []
    monday = now.date() + timedelta(days=7 - now.weekday())
    sunday = monday + timedelta(days=6)
    span = f"{monday:%b} {monday.day} – {sunday:%b} {sunday.day}"
    return [Item(f"{monday}/{now.date()}", f"Enter your shifts for {span}.")]


async def _shift(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    rows = (
        await session.execute(
            select(WorkShift).where(
                WorkShift.date.in_([now.date(), now.date() + timedelta(days=1)])
            )
        )
    ).scalars()
    lead = timedelta(minutes=rule.lead_minutes or 90)
    return pick_shift(now, lead, [Shift(r.date, r.start_time, r.end_time) for r in rows])


async def _week(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    monday = now.date() + timedelta(days=7 - now.weekday())
    entered = await session.get(WorkWeek, (OWNER_ID, monday)) is not None
    return pick_week_missing(now, rule.at or time(18), entered)


# ── habits ────────────────────────────────────────────────────────────────────

#: Shortest streak worth a nudge: one ticked day isn't a streak yet.
STREAK_MIN = 2


def pick_streaks(now: datetime, at: time, habits: Sequence[HabitTicks]) -> list[Item]:
    """From `at`, each Habit not ticked today whose streak ends yesterday, so
    it breaks at midnight unless you tick it. Once a day, keyed by the day."""
    if not _at_or_after(now, at):
        return []
    today = now.date()
    out = []
    for h in habits:
        if today in h.ticks:
            continue
        run, day = 0, today - timedelta(days=1)
        while day in h.ticks:
            run, day = run + 1, day - timedelta(days=1)
        if run >= STREAK_MIN:
            name = f"{h.icon} {h.name}" if h.icon else h.name
            out.append(Item(f"{h.id}/{today}", f"{name} · {run}-day streak"))
    return out


async def _streaks(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    # Measured habits are left out: Atlas ticks those itself when the day's
    # data arrives, which may be tomorrow morning, so the evening can't judge.
    habits = (
        await session.execute(
            select(Habit).where(Habit.archived_at.is_(None), Habit.metric.is_(None))
        )
    ).scalars().all()
    ticks: dict[int, set[date]] = {h.id: set() for h in habits}
    rows = await session.execute(
        select(HabitEntry.habit_id, HabitEntry.date).where(
            HabitEntry.habit_id.in_(ticks), HabitEntry.done, HabitEntry.date <= now.date()
        )
    )
    for habit_id, day in rows:
        ticks[habit_id].add(day)
    streaks = [HabitTicks(h.id, h.name, h.icon, frozenset(ticks[h.id])) for h in habits]
    return pick_streaks(now, rule.at or time(20), streaks)


# ── sources ───────────────────────────────────────────────────────────────────


#: A failure that means "not set up yet", not "broken": nothing to alert about.
#: The sync runner writes errors as "ExceptionName: message".
_NOT_SET_UP = "NotConnected:"


def pick_failing(now: datetime, after: timedelta, failing: Sequence[Failing]) -> list[Item]:
    """Each Source that has been failing for `after` or longer, unless it was
    never set up or another Alert already says what to do. The key is when the
    failures began, so one outage alerts once and the next one again."""
    out = []
    for f in sorted(failing, key=lambda f: f.since):
        if f.covered or (f.error or "").startswith(_NOT_SET_UP) or now - f.since < after:
            continue
        local = f.since.astimezone(now.tzinfo)
        out.append(
            Item(
                f"{f.source}@{_stamp(f.since)}",
                f"{f.label} · failing since {_on_day(local, now, clock(local))}",
            )
        )
    return out


async def _failing_since(session: AsyncSession, source: str) -> tuple[datetime, str | None] | None:
    """When the current run of failures began, and the latest error, if the
    latest finished run failed."""
    latest = (
        await session.execute(
            select(SyncRun)
            .where(SyncRun.source == source, SyncRun.status != SyncStatus.running)
            .order_by(SyncRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is None or latest.status != SyncStatus.failed:
        return None
    last_ok = (
        await session.execute(
            select(func.max(SyncRun.started_at)).where(
                SyncRun.source == source,
                SyncRun.status.in_([SyncStatus.success, SyncStatus.skipped]),
            )
        )
    ).scalar_one()
    first = select(func.min(SyncRun.started_at)).where(
        SyncRun.source == source, SyncRun.status == SyncStatus.failed
    )
    if last_ok is not None:
        first = first.where(SyncRun.started_at > last_ok)
    return (await session.execute(first)).scalar_one(), latest.error


async def _reconnect_on(session: AsyncSession) -> bool:
    row = await session.get(NotifySetting, (OWNER_ID, "google_reconnect"))
    return row.enabled if row is not None else True


async def _failing(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    google = await _google(session)
    # A lapsed Google sign-in has its own Alert, which says what to do — while
    # that Alert is on. Off, the Source failing Alert is the only word you get.
    google_covered = (
        google is not None and lapsed(now, google) and await _reconnect_on(session)
    )
    failing = []
    for m in enabled_modules():
        if m.source is None:
            continue
        found = await _failing_since(session, m.source)
        if found is not None:
            since, error = found
            covered = m.id == "google_health" and google_covered
            failing.append(Failing(m.source, m.upstream or m.source, since, error, covered))
    return pick_failing(now, timedelta(minutes=rule.lead_minutes or 360), failing)


# ── google health ─────────────────────────────────────────────────────────────


def lapsed(now: datetime, google: GoogleSignIn) -> bool:
    """Google has refused the sign-in, or its 7-day window has run out."""
    return google.refused is not None or (
        google.expires_at is not None and google.expires_at <= now
    )


def pick_reconnect(now: datetime, lead: timedelta, google: GoogleSignIn | None) -> list[Item]:
    """`lead` before the sign-in runs out, then once more when it has run out
    or Google refuses it. Both keys name the consent, so a reconnect starts over."""
    if google is None:
        return []
    consent = _stamp(google.connected_at)
    expires = google.expires_at
    if lapsed(now, google):
        return [Item(f"lapsed@{consent}", google.refused or "Google's 7-day sign-in window ran out")]
    if expires is not None and expires - lead <= now:
        local = expires.astimezone(now.tzinfo)
        return [Item(f"expiring@{consent}", f"Sign-in runs out {_on_day(local, now, clock(local))}")]
    return []


async def _google(session: AsyncSession) -> GoogleSignIn | None:
    token = await session.get(OAuthToken, GOOGLE)
    if token is None:
        return None
    refused = (token.invalid_reason or "Google refused the sign-in") if token.invalid_at else None
    return GoogleSignIn(token.connected_at, token.refresh_expires_at, refused)


async def _reconnect(session: AsyncSession, now: datetime, rule: Rule) -> list[Item]:
    lead = timedelta(minutes=rule.lead_minutes or 24 * 60)
    return pick_reconnect(now, lead, await _google(session))


# ── the catalog ───────────────────────────────────────────────────────────────


def _lines_title(single: str, many: str) -> Callable[[list[Item]], str]:
    return lambda items: single if len(items) == 1 else many.format(n=len(items))


ALERTS: tuple[Alert, ...] = (
    Alert(
        id="homework_evening",
        module="canvas",
        url="/school",
        label="Due tomorrow",
        detail="Every evening, what's due tomorrow and not ticked",
        default=Rule(enabled=True, at=time(19)),
        collect=_evening,
        title=_lines_title("Due tomorrow", "{n} due tomorrow"),
    ),
    Alert(
        id="homework_last_call",
        module="canvas",
        url="/school",
        label="Last call",
        detail="Before each due time, if it isn't ticked",
        default=Rule(enabled=True, lead_minutes=180),
        collect=_last_call,
        title=_lines_title("Due soon", "{n} due soon"),
    ),
    Alert(
        id="homework_overdue",
        module="canvas",
        url="/school",
        label="Overdue",
        detail="The morning after, if it still isn't ticked",
        default=Rule(enabled=True, at=time(8)),
        collect=_overdue,
        title=_lines_title("Overdue", "{n} overdue"),
    ),
    Alert(
        id="work_shift",
        module="work",
        url="/work",
        label="Shift reminder",
        detail="Before each Shift starts",
        default=Rule(enabled=True, lead_minutes=90),
        collect=_shift,
        # A date has one Shift, so this is always one item: "Shift at 3:00 PM".
        title=lambda items: f"Shift at {items[0].line.split(' – ')[0]}",
    ),
    Alert(
        id="work_week_missing",
        module="work",
        url="/work",
        label="Next week not entered",
        detail="From Friday, once a day until next week's shifts are in",
        default=Rule(enabled=True, at=time(18)),
        collect=_week,
        title=lambda items: "Next week isn't in Atlas",
    ),
    Alert(
        id="habit_streak",
        module="habits",
        url="/habits",
        label="Streak at risk",
        detail="Every evening, a streak that breaks at midnight unless you tick it",
        default=Rule(enabled=True, at=time(20)),
        collect=_streaks,
        title=_lines_title("Streak at risk", "{n} streaks at risk"),
    ),
    Alert(
        id="google_reconnect",
        module="google_health",
        url="/status",
        label="Google Health reconnect",
        detail="Before the sign-in runs out, and again if Google refuses it",
        default=Rule(enabled=True, lead_minutes=24 * 60),
        collect=_reconnect,
        title=lambda items: "Reconnect Google Health",
    ),
    Alert(
        id="source_failing",
        module=None,
        url="/status",
        label="Source failing",
        detail="When a Source has kept failing for a while",
        default=Rule(enabled=True, lead_minutes=360),
        collect=_failing,
        title=_lines_title("Source failing", "{n} Sources failing"),
        lead_word="after",
    ),
)

ALERT_BY_ID = {a.id: a for a in ALERTS}


def local_now() -> datetime:
    return datetime.now(local_zone())
