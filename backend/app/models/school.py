"""Canvas assignments, and your own verdict on each.

The ICS feed says what is due and when; it cannot say whether you did it —
Canvas keeps submission status behind an API an ordinary user token can't reach. So
the schema is split down that line:

- `assignments` is Canvas's side. The hourly sync upserts it on `ics_uid` and
  rewrites every column it owns, so a moved due date or a renamed assignment
  lands on the next run.
- `assignment_status` is yours. No sync ever writes to it, so a tick survives
  every resync. Like a habit, a tick is a row and an untick is its absence.

Rows are never deleted. Canvas's feed only covers a window around now, so an
assignment that ages out of it is still yours to look back on — that is the
archival point of this table. An upcoming assignment that *vanishes* from the
feed (deleted or unpublished) gets `removed_at`, and comes back if it reappears.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Assignment(Base):
    __tablename__ = "assignments"

    # Canvas's VEVENT UID, e.g. `event-assignment-123456`. Stable across edits
    # to the assignment, which is what makes it the upsert key.
    ics_uid: Mapped[str] = mapped_column(String(255), primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    # Parsed off the `[Course Name]` suffix Canvas puts on every SUMMARY. Null
    # if a summary ever arrives without one rather than guessing.
    course: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    # Canvas emits a date with no time for anything due at 11:59pm. Stored as
    # 23:59 local so ordering and "overdue" just work, flagged so the UI can say
    # "end of day" instead of a time you didn't set.
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)

    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssignmentStatus(Base):
    __tablename__ = "assignment_status"

    ics_uid: Mapped[str] = mapped_column(
        ForeignKey("assignments.ics_uid", ondelete="CASCADE"), primary_key=True
    )
    done_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ClassSession(Base):
    """A Class session: a scheduled live class you join (Canvas's
    `event-calendar-event-*` entries). A time, not a to-do — there is no status
    table beside it, because nothing about a class is ever ticked or counted.

    Archived on the same rules as `assignments`: upserted on the UID, never
    deleted, and an upcoming one that vanishes from the feed gets `removed_at`.
    """

    __tablename__ = "class_sessions"

    ics_uid: Mapped[str] = mapped_column(String(255), primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    course: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The meeting link pulled out of the event's description (Zoom, Teams…).
    join_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Canvas's own calendar link for the course.
    url: Mapped[str | None] = mapped_column(Text, nullable=True)

    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
