"""Weather — Phase 2. Reads the archive, never the upstream.

The card is served entirely from weather_observations. Open-Meteo is touched
only by the hourly sync, so a dead upstream costs freshness and not the card:
the last good reading stays on screen, and sync_runs is where the failure shows.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today, local_zone
from app.config import settings
from app.db import get_session
from app.models import WeatherDaily, WeatherObservation
from app.schemas.weather import DailyPoint, HourlyPoint, WeatherNow, WeatherSummary
from app.sources.weather import describe

log = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["weather"])

NOT_CONFIGURED = "Add WEATHER_LAT and WEATHER_LON to .env, then restart atlas-api."
NO_DATA = "No readings archived yet — run POST /api/sync/weather."

# How many hours the card's strip may ask for.
STRIP_HOURS = 12
DAILY_DAYS = 7


def _local_day_bounds(now: datetime) -> tuple[datetime, datetime]:
    """The UTC span of the local calendar day containing `now`.

    Local, not UTC: in America/New_York a UTC day ends at 8pm, which would put
    a summer evening's readings into tomorrow's high.
    """
    local = now.astimezone(local_zone())
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    # Wall-clock arithmetic on an aware datetime, so a 23- or 25-hour DST day
    # still resolves to the right instant.
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)


def _to_point(row: WeatherObservation) -> HourlyPoint:
    return HourlyPoint(
        at=row.observed_at,
        temperature_c=row.temperature_c,
        apparent_temperature_c=row.apparent_temperature_c,
        precipitation_probability=row.precipitation_probability,
        weather_code=row.weather_code,
        is_day=row.is_day,
        is_forecast=row.is_forecast,
    )


def _to_now(row: WeatherObservation) -> WeatherNow:
    return WeatherNow(
        at=row.observed_at,
        temperature_c=row.temperature_c,
        apparent_temperature_c=row.apparent_temperature_c,
        relative_humidity=row.relative_humidity,
        precipitation_mm=row.precipitation_mm,
        precipitation_probability=row.precipitation_probability,
        wind_speed_kmh=row.wind_speed_kmh,
        cloud_cover=row.cloud_cover,
        weather_code=row.weather_code,
        description=describe(row.weather_code),
        is_day=row.is_day,
        uv_index=row.uv_index,
        us_aqi=row.us_aqi,
    )


def _to_day(row: WeatherDaily) -> DailyPoint:
    return DailyPoint(
        date=row.date,
        temperature_max_c=row.temperature_max_c,
        temperature_min_c=row.temperature_min_c,
        precipitation_probability_max=row.precipitation_probability_max,
        precipitation_sum_mm=row.precipitation_sum_mm,
        weather_code=row.weather_code,
        description=describe(row.weather_code),
        sunrise=row.sunrise,
        sunset=row.sunset,
        uv_index_max=row.uv_index_max,
    )


@router.get("/", response_model=WeatherSummary)
async def weather_root(session: AsyncSession = Depends(get_session)) -> WeatherSummary:
    if not settings.weather_configured:
        return WeatherSummary(configured=False, detail=NOT_CONFIGURED)

    now = datetime.now(UTC)
    current_hour = now.replace(minute=0, second=0, microsecond=0)

    # The current hour if the sync is healthy; otherwise the most recent hour
    # we do have, so a stale archive still shows its last real reading rather
    # than emptying the card.
    current = (
        await session.execute(
            select(WeatherObservation)
            .where(WeatherObservation.observed_at <= current_hour)
            .order_by(WeatherObservation.observed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if current is None:
        return WeatherSummary(configured=True, detail=NO_DATA)

    day_start, day_end = _local_day_bounds(now)
    high, low = (
        await session.execute(
            select(
                func.max(WeatherObservation.temperature_c),
                func.min(WeatherObservation.temperature_c),
            )
            .where(WeatherObservation.observed_at >= day_start)
            .where(WeatherObservation.observed_at < day_end)
        )
    ).one()

    upcoming = (
        (
            await session.execute(
                select(WeatherObservation)
                .where(WeatherObservation.observed_at > current_hour)
                .order_by(WeatherObservation.observed_at)
                .limit(STRIP_HOURS)
            )
        )
        .scalars()
        .all()
    )

    today = local_today()
    daily = (
        (
            await session.execute(
                select(WeatherDaily)
                .where(WeatherDaily.date >= today)
                .where(WeatherDaily.date < today + timedelta(days=DAILY_DAYS))
                .order_by(WeatherDaily.date)
            )
        )
        .scalars()
        .all()
    )

    return WeatherSummary(
        configured=True,
        now=_to_now(current),
        high_c=high,
        low_c=low,
        hourly=[_to_point(r) for r in upcoming],
        daily=[_to_day(d) for d in daily],
        fetched_at=current.fetched_at,
    )


@router.get("/history", response_model=list[HourlyPoint])
async def weather_history(
    hours: int = Query(default=48, ge=1, le=24 * 365),
    session: AsyncSession = Depends(get_session),
) -> list[HourlyPoint]:
    """The archive, oldest first. Nothing in the UI reads this yet — it exists
    so the hourly table is addressable without psql, and so a later weather
    screen has its endpoint already."""
    since = datetime.now(UTC) - timedelta(hours=hours)
    rows = (
        (
            await session.execute(
                select(WeatherObservation)
                .where(WeatherObservation.observed_at >= since)
                .order_by(WeatherObservation.observed_at)
            )
        )
        .scalars()
        .all()
    )
    return [_to_point(r) for r in rows]
