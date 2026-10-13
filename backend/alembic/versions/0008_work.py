"""work — weekly shifts, entered by hand from the paper schedule

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "work_weeks",
        sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column(
            "saved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "week_start"),
    )
    op.create_table(
        "work_shifts",
        sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint("end_time > start_time", name="work_shift_same_day"),
        sa.PrimaryKeyConstraint("user_id", "date"),
    )


def downgrade() -> None:
    op.drop_table("work_shifts")
    op.drop_table("work_weeks")
