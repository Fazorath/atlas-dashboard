"""Sleep — Phase 7. Fitbit via the Google Health API. Reads the archive, never
the upstream.

Same bargain as weather and Canvas: Google is touched only by the sync, so an
expired token costs freshness and not the card — last week's nights stay on
screen while the Reconnect prompt sits above them.

The one thing this router does that no other does is run an OAuth flow:

    GET  /api/sleep/connect          -> {url}: where to send the browser
    GET  /api/sleep/oauth/callback   <- Google sends the browser back here
    POST /api/sleep/oauth/complete   <- or you paste the address it landed on,
                                        when the redirect URI is a localhost one
    POST /api/sleep/disconnect       revoke, forget the token, keep the nights

Tailscale is the only boundary, as everywhere in Atlas: anyone on the tailnet
who can open the dashboard can also press Connect.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today
from app.config import settings
from app.db import get_session
from app.nights import main_nights
from app.models import DailyActivity, OAuthToken, SleepSession, SyncStatus
from app.schemas.sleep import (
    Activity,
    Connection,
    Night,
    PastedRedirect,
    SleepSummary,
    Stage,
)
from app.sources import google_health
from app.sync import run_sync

log = logging.getLogger(__name__)

router = APIRouter(prefix="/sleep", tags=["sleep"])

SOURCE = "sleep"
NOT_CONFIGURED = (
    "Create a Google Cloud OAuth client for the Google Health API and put its id, "
    "secret and redirect URI in .env, then restart atlas-api."
)
NOT_CONNECTED = "Connect your Fitbit's Google account to start archiving sleep."
NO_DATA = "Connected — no nights archived yet. The first sync pulls 90 days."


# --- Connection ------------------------------------------------------------

async def connection(session: AsyncSession) -> Connection:
    paste_back = google_health.paste_back()
    if not settings.google_health_configured:
        return Connection(state="setup")

    token = await session.get(OAuthToken, google_health.PROVIDER)
    if token is None:
        return Connection(state="disconnected", paste_back=paste_back)

    expired = token.refresh_expires_at is not None and token.refresh_expires_at <= datetime.now(UTC)
    if token.invalid_at is not None or expired:
        return Connection(
            state="expired",
            connected_at=token.connected_at,
            reconnect_by=token.refresh_expires_at,
            reason=token.invalid_reason or "Google's 7-day sign-in window ran out",
            paste_back=paste_back,
        )
    return Connection(
        state="connected",
        connected_at=token.connected_at,
        reconnect_by=token.refresh_expires_at,
        paste_back=paste_back,
    )


# --- Reading ---------------------------------------------------------------

def _efficiency(row: SleepSession) -> float | None:
    if not row.minutes_asleep or not row.minutes_in_period:
        return None
    return round(min(row.minutes_asleep / row.minutes_in_period, 1.0), 3)


def _night(row: SleepSession, with_stages: bool = False) -> Night:
    stages: list[Stage] = []
    if with_stages:
        for start, end, kind in row.stages or []:
            try:
                stages.append(Stage(start=start, end=end, stage=kind or "ASLEEP"))
            except ValueError:
                continue
    return Night(
        id=row.id,
        date=row.wake_date,
        start_at=row.start_at,
        end_at=row.end_at,
        sleep_type=row.sleep_type,
        processed=row.processed,
        minutes_asleep=row.minutes_asleep,
        minutes_awake=row.minutes_awake,
        minutes_in_period=row.minutes_in_period,
        efficiency=_efficiency(row),
        deep_minutes=row.deep_minutes,
        light_minutes=row.light_minutes,
        rem_minutes=row.rem_minutes,
        wake_minutes=row.wake_minutes,
        device=row.device,
        stages=stages,
    )


def _activity(row: DailyActivity) -> Activity:
    active = None
    if row.moderate_minutes is not None or row.vigorous_minutes is not None:
        active = (row.moderate_minutes or 0) + (row.vigorous_minutes or 0)
    return Activity(
        date=row.date,
        steps=row.steps,
        resting_hr=row.resting_hr,
        active_minutes=active,
        light_minutes=row.light_minutes,
        calories_kcal=row.calories_kcal,
    )


async def _nights(session: AsyncSession, since: date) -> list[SleepSession]:
    return await main_nights(session, since)


@router.get("/", response_model=SleepSummary)
async def sleep_root(
    days: int = Query(default=7, ge=1, le=90),
    session: AsyncSession = Depends(get_session),
) -> SleepSummary:
    conn = await connection(session)
    if conn.state == "setup":
        return SleepSummary(configured=False, connection=conn, detail=NOT_CONFIGURED)

    since = local_today() - timedelta(days=days - 1)
    nights = await _nights(session, since)
    activity_rows = (
        (
            await session.execute(
                select(DailyActivity)
                .where(DailyActivity.date >= since)
                .order_by(DailyActivity.date)
            )
        )
        .scalars()
        .all()
    )
    fetched_at = (await session.execute(select(func.max(SleepSession.fetched_at)))).scalar()
    fetched_at = max(
        filter(None, [fetched_at, *(a.fetched_at for a in activity_rows)]), default=None
    )

    # The newest night on record, even if it is older than the window — a card
    # that says "last night: 4 days ago" beats an empty one after a dead week.
    latest = nights[-1] if nights else None
    if latest is None:
        latest = (
            await session.execute(
                select(SleepSession)
                .order_by(SleepSession.wake_date.desc(), SleepSession.is_main.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    detail = None
    if latest is None and not activity_rows:
        detail = NOT_CONNECTED if conn.state == "disconnected" else NO_DATA

    asleep = [n.minutes_asleep for n in nights if n.minutes_asleep]
    efficiencies = [e for n in nights if (e := _efficiency(n)) is not None]

    return SleepSummary(
        configured=True,
        connection=conn,
        detail=detail,
        last_night=_night(latest, with_stages=True) if latest else None,
        nights=[_night(n) for n in nights],
        avg_minutes_asleep=round(sum(asleep) / len(asleep)) if asleep else None,
        avg_efficiency=round(sum(efficiencies) / len(efficiencies), 3) if efficiencies else None,
        activity=_activity(activity_rows[-1]) if activity_rows else None,
        activity_days=[_activity(a) for a in activity_rows],
        fetched_at=fetched_at,
    )


@router.get("/history", response_model=list[Night])
async def sleep_history(
    days: int = Query(default=30, ge=1, le=730),
    session: AsyncSession = Depends(get_session),
) -> list[Night]:
    """Main nights over the last `days`, oldest first — the archive Fitbit's
    own app thins out."""
    since = local_today() - timedelta(days=days - 1)
    return [_night(n) for n in await _nights(session, since)]


# --- Connecting ------------------------------------------------------------

@router.get("/connect")
async def connect() -> dict[str, str]:
    """Where to send the browser for Google's consent screen. JSON rather than a
    redirect so a misconfiguration is an error the page can show."""
    if not settings.google_health_configured:
        raise HTTPException(status_code=409, detail=NOT_CONFIGURED)
    return {"url": google_health.authorization_url()}


async def _finish(session: AsyncSession, code: str, state: str) -> None:
    await google_health.complete_consent(session, code, state)
    # Straight into the first sync — the 90-day backfill — so the screen you
    # land back on is already full. Recorded in sync_runs like any other run.
    # run_sync never raises, so a failed backfill has to be surfaced here or
    # the page would say "your last 90 days are in" over an empty archive.
    result = await run_sync(session, SOURCE)
    if result.status == SyncStatus.failed:
        raise RuntimeError(f"Connected, but the first sync failed — {result.error}")


@router.get("/oauth/callback", include_in_schema=False)
async def oauth_callback(
    code: str = "",
    state: str = "",
    error: str = "",
    session: AsyncSession = Depends(get_session),
) -> RedirectResponse:
    """Google's redirect lands here, through nginx and `tailscale serve`. Always
    answers with a redirect back to the Status screen, carrying the outcome."""
    if error:
        message = "Google sign-in was cancelled" if error == "access_denied" else f"Google answered {error}"
        return RedirectResponse(f"/status?oauth_error={quote(message)}", status_code=303)
    try:
        await _finish(session, code, state)
    except (ValueError, RuntimeError) as exc:
        log.warning("google health consent failed: %s", exc)
        return RedirectResponse(f"/status?oauth_error={quote(str(exc))}", status_code=303)
    return RedirectResponse("/status?connected=1", status_code=303)


@router.post("/oauth/complete", response_model=Connection)
async def oauth_complete(
    pasted: PastedRedirect, session: AsyncSession = Depends(get_session)
) -> Connection:
    """The paste-back path, for a localhost redirect URI."""
    try:
        code, state = google_health.code_from_url(pasted.url)
        await _finish(session, code, state)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return await connection(session)


@router.post("/disconnect", response_model=Connection)
async def disconnect(session: AsyncSession = Depends(get_session)) -> Connection:
    await google_health.disconnect(session)
    return await connection(session)
