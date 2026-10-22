"""Habits. The only router that takes writes from the dashboard.

No sync and no registry entry: there is no upstream to fall out of touch with,
so a "synced 4m ago" line in the Sources strip would describe nothing. The
screens read these endpoints directly.

Streaks and completion are computed in SQL on every read (gaps-and-islands over
habit_entries), never stored. At one person's scale that is a few thousand rows
at most, and it means a backfilled tick can't leave a stale counter behind.

Measured habits (ADR 0001, `app/measured.py`) add one wrinkle: a row with
`done = false` is a manual untick, so every count below filters on `e.done`.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today, local_zone
from app.db import get_session
from app.measured import LINK_BACKFILL_DAYS, METRICS, apply_measured, values_by_day
from app.models import Habit, HabitEntry
from app.schemas.habits import HabitDay, HabitIn, HabitOut, HabitPatch, HistoryDay, MetricOut

router = APIRouter(prefix="/habits", tags=["habits"])

# Longest heatmap the detail page may ask for: a year, plus the partial week
# that aligns its first column to a Monday.
MAX_HISTORY_DAYS = 371

# One statement for the day view. `began` is the earlier of creation and the
# oldest tick, so backfilling before you added the habit still counts. Every
# date comparison is against the local day, hence the casts and AT TIME ZONE.
_DAY_SQL = text(
    """
    WITH h AS (
      SELECT habits.id, habits.name, habits.icon, habits.sort_order, habits.metric, habits.target,
             LEAST(
               (habits.created_at AT TIME ZONE :tz)::date,
               COALESCE((SELECT min(e.date) FROM habit_entries e
                          WHERE e.habit_id = habits.id AND e.done),
                        'infinity'::date)
             ) AS began
      FROM habits
      WHERE (CAST(:habit_id AS integer) IS NULL AND habits.archived_at IS NULL)
         OR habits.id = CAST(:habit_id AS integer)
    ),
    runs AS (
      SELECT e.habit_id, e.date,
             e.date - (row_number() OVER (PARTITION BY e.habit_id ORDER BY e.date))::int AS grp
      FROM habit_entries e
      WHERE e.date <= CAST(:today AS date) AND e.done AND e.habit_id IN (SELECT id FROM h)
    ),
    islands AS (
      SELECT habit_id, max(date) AS last_day, count(*) AS len
      FROM runs GROUP BY habit_id, grp
    ),
    streaks AS (
      SELECT habit_id,
             max(len) AS longest,
             max(len) FILTER (WHERE last_day >= CAST(:today AS date) - 1) AS current
      FROM islands GROUP BY habit_id
    ),
    recent AS (
      SELECT habit_id, count(*) AS n
      FROM habit_entries
      WHERE date BETWEEN CAST(:today AS date) - 29 AND CAST(:today AS date) AND done
      GROUP BY habit_id
    )
    SELECT h.id, h.name, h.icon, h.metric, h.target,
           EXISTS (
             SELECT 1 FROM habit_entries e
             WHERE e.habit_id = h.id AND e.date = CAST(:day AS date) AND e.done
           ) AS done,
           EXISTS (
             SELECT 1 FROM habit_entries e
             WHERE e.habit_id = h.id AND e.date = CAST(:day AS date) AND e.done
               AND e.source = 'measured'
           ) AS auto,
           COALESCE(s.current, 0) AS current_streak,
           COALESCE(s.longest, 0) AS longest_streak,
           COALESCE(r.n, 0)::float
             / GREATEST(1, LEAST(30, CAST(:today AS date) - h.began + 1)) AS completion_30d
    FROM h
    LEFT JOIN streaks s ON s.habit_id = h.id
    LEFT JOIN recent r ON r.habit_id = h.id
    ORDER BY h.sort_order, h.id
    """
)

# A habit counts toward a day from the day it began until the day it was
# archived (exclusive), so archiving one doesn't rewrite the months it was live
# and adding one doesn't paint last spring as a failure.
_HISTORY_SQL = text(
    """
    WITH h AS (
      SELECT habits.id,
             LEAST(
               (habits.created_at AT TIME ZONE :tz)::date,
               COALESCE((SELECT min(e.date) FROM habit_entries e
                          WHERE e.habit_id = habits.id AND e.done),
                        'infinity'::date)
             ) AS began,
             (habits.archived_at AT TIME ZONE :tz)::date AS ended
      FROM habits
    ),
    days AS (
      SELECT generate_series(CAST(:start AS date), CAST(:today AS date), interval '1 day')::date
        AS day
    )
    SELECT d.day AS date,
           (SELECT count(*) FROM habit_entries e JOIN h ON h.id = e.habit_id
             WHERE e.date = d.day AND e.done AND (h.ended IS NULL OR h.ended > d.day)) AS done,
           (SELECT count(*) FROM h
             WHERE h.began <= d.day AND (h.ended IS NULL OR h.ended > d.day)) AS total
    FROM days d
    ORDER BY d.day
    """
)


async def _day_rows(
    session: AsyncSession, day: date, habit_id: int | None = None
) -> list[HabitDay]:
    result = await session.execute(
        _DAY_SQL,
        {"tz": local_zone().key, "today": local_today(), "day": day, "habit_id": habit_id},
    )
    rows = [HabitDay(date=day, **row) for row in result.mappings()]
    # A Measured habit's row also says what the figure was, so the screen can
    # read "6h 30m of 8h" rather than leave you guessing why it isn't ticked.
    for metric in {r.metric for r in rows if r.metric in METRICS}:
        values = await values_by_day(session, metric, day, day)
        for r in rows:
            if r.metric == metric:
                r.value = values.get(day)
    return rows


def _check_day(day: date | None) -> date:
    today = local_today()
    if day is None:
        return today
    if day > today:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Can't tick a day that hasn't happened."
        )
    return day


async def _get_habit(session: AsyncSession, habit_id: int) -> Habit:
    habit = await session.get(Habit, habit_id)
    if habit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such habit.")
    return habit


@router.get("/today", response_model=list[HabitDay])
async def habits_today(
    day: date | None = Query(None, alias="date", description="Local day, defaults to today."),
    session: AsyncSession = Depends(get_session),
) -> list[HabitDay]:
    """Active habits with their state on `date` (default today)."""
    return await _day_rows(session, _check_day(day))


@router.post("/{habit_id}/toggle", response_model=HabitDay)
async def toggle_habit(
    habit_id: int,
    day: date | None = Query(None, alias="date", description="Local day, defaults to today."),
    session: AsyncSession = Depends(get_session),
) -> HabitDay:
    """Flip one habit on one day. Past days are allowed — that's backfilling."""
    day = _check_day(day)
    habit = await _get_habit(session, habit_id)
    if habit.archived_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Habit is archived; restore it first.")

    if habit.metric is not None:
        # A Measured habit: whatever you set is written down as manual, tick or
        # untick, so the next sync can't undo it (a manual tick always wins).
        entry = await session.get(HabitEntry, (habit_id, day))
        done = not (entry is not None and entry.done)
        stmt = insert(HabitEntry).values(
            habit_id=habit_id, date=day, done=done, source="manual", done_at=func.now()
        )
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["habit_id", "date"],
                set_={"done": done, "source": "manual", "done_at": func.now()},
            )
        )
    else:
        removed = await session.execute(
            delete(HabitEntry)
            .where(HabitEntry.habit_id == habit_id, HabitEntry.date == day)
            .returning(HabitEntry.habit_id)
        )
        if removed.first() is None:
            # DO NOTHING rather than fail: a double tap racing itself should
            # land as one tick, not a 500.
            await session.execute(
                insert(HabitEntry).values(habit_id=habit_id, date=day).on_conflict_do_nothing()
            )
    await session.commit()
    return (await _day_rows(session, day, habit_id=habit_id))[0]


@router.get("/history", response_model=list[HistoryDay])
async def habits_history(
    days: int = Query(119, ge=1, le=MAX_HISTORY_DAYS),
    session: AsyncSession = Depends(get_session),
) -> list[HistoryDay]:
    """Per-day done/total for the last `days` days, oldest first — the heatmap."""
    today = local_today()
    result = await session.execute(
        _HISTORY_SQL,
        {"tz": local_zone().key, "today": today, "start": today - timedelta(days=days - 1)},
    )
    return [HistoryDay(**row) for row in result.mappings()]


@router.get("/metrics", response_model=list[MetricOut])
async def habit_metrics() -> list[MetricOut]:
    """The Health figures a habit can be linked to."""
    return [MetricOut(**vars(m)) for m in METRICS.values()]


@router.get("/", response_model=list[HabitOut])
async def list_habits(
    archived: bool = Query(False, description="List archived habits instead of active ones."),
    session: AsyncSession = Depends(get_session),
) -> list[Habit]:
    condition = Habit.archived_at.is_not(None) if archived else Habit.archived_at.is_(None)
    result = await session.scalars(
        select(Habit).where(condition).order_by(Habit.sort_order, Habit.id)
    )
    return list(result)


@router.post("/", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
async def create_habit(body: HabitIn, session: AsyncSession = Depends(get_session)) -> Habit:
    # New habits go to the bottom of the list.
    last = await session.scalar(select(func.max(Habit.sort_order)))
    habit = Habit(name=body.name, icon=body.icon, sort_order=(last or 0) + 1)
    session.add(habit)
    await session.commit()
    await session.refresh(habit)
    return habit


@router.patch("/{habit_id}", response_model=HabitOut)
async def update_habit(
    habit_id: int, body: HabitPatch, session: AsyncSession = Depends(get_session)
) -> Habit:
    habit = await _get_habit(session, habit_id)
    changes = body.model_dump(exclude_unset=True)
    for field in ("name", "sort_order", "archived"):
        if field in changes and changes[field] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} can't be null")
    for field in ("name", "icon", "sort_order"):
        if field in changes:
            setattr(habit, field, changes[field])
    if "archived" in changes:
        habit.archived_at = datetime.now(local_zone()) if changes["archived"] else None

    relink = "metric" in changes or "target" in changes
    if "metric" in changes:
        metric = changes["metric"]
        if metric is not None and metric not in METRICS:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"unknown metric {metric!r}; known: {sorted(METRICS)}",
            )
        habit.metric = metric
        if metric is None:
            habit.target = None
            # Measured ticks stay ticks; a manual untick means nothing on an
            # ordinary habit, so it goes back to being an absent row.
            await session.execute(
                delete(HabitEntry).where(HabitEntry.habit_id == habit_id, ~HabitEntry.done)
            )
        elif "target" not in changes and habit.target is None:
            habit.target = METRICS[metric].default_target
    if "target" in changes and habit.metric is not None:
        if changes["target"] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "target can't be null")
        habit.target = changes["target"]

    await session.commit()
    if relink and habit.metric is not None:
        await apply_measured(session, [habit_id], days=LINK_BACKFILL_DAYS)
    await session.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_habit(habit_id: int, session: AsyncSession = Depends(get_session)) -> Response:
    """Gone for good, ticks included. Archive is the normal way out; this is
    for the habit you added by mistake."""
    habit = await _get_habit(session, habit_id)
    await session.delete(habit)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
