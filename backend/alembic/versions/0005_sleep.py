"""oauth_tokens + sleep_sessions + daily_activity — Phase 7, Fitbit via Google Health

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "oauth_tokens",
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scope", sa.Text(), nullable=False, server_default=""),
        sa.Column("health_user_id", sa.String(length=64), nullable=True),
        sa.Column("legacy_user_id", sa.String(length=64), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("invalid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalid_reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("provider"),
    )

    op.create_table(
        "sleep_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("wake_date", sa.Date(), nullable=False),
        sa.Column("end_utc_offset_s", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_main", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_nap", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sleep_type", sa.String(length=16), nullable=False),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("minutes_asleep", sa.Integer(), nullable=True),
        sa.Column("minutes_awake", sa.Integer(), nullable=True),
        sa.Column("minutes_in_period", sa.Integer(), nullable=True),
        sa.Column("minutes_to_fall_asleep", sa.Integer(), nullable=True),
        sa.Column("deep_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("light_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("rem_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("wake_minutes", sa.SmallInteger(), nullable=True),
        sa.Column(
            "stages", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"
        ),
        sa.Column("device", sa.Text(), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("upstream_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sleep_sessions_wake_date", "sleep_sessions", ["wake_date"])

    op.create_table(
        "daily_activity",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("resting_hr", sa.SmallInteger(), nullable=True),
        sa.Column("light_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("moderate_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("vigorous_minutes", sa.SmallInteger(), nullable=True),
        sa.Column("calories_kcal", sa.Float(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("date"),
    )


def downgrade() -> None:
    op.drop_table("daily_activity")
    op.drop_index("ix_sleep_sessions_wake_date", table_name="sleep_sessions")
    op.drop_table("sleep_sessions")
    op.drop_table("oauth_tokens")
