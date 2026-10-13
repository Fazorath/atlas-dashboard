"""School — Phase 6. Reads the archive, never the feed.

Same bargain as weather: Canvas is touched only by the hourly sync, so a dead
feed costs freshness and not the card. The one write here is the done tick,
which lands in `assignment_status` — a table the sync never names.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_zone
from app.config import settings
from app.db import get_session
from app.models import Assignment, AssignmentStatus, ClassSession
from app.schemas.school import AssignmentOut, ClassOut, SchoolSummary

router = APIRouter(prefix="/school", tags=["school"])

NOT_CONFIGURED = (
    "Copy your feed link from Canvas (Calendar, then Calendar Feed) into "
    ".env as CANVAS_ICS_URL, then restart atlas-api."
)
NO_DATA = "No assignments archived yet — run POST /api/sync/school."

#: How far back an unticked assignment still counts as overdue. The first sync
#: archives the whole term the feed covers, and without a cut-off every old
#: assignment you handed in but never ticked would sit on the card forever.
OVERDUE_DAYS = 7
#: A class with no end time is treated as this long, for "in progress".
DEFAULT_CLASS = timedelta(hours=1)


def _local_midnight(now: datetime, plus_days: int = 0) -> datetime:
    """Local midnight `plus_days` after today, as UTC. Wall-clock arithmetic, so
    a DST day still resolves to the right instant."""
    local = now.astimezone(local_zone()).replace(hour=0, minute=0, second=0, microsecond=0)
    return (local + timedelta(days=plus_days)).astimezone(UTC)


def _select():
    return (
        select(Assignment, AssignmentStatus.done_at)
        .outerjoin(AssignmentStatus, AssignmentStatus.ics_uid == Assignment.ics_uid)
        .where(Assignment.removed_at.is_(None))
    )


def course_label(course: str | None) -> str | None:
    """Your short label for a course, applied on read so the archive keeps
    Canvas's own name and a relabel never needs a resync."""
    if course is None:
        return None
    folded = course.casefold()
    return next((label for frag, label in settings.course_labels if frag in folded), course)


def _out(row: Assignment, done_at: datetime | None, now: datetime) -> AssignmentOut:
    return AssignmentOut(
        ics_uid=row.ics_uid,
        title=row.title,
        course=course_label(row.course),
        course_full=row.course,
        due_at=row.due_at,
        all_day=row.all_day,
        url=row.url,
        done=done_at is not None,
        done_at=done_at,
        overdue=done_at is None and row.due_at < now,
    )


def _class_out(row: ClassSession, now: datetime) -> ClassOut:
    end = row.end_at or row.start_at + DEFAULT_CLASS
    return ClassOut(
        ics_uid=row.ics_uid,
        title=row.title,
        course=course_label(row.course),
        course_full=row.course,
        start_at=row.start_at,
        end_at=row.end_at,
        location=row.location,
        join_url=row.join_url,
        in_progress=row.start_at <= now < end,
    )


async def _classes(session: AsyncSession, now: datetime, until: datetime) -> list[ClassOut]:
    """Sessions not yet over that start before `until`, soonest first."""
    rows = (
        await session.execute(
            select(ClassSession)
            .where(ClassSession.removed_at.is_(None))
            .where(
                func.coalesce(ClassSession.end_at, ClassSession.start_at + DEFAULT_CLASS) > now
            )
            .where(ClassSession.start_at < until)
            .order_by(ClassSession.start_at)
        )
    ).scalars()
    return [_class_out(r, now) for r in rows]


@router.get("/", response_model=SchoolSummary)
async def school_root(
    days: int = Query(default=7, ge=1, le=120),
    session: AsyncSession = Depends(get_session),
) -> SchoolSummary:
    if not settings.canvas_configured:
        return SchoolSummary(configured=False, detail=NOT_CONFIGURED)

    now = datetime.now(UTC)
    fetched_at = (await session.execute(select(func.max(Assignment.last_seen)))).scalar()
    if fetched_at is None:
        return SchoolSummary(configured=True, detail=NO_DATA)

    overdue = (
        await session.execute(
            _select()
            .where(AssignmentStatus.ics_uid.is_(None))
            .where(Assignment.due_at < now)
            .where(Assignment.due_at >= now - timedelta(days=OVERDUE_DAYS))
            .order_by(Assignment.due_at)
        )
    ).all()

    upcoming = (
        await session.execute(
            _select()
            .where(Assignment.due_at >= now)
            .where(Assignment.due_at < _local_midnight(now, days))
            .order_by(Assignment.due_at, Assignment.title)
        )
    ).all()

    week_total, week_done = (
        await session.execute(
            select(func.count(), func.count(AssignmentStatus.ics_uid))
            .select_from(Assignment)
            .outerjoin(AssignmentStatus, AssignmentStatus.ics_uid == Assignment.ics_uid)
            .where(Assignment.removed_at.is_(None))
            .where(Assignment.due_at >= _local_midnight(now))
            .where(Assignment.due_at < _local_midnight(now, 7))
        )
    ).one()

    classes = await _classes(session, now, _local_midnight(now, days))
    # The next class may be past the window (a break week); look further for it.
    next_class = classes[0] if classes else next(
        iter(await _classes(session, now, now + timedelta(days=60))), None
    )

    return SchoolSummary(
        configured=True,
        overdue=[_out(a, d, now) for a, d in overdue],
        upcoming=[_out(a, d, now) for a, d in upcoming],
        week_total=week_total,
        week_done=week_done,
        next_class=next_class,
        classes=classes,
        fetched_at=fetched_at,
    )


@router.get("/past", response_model=list[AssignmentOut])
async def school_past(
    days: int = Query(default=30, ge=1, le=730),
    session: AsyncSession = Depends(get_session),
) -> list[AssignmentOut]:
    """What was due in the last `days`, newest first, done or not — the archive
    the feed itself forgets."""
    now = datetime.now(UTC)
    rows = (
        await session.execute(
            _select()
            .where(Assignment.due_at < now)
            .where(Assignment.due_at >= now - timedelta(days=days))
            .order_by(Assignment.due_at.desc())
        )
    ).all()
    return [_out(a, d, now) for a, d in rows]


@router.post("/{ics_uid}/toggle", response_model=AssignmentOut)
async def toggle_done(ics_uid: str, session: AsyncSession = Depends(get_session)) -> AssignmentOut:
    assignment = await session.get(Assignment, ics_uid)
    if assignment is None:
        raise HTTPException(status_code=404, detail=f"no assignment {ics_uid!r}")

    removed = await session.execute(
        delete(AssignmentStatus).where(AssignmentStatus.ics_uid == ics_uid)
    )
    done_at: datetime | None = None
    if removed.rowcount == 0:
        done_at = datetime.now(UTC)
        await session.execute(
            insert(AssignmentStatus)
            .values(ics_uid=ics_uid, done_at=done_at)
            .on_conflict_do_nothing()
        )
    await session.commit()
    return _out(assignment, done_at, datetime.now(UTC))
