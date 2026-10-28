"""notifications — push devices, alert settings, sent log, VAPID keys (ADR 0007)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_ok_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
    )
    op.create_table(
        "notify_settings",
        sa.Column("user_id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("alert", sa.String(length=40), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("at", sa.Time(), nullable=True),
        sa.Column("lead_minutes", sa.Integer(), nullable=True),
    )
    op.create_table(
        "notify_sent",
        sa.Column("user_id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("alert", sa.String(length=40), primary_key=True),
        sa.Column("key", sa.String(length=300), primary_key=True),
        sa.Column(
            "sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "push_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("private_pem", sa.Text(), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("push_keys")
    op.drop_table("notify_sent")
    op.drop_table("notify_settings")
    op.drop_table("push_devices")
