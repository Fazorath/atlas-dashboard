"""Measured habits (ADR 0001): a Habit linked to a Health figure and a target,
ticked by Atlas when that day's data arrives.

Habits used to have no Source. Two of them — "8 Hours of Sleep", "10k Steps" —
duplicated figures Atlas already archives from Health and went unticked, so a
habit may now name one of the `METRICS` below and a target. This is the first
place one Area reads another's data.

The rules, in the order they are applied to each (habit, day):

1. A manual row — a tick, or a manual untick (`done = false`) — is yours and is
   never touched. A manual tick always wins.
2. Otherwise the day is ticked (`source = "measured"`) when the figure reaches
   the target, and a measured tick is removed when it no longer does — a
   session Google later merged, a corrected step count.
3. A day with no figure at all is not met: a watch that never synced is not a
   night of eight hours.

A Night belongs to the date you woke up, so "8 Hours of Sleep" ticks the
morning after. Steps tick as soon as the day's running total crosses the line,
and only settle once that day has synced for the last time.
"""

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today, local_zone
from app.models import DailyActivity, Habit, HabitEntry
from app.nights import main_nights

log = logging.getLogger(__name__)

#: How far back a normal pass re-checks. Matches the Health sync's own
#: lookback, which is how far back Google may still revise a figure.
RECHECK_DAYS = 7
#: How far back linking a habit (or changing its target) reaches. Never before
#: the habit was created: backfilling would move the day it "began".
LINK_BACKFILL_DAYS = 90


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    unit: str
    default_target: float


METRICS: dict[str, Metric] = {
    m.key: m
    for m in (
        Metric("sleep_hours", "Hours asleep", "h", 8),
        Metric("steps", "Steps", "steps", 10_000),
        Metric("active_minutes", "Active minutes", "min", 30),
    )
}


async def values_by_day(
    session: AsyncSession, metric: str, start: date, end: date
) -> dict[date, float]:
    """The figure for every local day in [start, end] that has one."""
    if metric == "sleep_hours":
        return {
            n.wake_date: n.minutes_asleep / 60
            for n in await main_nights(session, start, end)
            if n.minutes_asleep is not None
        }

    rows = (
        await session.execute(
            select(DailyActivity)
            .where(DailyActivity.date >= start)
            .where(DailyActivity.date <= end)
        )
    ).scalars()
    out: dict[date, float] = {}
    for row in rows:
        if metric == "steps" and row.steps is not None:
            out[row.date] = float(row.steps)
        elif metric == "active_minutes" and (
            row.moderate_minutes is not None or row.vigorous_minutes is not None
        ):
            out[row.date] = float((row.moderate_minutes or 0) + (row.vigorous_minutes or 0))
    return out


def _days(start: date, end: date) -> Iterable[date]:
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


async def apply_measured(
    session: AsyncSession,
    habit_ids: list[int] | None = None,
    days: int = RECHECK_DAYS,
) -> int:
    """Tick and untick measured days for the last `days`. Returns rows changed.

    Commits. Called after every Health sync, and for one habit when it is
    linked or its target changes.
    """
    stmt = (
        select(Habit)
        .where(Habit.metric.is_not(None))
        .where(Habit.target.is_not(None))
        .where(Habit.archived_at.is_(None))
    )
    if habit_ids is not None:
        stmt = stmt.where(Habit.id.in_(habit_ids))
    habits = (await session.execute(stmt)).scalars().all()

    today = local_today()
    changed = 0
    for habit in habits:
        if habit.metric not in METRICS:
            continue
        created = habit.created_at.astimezone(local_zone()).date()
        start = max(today - timedelta(days=days - 1), created)
        if start > today:
            continue

        values = await values_by_day(session, habit.metric, start, today)
        existing = {
            e.date: e
            for e in (
                await session.execute(
                    select(HabitEntry)
                    .where(HabitEntry.habit_id == habit.id)
                    .where(HabitEntry.date >= start)
                    .where(HabitEntry.date <= today)
                )
            ).scalars()
        }

        tick: list[date] = []
        untick: list[date] = []
        for day in _days(start, today):
            row = existing.get(day)
            if row is not None and row.source == "manual":
                continue
            value = values.get(day)
            met = value is not None and value >= habit.target
            if met and row is None:
                tick.append(day)
            elif not met and row is not None:
                untick.append(day)

        if tick:
            await session.execute(
                insert(HabitEntry)
                .values(
                    [{"habit_id": habit.id, "date": d, "done": True, "source": "measured"}
                     for d in tick]
                )
                .on_conflict_do_nothing()
            )
        if untick:
            await session.execute(
                delete(HabitEntry)
                .where(HabitEntry.habit_id == habit.id)
                .where(HabitEntry.date.in_(untick))
                .where(HabitEntry.source == "measured")
            )
        changed += len(tick) + len(untick)
        if tick or untick:
            log.info("measured habit %s: +%d -%d", habit.name, len(tick), len(untick))

    await session.commit()
    return changed
