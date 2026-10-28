"""custom_secrets — secrets entered in the app (Custom modules, Setup)

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "custom_secrets",
        sa.Column("module", sa.String(40), nullable=False),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("module", "name"),
    )


def downgrade() -> None:
    op.drop_table("custom_secrets")
