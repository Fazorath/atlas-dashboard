"""assignments + assignment_status — Canvas via ICS

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assignments",
        sa.Column("ics_uid", sa.String(length=255), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("course", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column(
            "first_seen", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("ics_uid"),
    )
    op.create_index("ix_assignments_due_at", "assignments", ["due_at"])

    # Separate on purpose: the sync upserts `assignments` and never names this
    # table, so nothing it does can clobber a tick.
    op.create_table(
        "assignment_status",
        sa.Column("ics_uid", sa.String(length=255), nullable=False),
        sa.Column(
            "done_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["ics_uid"], ["assignments.ics_uid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("ics_uid"),
    )


def downgrade() -> None:
    op.drop_table("assignment_status")
    op.drop_index("ix_assignments_due_at", table_name="assignments")
    op.drop_table("assignments")
