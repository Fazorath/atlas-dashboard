"""habits + habit_entries — Phase 5, the tracker

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "habits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("icon", sa.String(length=16), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # The composite primary key is the plan's unique(habit_id, date): one tick
    # per habit per day, and what the toggle's ON CONFLICT targets.
    op.create_table(
        "habit_entries",
        sa.Column("habit_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "done_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["habit_id"], ["habits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("habit_id", "date"),
    )
    # The heatmap reads across habits by day; the PK only helps per habit.
    op.create_index("ix_habit_entries_date", "habit_entries", ["date"])


def downgrade() -> None:
    op.drop_index("ix_habit_entries_date", table_name="habit_entries")
    op.drop_table("habit_entries")
    op.drop_table("habits")
