"""One row per sync attempt, for every integration Atlas ever grows.

This is what powers "last synced 4h ago" on each widget and the
"Fitbit disconnected — Reconnect" banner: the dashboard reads the latest run per
source and renders failure state from it rather than guessing.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SyncStatus(str, enum.Enum):
    running = "running"
    success = "success"
    failed = "failed"
    skipped = "skipped"  # source not configured yet


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus, name="sync_status", native_enum=False, length=16), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rows_written: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # The dominant query is "latest run for source X".
        Index("ix_sync_runs_source_started_at", "source", "started_at"),
    )
