"""boards.seen_modules — which modules a saved Board has caught up with

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Null for boards saved before this: the next visit counts the modules
    # with a Widget on the layout as seen and appends the defaults of any
    # other enabled module once.
    op.add_column("boards", sa.Column("seen_modules", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("boards", "seen_modules")
