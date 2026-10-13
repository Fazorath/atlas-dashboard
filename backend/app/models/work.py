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

from datetime import date, datetime, time

from sqlalchemy import CheckConstraint, Date, DateTime, Integer, Time, func
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
