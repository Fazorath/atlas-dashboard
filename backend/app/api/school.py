"""School. Reads the archive, never the feed.

Same bargain as weather: Canvas is touched only by the hourly sync, so a dead
feed costs freshness and not the card. The one write here is the done tick,
which lands in `assignment_status` — a table the sync never names.
"""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.work import monday_of
from app.clock import local_zone
from app.config import settings
from app.db import get_session
from app.models import Assignment, AssignmentStatus, ClassSession, WorkShift, WorkWeek
from app.models.board import OWNER_ID
from app.modules import ENABLED
from app.schemas.school import (
    AssignmentOut,
    ClassOut,
    SchoolSummary,
    StudyBlockOut,
    StudyPlan,
    StudyShortOut,
)
from app.study import Busy, OpenAssignment, plan

router = APIRouter(prefix="/school", tags=["school"])

NOT_CONFIGURED = (
    "Copy your feed link from Canvas (Calendar, then Calendar Feed) into "
    ".env as CANVAS_ICS_URL, then run docker compose up -d atlas-api."
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
    """What left the to-do list in the last `days`, newest first, done or not —
    the archive the feed itself forgets. An Assignment leaves when it's due,
    or when you tick it if that's sooner: a done one never waits for its due
    date to show up here."""
    now = datetime.now(UTC)
    left_at = case(
        (AssignmentStatus.done_at < Assignment.due_at, AssignmentStatus.done_at),
        else_=Assignment.due_at,
    )
    rows = (
        await session.execute(
            _select()
            .where(or_(Assignment.due_at < now, AssignmentStatus.ics_uid.is_not(None)))
            .where(left_at >= now - timedelta(days=days))
            .order_by(left_at.desc(), Assignment.title)
        )
    ).all()
    return [_out(a, d, now) for a, d in rows]


@router.get("/study", response_model=StudyPlan)
async def study_plan(
    days: int = Query(default=7, ge=1, le=21),
    session: AsyncSession = Depends(get_session),
) -> StudyPlan:
    """Study blocks for what's open and due in the next `days`, placed in free
    time around Class sessions and Shifts. Worked out on every read."""
    if not settings.canvas_configured:
        return StudyPlan(configured=False, detail=NOT_CONFIGURED)

    now = datetime.now(UTC)
    until = _local_midnight(now, days)
    rows = (
        await session.execute(
            _select()
            .where(AssignmentStatus.ics_uid.is_(None))
            .where(Assignment.due_at >= now)
            .where(Assignment.due_at < until)
        )
    ).all()
    unticked = [OpenAssignment(a.ics_uid, a.title, course_label(a.course), a.due_at) for a, _ in rows]

    classes = await _classes(session, now, until)
    busy = [Busy(c.start_at, c.end_at or c.start_at + DEFAULT_CLASS) for c in classes]
    zone = local_zone()
    unentered: list[date] = []
    if "work" in ENABLED:
        today = now.astimezone(zone).date()
        last = (until - timedelta(seconds=1)).astimezone(zone).date()
        shifts = (
            await session.execute(
                select(WorkShift).where(
                    WorkShift.user_id == OWNER_ID, WorkShift.date >= today, WorkShift.date <= last
                )
            )
        ).scalars()
        busy += [
            Busy(
                datetime.combine(s.date, s.start_time, zone),
                datetime.combine(s.date, s.end_time, zone),
            )
            for s in shifts
        ]
        first = monday_of(today)
        mondays = {first + timedelta(weeks=w) for w in range((last - first).days // 7 + 1)}
        entered = set(
            (
                await session.execute(
                    select(WorkWeek.week_start).where(
                        WorkWeek.user_id == OWNER_ID, WorkWeek.week_start.in_(mondays)
                    )
                )
            ).scalars()
        )
        unentered = sorted(mondays - entered)

    result = plan(now, unticked, busy, settings.canvas_study.rules(), zone)
    return StudyPlan(
        configured=True,
        blocks=[
            StudyBlockOut(
                ics_uid=b.uid,
                title=b.title,
                course=b.course,
                start_at=b.start,
                end_at=b.end,
                due_at=b.due_at,
            )
            for b in result.blocks
        ],
        short=[
            StudyShortOut(ics_uid=a.uid, title=a.title, course=a.course, due_at=a.due_at, minutes=m)
            for a, m in result.short
        ],
        unentered_weeks=unentered,
    )


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
