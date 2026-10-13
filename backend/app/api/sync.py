"""Sync control surface. Cron calls these; so can you, by hand:

    curl -X POST 127.0.0.1:8187/api/sync/weather
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import SyncRun
from app.schemas.sync import SourceStatus, SyncResult
from app.sync import SOURCES, run_sync

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status", response_model=list[SourceStatus])
async def sync_status(session: AsyncSession = Depends(get_session)) -> list[SourceStatus]:
    """Latest run per source — what the dashboard reads for "last synced" and
    for failure banners."""
    newest = (
        select(SyncRun.source, func.max(SyncRun.id).label("id"))
        .group_by(SyncRun.source)
        .subquery()
    )
    rows = (
        await session.execute(select(SyncRun).join(newest, SyncRun.id == newest.c.id))
    ).scalars()
    latest = {r.source: SyncResult.model_validate(r) for r in rows}

    return [
        SourceStatus(
            source=name,
            configured=source.is_configured(),
            live=source.live,
            last_run=latest.get(name),
        )
        for name, source in sorted(SOURCES.items())
        if not source.hidden
    ]


@router.get("/runs", response_model=list[SyncResult])
async def sync_runs(
    source: str | None = None,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
) -> list[SyncResult]:
    stmt = select(SyncRun).order_by(SyncRun.id.desc()).limit(min(limit, 500))
    if source:
        stmt = stmt.where(SyncRun.source == source)
    rows = (await session.execute(stmt)).scalars().all()
    return [SyncResult.model_validate(r) for r in rows]


@router.post("/{source}", response_model=SyncResult)
async def trigger_sync(source: str, session: AsyncSession = Depends(get_session)) -> SyncResult:
    if source not in SOURCES:
        raise HTTPException(
            status_code=404,
            detail=f"unknown source {source!r}; known: {sorted(SOURCES)}",
        )
    return await run_sync(session, source)
