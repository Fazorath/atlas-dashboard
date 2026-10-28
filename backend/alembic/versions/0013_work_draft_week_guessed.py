"""work_drafts.week_guessed — a Draft week whose dates weren't read (issue #33)

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "work_drafts",
        sa.Column("week_guessed", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("work_drafts", "week_guessed")
