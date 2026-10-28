"""Fill an empty Atlas with believable made-up data, for a look around.

    docker compose exec atlas-api python -m app.demo            # empty DB only
    docker compose exec atlas-api python -m app.demo --force    # wipe + reseed

Writes habits, sleep and activity, assignments and class sessions, and work
shifts for a fictional student — nothing here came from anyone's accounts.
Weather is the one real source: run its sync as usual.

Only runs with `demo: true` in config/atlas.yaml (which also stops the Canvas
and Google Health syncs from reaching upstream, so the rows stay put), and
only on empty tables unless you pass --force. --force deletes every row in the
tables this script fills, so never point it at an install with real data.
"""

import argparse
import asyncio
import random
import sys
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import delete, func, select

from app.clock import local_today, local_zone
from app.config import settings
from app.db import SessionLocal
from app.models import (
    Assignment,
    AssignmentStatus,
    Board,
    ClassSession,
    DailyActivity,
    Habit,
    HabitEntry,
    SleepSession,
    SyncRun,
    SyncStatus,
    WorkShift,
    WorkWeek,
)

#: Child tables first, so --force can clear them in order.
TABLES = (
    HabitEntry,
    Habit,
    SleepSession,
    DailyActivity,
    AssignmentStatus,
    Assignment,
    ClassSession,
    WorkShift,
    WorkWeek,
)

#: name, icon, chance of a tick on a given day.
HABITS = (
    ("Read 20 minutes", "📖", 0.85),
    ("Move 30 minutes", "🏃", 0.7),
    ("Drink 2L of water", "💧", 0.8),
    ("No phone after 11", "🌙", 0.55),
)

COURSES = ("Data Structures", "Statistics II", "Technical Writing")

#: title, course index, days from today (negative = past), all_day.
ASSIGNMENTS = (
    ("Problem Set 4: Hash Tables", 0, -12, True),
    ("Lab 3: Confidence Intervals", 1, -9, False),
    ("Memo Draft", 2, -6, True),
    ("Problem Set 5: Heaps", 0, -3, True),
    ("Quiz 6", 1, -1, False),
    ("Lab 4: Hypothesis Testing", 1, 1, False),
    ("Problem Set 6: Graphs", 0, 2, True),
    ("Peer Review: Memo", 2, 4, True),
    ("Final Report Outline", 2, 8, True),
    ("Midterm Project Proposal", 0, 11, True),
)


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=local_zone())


async def _empty(session) -> bool:
    for table in TABLES:
        if (await session.execute(select(func.count()).select_from(table))).scalar():
            return False
    return True


def _habits(today: date, rng: random.Random) -> tuple[list[Habit], list[HabitEntry]]:
    habits = [Habit(id=i + 1, name=n, icon=icon, sort_order=i) for i, (n, icon, _) in enumerate(HABITS)]
    entries = []
    for habit, (_, _, chance) in zip(habits, HABITS):
        for back in range(1, 70):
            day = today - timedelta(days=back)
            # The last week leans good, so streaks read as a habit taking hold.
            if rng.random() < (chance + 0.15 if back <= 7 else chance):
                entries.append(HabitEntry(habit_id=habit.id, date=day, done_at=_at(day, 21)))
    # Today: half done, half left to tick on camera.
    for habit in habits[:2]:
        entries.append(HabitEntry(habit_id=habit.id, date=today, done_at=_at(today, 8)))
    return habits, entries


def _night(wake: date, rng: random.Random, now: datetime) -> SleepSession:
    start = _at(wake - timedelta(days=1), 23) + timedelta(minutes=rng.randint(-50, 40))
    length = rng.randint(400, 540)
    stages, t, minutes = [], start, {"DEEP": 0, "LIGHT": 0, "REM": 0, "AWAKE": 0}
    end = start + timedelta(minutes=length)
    cycle = 0
    while t < end:
        # ~90-minute cycles: deep sleep front-loaded, REM growing toward morning.
        deep = max(4, 28 - cycle * 7 + rng.randint(-4, 4))
        rem = 10 + cycle * 6 + rng.randint(-3, 3)
        for kind, span in (("LIGHT", rng.randint(25, 40)), ("DEEP", deep), ("LIGHT", rng.randint(10, 20)),
                           ("REM", rem), ("AWAKE", rng.choice((0, 0, 2, 4)))):
            if span <= 0 or t >= end:
                continue
            stop = min(t + timedelta(minutes=span), end)
            stages.append([t.isoformat(), stop.isoformat(), kind])
            minutes[kind] += int((stop - t).total_seconds() // 60)
            t = stop
        cycle += 1
    awake = minutes["AWAKE"] + rng.randint(5, 15)
    return SleepSession(
        id=f"demo-{wake.isoformat()}",
        start_at=start,
        end_at=end,
        wake_date=wake,
        end_utc_offset_s=int(end.utcoffset().total_seconds()),
        is_main=True,
        is_nap=False,
        sleep_type="STAGES",
        processed=True,
        minutes_asleep=length - awake,
        minutes_awake=awake,
        minutes_in_period=length,
        minutes_to_fall_asleep=rng.randint(4, 18),
        deep_minutes=minutes["DEEP"],
        light_minutes=minutes["LIGHT"],
        rem_minutes=minutes["REM"],
        wake_minutes=minutes["AWAKE"],
        stages=stages,
        device="Demo watch",
        raw={"demo": True},
        fetched_at=now,
    )


def _activity(day: date, today: date, rng: random.Random, now: datetime) -> DailyActivity:
    # Today is only part done, so scale it by how much of the day has passed.
    share = 1.0 if day < today else max(0.15, now.astimezone(local_zone()).hour / 22)
    steps = int(rng.randint(5200, 12400) * share)
    return DailyActivity(
        date=day,
        steps=steps,
        resting_hr=rng.randint(57, 64),
        light_minutes=int(rng.randint(140, 230) * share),
        moderate_minutes=int(rng.randint(10, 40) * share),
        vigorous_minutes=int(rng.randint(0, 25) * share),
        calories_kcal=round((1650 + steps * 0.045) * share, 1),
        fetched_at=now,
    )


def _school(today: date, now: datetime) -> list:
    rows: list = []
    for i, (title, course, days, all_day) in enumerate(ASSIGNMENTS):
        day = today + timedelta(days=days)
        uid = f"event-assignment-demo-{i}"
        rows.append(Assignment(
            ics_uid=uid,
            title=title,
            course=COURSES[course],
            due_at=_at(day, 23, 59) if all_day else _at(day, 17),
            all_day=all_day,
            last_seen=now,
        ))
        if days < 0:
            rows.append(AssignmentStatus(ics_uid=uid, done_at=_at(day, 15)))
    # A weekly live session for Statistics II, Tuesdays and Thursdays.
    monday = today - timedelta(days=today.weekday())
    for week in range(-3, 4):
        for weekday in (1, 3):
            day = monday + timedelta(weeks=week, days=weekday)
            rows.append(ClassSession(
                ics_uid=f"event-calendar-event-demo-{day.isoformat()}",
                title="Statistics II: live session",
                course=COURSES[1],
                start_at=_at(day, 18),
                end_at=_at(day, 19, 15),
                join_url="https://example.com/join",
                last_seen=now,
            ))
    return rows


def _work(today: date) -> list:
    rows: list = []
    monday = today - timedelta(days=today.weekday())
    #: weekday -> (start, end); the rest are days off.
    pattern = {0: (9, 15), 2: (12, 18), 4: (9, 15), 5: (10, 16)}
    for week in (-1, 0, 1):
        start = monday + timedelta(weeks=week)
        rows.append(WorkWeek(week_start=start))
        for weekday, (a, b) in pattern.items():
            rows.append(WorkShift(date=start + timedelta(days=weekday), start_time=time(a), end_time=time(b)))
    return rows


async def seed(force: bool) -> int:
    if not settings.demo:
        print("Refusing: add `demo: true` to config/atlas.yaml first. See "
              "https://fazorath.github.io/atlas-dashboard/start/demo-data/")
        return 1

    async with SessionLocal() as session:
        if not await _empty(session):
            if not force:
                print("Refusing: Atlas already has habits, sleep, school or work rows. "
                      "Pass --force to delete them and reseed.")
                return 1
            for table in TABLES:
                await session.execute(delete(table))
            # Saved Boards may point at Widgets the reseed changes; start fresh.
            await session.execute(delete(Board))

        rng = random.Random(7)
        today = local_today()
        now = datetime.now(UTC)
        habits, entries = _habits(today, rng)
        session.add_all(habits)
        await session.flush()
        session.add_all(entries)
        session.add_all(_night(today - timedelta(days=back), rng, now) for back in range(35))
        session.add_all(_activity(today - timedelta(days=back), today, rng, now) for back in range(35))
        session.add_all(_school(today, now))
        session.add_all(_work(today))
        # A fresh run per seeded source, so Freshness reads "just now".
        for source in ("school", "sleep"):
            session.add(SyncRun(source=source, status=SyncStatus.success, started_at=now,
                                finished_at=now, duration_ms=0, rows_written=0))
        await session.commit()
        # Habit ids were set by hand; move the sequence past them.
        await session.execute(
            select(func.setval("habits_id_seq", select(func.max(Habit.id)).scalar_subquery()))
        )
        await session.commit()

    print(f"Seeded {len(HABITS)} habits, 35 nights, {len(ASSIGNMENTS)} assignments and 3 weeks of shifts. "
          "Run the weather sync too: curl -X POST 127.0.0.1:8187/api/sync/weather")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.demo", description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="delete existing rows in the seeded tables first")
    sys.exit(asyncio.run(seed(parser.parse_args().force)))


if __name__ == "__main__":
    main()
