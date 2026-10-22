"""boards — saved Widget arrangements, one per (user, Board)

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # No row is the default arrangement, so this starts empty and every Board
    # looks as designed until someone presses Done in Edit mode.
    op.create_table(
        "boards",
        sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("key", sa.String(length=32), nullable=False),
        sa.Column("layout", JSONB(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "key"),
    )


def downgrade() -> None:
    op.drop_table("boards")
