from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import SyncStatus


class SyncResult(BaseModel):
    """What POST /api/sync/{source} returns, and what a sync function reports."""

    model_config = ConfigDict(from_attributes=True)

    source: str
    status: SyncStatus
    started_at: datetime
    finished_at: datetime | None = None
    duration_ms: int | None = None
    rows_written: int = 0
    error: str | None = None


class SourceStatus(BaseModel):
    """Per-source health, as the dashboard consumes it."""

    source: str
    configured: bool
    #: A live proxy rather than an archive — see `Source.live`. The dashboard
    #: labels these "live" instead of quoting the age of the last run.
    live: bool = False
    last_run: SyncResult | None = None
