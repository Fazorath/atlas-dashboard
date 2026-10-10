"""Runs a registered source and records the attempt in sync_runs.

Every integration goes through here, so "did it work, when, and why not" is
answerable from one table for all six domains.
"""

import logging
import time
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SyncRun, SyncStatus
from app.schemas.sync import SyncResult
from app.sync.registry import SOURCES

log = logging.getLogger(__name__)


async def run_sync(session: AsyncSession, name: str) -> SyncResult:
    source = SOURCES[name]
    started = datetime.now(UTC)
    clock = time.perf_counter()

    run = SyncRun(source=name, status=SyncStatus.running, started_at=started)
    session.add(run)
    await session.commit()
    # Held separately: a rollback below expires the instance, and touching an
    # expired attribute mid-async would trigger a lazy refresh (MissingGreenlet).
    run_id = run.id

    if not source.is_configured():
        run.status = SyncStatus.skipped
        run.error = "not configured"
        run.finished_at = datetime.now(UTC)
        run.duration_ms = 0
        await session.commit()
        log.info("sync %s skipped: not configured", name)
        return SyncResult.model_validate(run)

    try:
        rows = await source.run(session)
    except Exception as exc:  # a broken upstream must not take the API down
        await session.rollback()
        run = await session.get(SyncRun, run_id)
        run.status = SyncStatus.failed
        run.error = f"{type(exc).__name__}: {exc}"[:2000]
        run.finished_at = datetime.now(UTC)
        run.duration_ms = int((time.perf_counter() - clock) * 1000)
        await session.commit()
        log.warning("sync %s failed: %s", name, exc)
        return SyncResult.model_validate(run)

    run.status = SyncStatus.success
    run.rows_written = rows
    run.finished_at = datetime.now(UTC)
    run.duration_ms = int((time.perf_counter() - clock) * 1000)
    await session.commit()
    log.info("sync %s wrote %d rows in %dms", name, rows, run.duration_ms)
    return SyncResult.model_validate(run)
