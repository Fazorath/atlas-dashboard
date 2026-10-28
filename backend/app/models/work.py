"""Work — the shifts you work each week, entered by hand.

Like habits, you are the upstream: these rows are the only record, nothing
syncs into them, and they are written only from the Edit week sheet.

A week is saved whole. Its `work_weeks` row is what makes it *entered*, so a
day in an entered week with no `work_shifts` row is a day off, while a day in
a week with no row at all is simply unknown ("not entered yet"). That is the
one distinction the Shift widget needs and a shifts table alone can't make.

One shift a day, start and end on that day: shifts never cross midnight, which
the CHECK enforces. `user_id` is designed in ahead of accounts (M2), as on
boards.
"""

import enum
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Integer,
    Text,
    Time,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.board import OWNER_ID


class WorkWeek(Base):
    __tablename__ = "work_weeks"

    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=OWNER_ID, server_default=str(OWNER_ID)
    )
    # Always a Monday: a week runs Monday to Sunday.
    week_start: Mapped[date] = mapped_column(Date, primary_key=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WorkShift(Base):
    __tablename__ = "work_shifts"
    __table_args__ = (CheckConstraint("end_time > start_time", name="work_shift_same_day"),)

    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=OWNER_ID, server_default=str(OWNER_ID)
    )
    # The local calendar day (settings.tz) — see app/clock.py.
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)


class DraftStatus(str, enum.Enum):
    reading = "reading"
    ready = "ready"
    failed = "failed"


class WorkDraft(Base):
    """One Schedule photo read (ADR 0006), from upload to Draft week.

    `reading` while the photo is being read in the background; `failed` with a
    reason you can act on; `ready` is a Draft week: `days` holds the seven
    weekdays as read, and nothing in it counts until the week is saved, which
    deletes the draft. At most one ready draft per week — a newer photo of the
    same week replaces it. The photo itself is never stored.
    """

    __tablename__ = "work_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, default=OWNER_ID, server_default=str(OWNER_ID), nullable=False
    )
    status: Mapped[DraftStatus] = mapped_column(
        Enum(
            DraftStatus,
            name="draft_status",
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    # Unknown until read: the week the paper's dates name.
    week_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The paper's dates couldn't be read, so week_start is the week you had
    # open when you sent the photo — worth a look before saving over it.
    week_guessed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    # [{date, start, end, off, raw}] — start/end "HH:MM" or null when flagged.
    days: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
