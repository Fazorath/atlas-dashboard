"""The Study planner: open Assignments turned into Study blocks in free time.

A plan is worked out on every read from what is already stored — assignments,
Class sessions, Shifts — and never saved, so a moved due date, a new Shift or
a tick lands on the next read with nothing to reconcile.
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class OpenAssignment:
    """An Assignment not yet ticked, due inside the plan's window."""

    uid: str
    title: str
    course: str | None
    due_at: datetime


@dataclass(frozen=True)
class Busy:
    """Time already spoken for: a Shift or a Class session."""

    start: datetime
    end: datetime


#: How long an assignment takes, guessed from its title: the first word that
#: matches wins, so the bigger kinds come first ("Final paper" is a paper).
EFFORT: tuple[tuple[str, int], ...] = (
    ("paper", 180),
    ("essay", 180),
    ("project", 180),
    ("report", 180),
    ("exam", 240),
    ("midterm", 240),
    ("final", 240),
    ("test", 240),
    ("problem set", 90),
    ("homework", 90),
    ("lab", 90),
    ("quiz", 45),
    ("discussion", 30),
    ("reply", 30),
    ("post", 30),
)
DEFAULT_EFFORT = 60


@dataclass(frozen=True)
class Rules:
    earliest: time = time(8)
    latest: time = time(22)
    max_block: timedelta = timedelta(minutes=90)
    min_block: timedelta = timedelta(minutes=30)
    #: Kept clear either side of a Shift or class, and between two blocks.
    gap: timedelta = timedelta(minutes=15)
    #: Work is planned to finish this long before the due time.
    buffer: timedelta = timedelta(hours=2)
    #: Weekdays with no study, Monday 0.
    days_off: frozenset[int] = frozenset()
    #: Your own (word, minutes), checked before EFFORT.
    effort: tuple[tuple[str, int], ...] = ()


@dataclass(frozen=True)
class Block:
    uid: str
    title: str
    course: str | None
    start: datetime
    end: datetime
    due_at: datetime


@dataclass
class Plan:
    blocks: list[Block] = field(default_factory=list)
    #: (assignment, minutes that found no room before its due time).
    short: list[tuple[OpenAssignment, int]] = field(default_factory=list)


def effort(title: str, rules: Rules) -> int:
    """Minutes an Assignment is guessed to take, from its title."""
    folded = title.casefold()
    for word, minutes in (*rules.effort, *EFFORT):
        if re.search(rf"\b{re.escape(word.casefold())}\b", folded):
            return minutes
    return DEFAULT_EFFORT


def _windows(now: datetime, until: datetime, rules: Rules, zone: ZoneInfo) -> list[list[datetime]]:
    """Each local day's earliest–latest hours from now to `until`."""
    out = []
    day = now.astimezone(zone).date()
    while datetime.combine(day, rules.earliest, zone) < until:
        if day.weekday() in rules.days_off:
            day += timedelta(days=1)
            continue
        start = max(datetime.combine(day, rules.earliest, zone), now)
        end = min(datetime.combine(day, rules.latest, zone), until)
        if end > start:
            out.append([start, end])
        day += timedelta(days=1)
    return out


def _next_quarter(now: datetime) -> datetime:
    floor = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
    return floor if floor == now else floor + timedelta(minutes=15)


def _subtract(free: list[list[datetime]], busy: list[Busy], gap: timedelta) -> list[list[datetime]]:
    for b in busy:
        lo, hi = b.start - gap, b.end + gap
        free = [
            piece
            for start, end in free
            for piece in ([start, min(end, lo)], [max(start, hi), end])
            if piece[1] > piece[0]
        ]
    return free


def plan(
    now: datetime,
    assignments: list[OpenAssignment],
    busy: list[Busy],
    rules: Rules,
    zone: ZoneInfo,
) -> Plan:
    """Study blocks from the next quarter hour on, in the free time between
    `busy` and inside each day's hours. Earliest due first, and each one is
    planned whole before the next, so later work never crowds out something
    due sooner. Effort is the full guess on every read: time already studied
    isn't known, as blocks are never stored."""
    out = Plan()
    now = _next_quarter(now)
    ordered = sorted(assignments, key=lambda a: (a.due_at, a.title))
    free = _windows(now, max((a.due_at for a in ordered), default=now), rules, zone)
    free = _subtract(free, busy, rules.gap)
    for a in ordered:
        left = timedelta(minutes=effort(a.title, rules))
        days: set[date] = set()
        # Already inside the buffer: whatever time is left before it's due.
        deadline = max(a.due_at - rules.buffer, min(a.due_at, now + rules.max_block))
        # One block a day first, so a paper is spread over the week rather
        # than eating one evening; then whatever is left doubles up.
        for one_a_day in (True, False):
            for slot in free:
                if one_a_day and slot[0].astimezone(zone).date() in days:
                    continue
                while left > timedelta(0):
                    length = min(rules.max_block, left, min(slot[1], deadline) - slot[0])
                    if length < min(rules.min_block, left):
                        break
                    start, end = slot[0], slot[0] + length
                    out.blocks.append(Block(a.uid, a.title, a.course, start, end, a.due_at))
                    slot[0] = end + rules.gap
                    left -= length
                    days.add(start.astimezone(zone).date())
                    if one_a_day:
                        break
        if left > timedelta(0):
            out.short.append((a, int(left.total_seconds() // 60)))
    out.blocks.sort(key=lambda b: b.start)
    return out
