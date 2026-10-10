"""weather_observations — the hourly archive Phase 2 fills

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "weather_observations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("apparent_temperature_c", sa.Float(), nullable=True),
        sa.Column("relative_humidity", sa.SmallInteger(), nullable=True),
        sa.Column("precipitation_mm", sa.Float(), nullable=True),
        sa.Column("precipitation_probability", sa.SmallInteger(), nullable=True),
        sa.Column("wind_speed_kmh", sa.Float(), nullable=True),
        sa.Column("cloud_cover", sa.SmallInteger(), nullable=True),
        sa.Column("weather_code", sa.SmallInteger(), nullable=True),
        sa.Column("is_day", sa.Boolean(), nullable=True),
        sa.Column("is_forecast", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Unique, not just indexed: the sync upserts on this column, so ON CONFLICT
    # needs a real constraint to target.
    op.create_index(
        "ix_weather_observations_observed_at",
        "weather_observations",
        ["observed_at"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_weather_observations_observed_at", table_name="weather_observations")
    op.drop_table("weather_observations")
