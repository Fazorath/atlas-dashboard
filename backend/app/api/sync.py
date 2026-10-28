"""Sync control surface. Cron calls these; so can you, by hand:

    curl -X POST 127.0.0.1:8187/api/sync/weather
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import String, column, select, true, values
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app import live
from app.custom import registry as custom
from app.custom import secrets as custom_secrets
from app.db import get_session
from app.models import SyncRun
from app.schemas.sync import SourceStatus, SyncResult
from app.sync import DISABLED, SOURCES, run_sync

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/status", response_model=list[SourceStatus])
async def sync_status(session: AsyncSession = Depends(get_session)) -> list[SourceStatus]:
    """Latest run per source — what the dashboard reads for "last synced" and
    for failure banners."""
    latest = await _latest_runs(session)
    live.reload()
    await custom_secrets.prune(session)
    missing = {m.id: await _missing(session, m) for m in custom.MODULES.values()}
    return [
        SourceStatus(
            source=name,
            configured=source.is_configured(),
            live=source.live,
            last_run=latest.get(name),
        )
        for name, source in sorted(SOURCES.items())
        if not source.hidden
    ] + [
        # A Custom module is a live Source: read on request, nothing stored.
        SourceStatus(source=f"custom:{m}", configured=True, live=True, last_run=custom.last_pull(m, missing[m]))
        for m in sorted(custom.MODULES)
    ]


async def _missing(session: AsyncSession, module) -> tuple[str, ...]:
    if not module.secrets:
        return ()
    have = await custom_secrets.read(session, module)
    return tuple(n for n in module.secrets if n not in have)


async def _latest_runs(session: AsyncSession) -> dict[str, SyncResult]:
    # One indexed lookup per known source, (source, started_at) DESC LIMIT 1,
    # instead of a GROUP BY over the whole history, which only ever grows.
    names = values(column("source", String), name="names").data([(n,) for n in SOURCES])
    run = aliased(SyncRun)
    newest = (
        select(run.id)
        .where(run.source == names.c.source)
        .order_by(run.started_at.desc(), run.id.desc())
        .limit(1)
        .lateral()
    )
    newest_ids = select(newest.c.id).select_from(names).join(newest, true())
    rows = (await session.execute(select(SyncRun).where(SyncRun.id.in_(newest_ids)))).scalars()
    return {r.source: SyncResult.model_validate(r) for r in rows}


@router.get("/runs", response_model=list[SyncResult])
async def sync_runs(
    source: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> list[SyncResult]:
    stmt = select(SyncRun).order_by(SyncRun.id.desc()).limit(limit)
    if source:
        stmt = stmt.where(SyncRun.source == source)
    rows = (await session.execute(stmt)).scalars().all()
    return [SyncResult.model_validate(r) for r in rows]


@router.post("/{source}", response_model=SyncResult)
async def trigger_sync(
    source: str, session: AsyncSession = Depends(get_session)
) -> SyncResult | Response:
    # Switched off in atlas.yaml: nothing to do, and not worth a cron error.
    if source in DISABLED:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if source not in SOURCES:
        raise HTTPException(
            status_code=404,
            detail=f"unknown source {source!r}; known: {sorted(SOURCES)}",
        )
    return await run_sync(session, source)
