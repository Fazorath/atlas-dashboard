"""Habits — the one domain where you are the upstream.

Everything else Atlas stores is a copy of something that lives elsewhere; these
rows are the only record there is. So nothing here is ever rewritten by a sync,
and a habit is archived rather than deleted once it has history worth keeping.

A tick is a row, an untick is its absence. There is no `done` column to drift
out of step: "did I do it on the 14th" is "does (habit, 14th) exist". Streaks
and completion are computed from these rows on read — never stored — so a
backfilled tick for last Tuesday repairs every figure that depends on it.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Habit(TimestampMixin, Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # A single emoji or short glyph. Optional: the row falls back to the name's
    # first letter, so an icon is decoration, never identity.
    icon: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Null while active. Archiving hides the habit from today's list but keeps
    # its entries, so the heatmap still remembers the months it was tracked.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HabitEntry(Base):
    __tablename__ = "habit_entries"

    habit_id: Mapped[int] = mapped_column(
        ForeignKey("habits.id", ondelete="CASCADE"), primary_key=True
    )
    # The local calendar day (settings.tz), not a UTC date — see app/clock.py.
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    done_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
