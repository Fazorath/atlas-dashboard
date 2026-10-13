"""Work — weekly shifts, typed in from the paper schedule.

No sync and no registry entry, like habits: you are the upstream. The Edit
week sheet saves a whole week at once (PUT replaces it), and DELETE turns a
week back into "not entered" rather than "all days off".
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today
from app.db import get_session
from app.models import WorkShift, WorkWeek
from app.models.board import OWNER_ID
from app.schemas.work import ShiftOut, WeekIn, WeekOut, WorkSummary

router = APIRouter(prefix="/work", tags=["work"])

WeekStart = Path(description="The Monday the week starts on, YYYY-MM-DD.")


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _check_monday(week_start: date) -> date:
    if week_start.weekday() != 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "A week starts on a Monday."
        )
    return week_start


def _minutes(shift: WorkShift) -> int:
    start = datetime.combine(shift.date, shift.start_time)
    end = datetime.combine(shift.date, shift.end_time)
    return int((end - start).total_seconds() // 60)


def _shift_out(shift: WorkShift) -> ShiftOut:
    return ShiftOut(
        date=shift.date, start=shift.start_time, end=shift.end_time, minutes=_minutes(shift)
    )


async def _week(session: AsyncSession, week_start: date) -> WeekOut:
    saved = (
        await session.execute(
            select(WorkWeek.saved_at).where(
                WorkWeek.user_id == OWNER_ID, WorkWeek.week_start == week_start
            )
        )
    ).scalar_one_or_none()
    rows = (
        await session.execute(
            select(WorkShift)
            .where(
                WorkShift.user_id == OWNER_ID,
                WorkShift.date >= week_start,
                WorkShift.date < week_start + timedelta(days=7),
            )
            .order_by(WorkShift.date)
        )
    ).scalars()
    shifts = [_shift_out(s) for s in rows]
    return WeekOut(
        week_start=week_start,
        entered=saved is not None,
        saved_at=saved,
        shifts=shifts,
        total_minutes=sum(s.minutes for s in shifts),
    )


@router.get("/", response_model=WorkSummary)
async def summary(session: AsyncSession = Depends(get_session)) -> WorkSummary:
    today = local_today()
    this_monday = monday_of(today)
    upcoming = (
        await session.execute(
            select(WorkShift)
            .where(WorkShift.user_id == OWNER_ID, WorkShift.date > today)
            .order_by(WorkShift.date)
            .limit(1)
        )
    ).scalar_one_or_none()
    return WorkSummary(
        today=today,
        this_week=await _week(session, this_monday),
        next_week=await _week(session, this_monday + timedelta(days=7)),
        next_shift=_shift_out(upcoming) if upcoming else None,
    )


@router.get("/weeks/{week_start}", response_model=WeekOut)
async def get_week(
    week_start: date = WeekStart, session: AsyncSession = Depends(get_session)
) -> WeekOut:
    return await _week(session, _check_monday(week_start))


@router.put("/weeks/{week_start}", response_model=WeekOut)
async def save_week(
    body: WeekIn, week_start: date = WeekStart, session: AsyncSession = Depends(get_session)
) -> WeekOut:
    _check_monday(week_start)
    days = [s.date for s in body.shifts]
    if any(not (week_start <= d < week_start + timedelta(days=7)) for d in days):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Every shift has to fall inside the week."
        )
    if len(set(days)) != len(days):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One shift a day.")

    # Replace the week whole: a day left out of the body is a day off.
    await session.execute(
        delete(WorkShift).where(
            WorkShift.user_id == OWNER_ID,
            WorkShift.date >= week_start,
            WorkShift.date < week_start + timedelta(days=7),
        )
    )
    session.add_all(
        WorkShift(user_id=OWNER_ID, date=s.date, start_time=s.start, end_time=s.end)
        for s in body.shifts
    )
    stmt = insert(WorkWeek).values(user_id=OWNER_ID, week_start=week_start)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["user_id", "week_start"], set_={"saved_at": func.now()}
        )
    )
    await session.commit()
    return await _week(session, week_start)


@router.delete("/weeks/{week_start}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_week(
    week_start: date = WeekStart, session: AsyncSession = Depends(get_session)
) -> Response:
    _check_monday(week_start)
    await session.execute(
        delete(WorkShift).where(
            WorkShift.user_id == OWNER_ID,
            WorkShift.date >= week_start,
            WorkShift.date < week_start + timedelta(days=7),
        )
    )
    await session.execute(
        delete(WorkWeek).where(WorkWeek.user_id == OWNER_ID, WorkWeek.week_start == week_start)
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
