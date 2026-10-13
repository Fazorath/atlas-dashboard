"""measured habits, weather daily + UV/AQI, Canvas class sessions

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Measured habits (ADR 0001). A habit may name a Health figure and a target;
    # both null is an ordinary habit, which is every habit that exists today.
    op.add_column("habits", sa.Column("metric", sa.String(length=32), nullable=True))
    op.add_column("habits", sa.Column("target", sa.Float(), nullable=True))

    # A tick was a row and an untick its absence. A measured habit also needs a
    # *manual untick* that outlives the next sync, so a row now carries what it
    # says (`done`) and who said it (`source`). Every existing row is a manual
    # tick, which is exactly what the defaults describe.
    op.add_column(
        "habit_entries",
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "habit_entries",
        sa.Column("source", sa.String(length=16), nullable=False, server_default="manual"),
    )

    op.add_column("weather_observations", sa.Column("uv_index", sa.Float(), nullable=True))
    op.add_column("weather_observations", sa.Column("us_aqi", sa.SmallInteger(), nullable=True))

    op.create_table(
        "weather_daily",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("temperature_max_c", sa.Float(), nullable=True),
        sa.Column("temperature_min_c", sa.Float(), nullable=True),
        sa.Column("precipitation_probability_max", sa.SmallInteger(), nullable=True),
        sa.Column("precipitation_sum_mm", sa.Float(), nullable=True),
        sa.Column("weather_code", sa.SmallInteger(), nullable=True),
        sa.Column("sunrise", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sunset", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uv_index_max", sa.Float(), nullable=True),
        sa.Column("is_forecast", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("date"),
    )

    op.create_table(
        "class_sessions",
        sa.Column("ics_uid", sa.String(length=255), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("course", sa.Text(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("join_url", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column(
            "first_seen", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("ics_uid"),
    )
    op.create_index("ix_class_sessions_start_at", "class_sessions", ["start_at"])


def downgrade() -> None:
    op.drop_index("ix_class_sessions_start_at", table_name="class_sessions")
    op.drop_table("class_sessions")
    op.drop_table("weather_daily")
    op.drop_column("weather_observations", "us_aqi")
    op.drop_column("weather_observations", "uv_index")
    op.drop_column("habit_entries", "source")
    op.drop_column("habit_entries", "done")
    op.drop_column("habits", "target")
    op.drop_column("habits", "metric")
