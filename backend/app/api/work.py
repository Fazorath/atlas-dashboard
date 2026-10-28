"""Work — weekly shifts, typed in by hand.

No sync and no registry entry, like habits: you are the upstream. The Edit
week sheet saves a whole week at once (PUT replaces it), and DELETE turns a
week back into "not entered" rather than "all days off".

A Schedule photo (ADR 0006) is POSTed as the raw image body; it is read in the
background into a Draft week, which counts for nothing until the week is
saved. Off unless `photo:` is set in work.yaml and the image has vision.
"""

import asyncio
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import ClientDisconnect

from app.clock import local_today
from app.db import get_session
from app.models import DraftStatus, WorkDraft, WorkShift, WorkWeek
from app.models.board import OWNER_ID
from app.schedule_photo import reader
from app.schemas.work import PhotoRead, ShiftOut, WeekIn, WeekOut, WorkSummary

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
    # Saving is what the Draft week the rows came from was waiting for. Only
    # that one: a Draft that finished after the sheet opened was never seen.
    if body.draft_id is not None:
        await session.execute(
            delete(WorkDraft).where(
                WorkDraft.user_id == OWNER_ID,
                WorkDraft.week_start == week_start,
                WorkDraft.id == body.draft_id,
            )
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


#: A phone photo, already shrunk by the browser; generous for a full-size one.
MAX_PHOTO = 20 * 1024 * 1024


def _stale_cutoff() -> datetime:
    """Rows still `reading` from before this are dead tasks, not reads in progress."""
    return datetime.now(UTC) - reader.STALE_AFTER


def _is_stale(draft: WorkDraft) -> bool:
    created = draft.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    return draft.status == DraftStatus.reading and created < _stale_cutoff()


# One read at a time. This lock only works because Atlas runs a single uvicorn
# process (no `--workers`, ADR 0006): with more than one API process, replace it
# with a partial unique index on the drafts table (one `reading` row per user).
_start_lock = asyncio.Lock()


async def _read_capped(request: Request) -> bytes:
    """The request body, refused with 413 as soon as it passes MAX_PHOTO."""
    too_large = HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "That photo is too large.")
    declared = request.headers.get("content-length", "")
    if declared.isascii() and declared.isdigit() and int(declared) > MAX_PHOTO:
        raise too_large
    data = bytearray()
    try:
        async for chunk in request.stream():
            data += chunk
            if len(data) > MAX_PHOTO:
                raise too_large
    except ClientDisconnect:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The photo didn't finish sending.") from None
    return bytes(data)


def _photo_on() -> None:
    if not reader.available():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reading schedule photos isn't set up.")


@router.post("/photo", response_model=PhotoRead, status_code=status.HTTP_202_ACCEPTED)
async def read_photo(
    request: Request,
    week: date = Query(description="The open week, used if the paper shows no dates."),
    session: AsyncSession = Depends(get_session),
) -> PhotoRead:
    """Start reading a Schedule photo. Answers at once; poll GET /photo."""
    _photo_on()
    _check_monday(week)
    data = await _read_capped(request)
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No photo in the request.")

    # The busy check and the insert of the new `reading` row must not interleave
    # with another upload's, or both pass the check.
    async with _start_lock:
        busy = (
            await session.execute(
                select(WorkDraft.id).where(
                    WorkDraft.user_id == OWNER_ID,
                    WorkDraft.status == DraftStatus.reading,
                    WorkDraft.created_at >= _stale_cutoff(),
                )
            )
        ).first()
        if busy:
            raise HTTPException(status.HTTP_409_CONFLICT, "Already reading a photo.")
        # A retake replaces the last failure (and any read that died without
        # saying so): only the newest one is worth showing.
        await session.execute(
            delete(WorkDraft).where(
                WorkDraft.user_id == OWNER_ID,
                or_(
                    WorkDraft.status == DraftStatus.failed,
                    and_(WorkDraft.status == DraftStatus.reading, WorkDraft.created_at < _stale_cutoff()),
                ),
            )
        )
        draft = WorkDraft(user_id=OWNER_ID, status=DraftStatus.reading)
        session.add(draft)
        await session.commit()
    reader.start(draft.id, data, week)
    return PhotoRead.model_validate(draft, from_attributes=True)


@router.get("/photo", response_model=list[PhotoRead])
async def photo_reads(session: AsyncSession = Depends(get_session)) -> list[PhotoRead]:
    """Reads in progress, failures to show, and Draft weeks, newest first."""
    rows = (
        await session.execute(
            select(WorkDraft)
            .where(WorkDraft.user_id == OWNER_ID)
            .order_by(WorkDraft.created_at.desc())
        )
    ).scalars()
    out = []
    for r in rows:
        read = PhotoRead.model_validate(r, from_attributes=True)
        if _is_stale(r):
            read = read.model_copy(
                update={"status": DraftStatus.failed, "error": "The read never finished. Try again."}
            )
        out.append(read)
    return out


@router.delete("/photo/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_photo(draft_id: int, session: AsyncSession = Depends(get_session)) -> Response:
    """Discard a Draft week, or dismiss a failed (or long-dead reading) read."""
    await session.execute(
        delete(WorkDraft).where(
            WorkDraft.user_id == OWNER_ID,
            WorkDraft.id == draft_id,
            or_(WorkDraft.status != DraftStatus.reading, WorkDraft.created_at < _stale_cutoff()),
        )
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
