"""Open-Meteo. The only module in Atlas that knows what Open-Meteo looks like.

Everything above it sees `HourlyReading` and `describe()`, so swapping in
OpenWeatherMap later is a rewrite of this file and nothing else.

Why the window is two days back and three forward: the free forecast endpoint
serves a moving window, and one fetch has to do three jobs. The past days repair
anything a missed cron run left as a stale forecast, the current hour is what
the card shows, and the forward days give the day its high and low before the
day has happened. Every row is upserted on its hour, so a forecast written
yesterday is overwritten by the real reading today — the archive converges on
truth without ever needing a second endpoint.

No API key, by design: Open-Meteo is free for non-commercial use, which makes
it the cheapest integration in Atlas.

Three requests per sync, all archived:

* hourly forecast, in UTC — the rows above, now with UV index;
* daily forecast, in the *local* zone — a UTC "day" ends in the evening west of UTC — for
  the 7-day strip, sunrise and sunset, and the day's peak UV. Upserted on the
  date into `weather_daily`, so a day forecast a week out converges too;
* air quality, a separate Open-Meteo host, for US AQI per hour. Optional: if it
  fails the weather still lands, and the AQI already archived is left alone.
"""

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today, local_zone
from app.config import settings
from app.sources import Unreachable
from app.models import WeatherDaily, WeatherObservation

log = logging.getLogger(__name__)

ENDPOINT = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality"
PAST_DAYS = 2
FORECAST_DAYS = 3
#: The daily strip: today and the six days after it.
DAILY_FORECAST_DAYS = 7
TIMEOUT = httpx.Timeout(20.0)
#: Seconds to wait before each retry of a transient failure. Open-Meteo's free
#: tier answers "503 The service is overloaded" in short bursts; without a
#: retry one burst turns the card's chip red until the next hourly run.
RETRY_DELAYS = (5, 15)
TRANSIENT = {429, 500, 502, 503, 504}

# Open-Meteo's names on the left, ours on the right. This mapping is the whole
# of the provider coupling.
HOURLY_FIELDS: dict[str, str] = {
    "temperature_2m": "temperature_c",
    "apparent_temperature": "apparent_temperature_c",
    "relative_humidity_2m": "relative_humidity",
    "precipitation": "precipitation_mm",
    "precipitation_probability": "precipitation_probability",
    "wind_speed_10m": "wind_speed_kmh",
    "cloud_cover": "cloud_cover",
    "weather_code": "weather_code",
    "is_day": "is_day",
    "uv_index": "uv_index",
}

DAILY_FIELDS: dict[str, str] = {
    "weather_code": "weather_code",
    "temperature_2m_max": "temperature_max_c",
    "temperature_2m_min": "temperature_min_c",
    "precipitation_probability_max": "precipitation_probability_max",
    "precipitation_sum": "precipitation_sum_mm",
    "sunrise": "sunrise",
    "sunset": "sunset",
    "uv_index_max": "uv_index_max",
}

# WMO 4677, the subset Open-Meteo actually emits.
WMO_DESCRIPTIONS: dict[int, str] = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail",
}


def describe(code: int | None) -> str:
    """Words for a WMO code. Unknown codes get a neutral label rather than a
    blank — an unrecognised number is still weather."""
    if code is None:
        return "Unknown"
    return WMO_DESCRIPTIONS.get(code, "Unsettled")


@dataclass(frozen=True)
class HourlyReading:
    """One hour, in Atlas's own shape and Atlas's own units."""

    observed_at: datetime
    temperature_c: float | None
    apparent_temperature_c: float | None
    relative_humidity: int | None
    precipitation_mm: float | None
    precipitation_probability: int | None
    wind_speed_kmh: float | None
    cloud_cover: int | None
    weather_code: int | None
    is_day: bool | None
    uv_index: float | None
    is_forecast: bool
    fetched_at: datetime


@dataclass(frozen=True)
class DailyReading:
    """One local day, in Atlas's units."""

    date: date
    temperature_max_c: float | None
    temperature_min_c: float | None
    precipitation_probability_max: int | None
    precipitation_sum_mm: float | None
    weather_code: int | None
    sunrise: datetime | None
    sunset: datetime | None
    uv_index_max: float | None
    is_forecast: bool
    fetched_at: datetime


def _coerce(name: str, value: object) -> object:
    """Open-Meteo sends every hourly series as numbers or nulls. Two columns
    want something other than a float: is_day is a 0/1 flag, and the integer
    percentages are SmallInteger."""
    if value is None:
        return None
    if name == "is_day":
        return bool(value)
    if name in (
        "relative_humidity",
        "precipitation_probability",
        "precipitation_probability_max",
        "cloud_cover",
        "weather_code",
    ):
        return int(value)
    if name in ("sunrise", "sunset"):
        # The daily request is made in the local zone, so these are naive
        # local wall-clock strings.
        return datetime.fromisoformat(str(value)).replace(tzinfo=local_zone())
    return float(value)


def parse_hourly(payload: dict, fetched_at: datetime) -> list[HourlyReading]:
    """Turn Open-Meteo's columnar response into rows.

    The response is column-oriented — one array per variable, all aligned to
    hourly.time — so this transposes it into one row per hour."""
    hourly = payload.get("hourly") or {}
    times: Sequence[str] = hourly.get("time") or []

    # The current hour is a real reading; anything after it is a prediction.
    current_hour = fetched_at.replace(minute=0, second=0, microsecond=0)

    # Resolved once, not once per row: a variable Open-Meteo declined to return
    # is absent rather than null-filled, and a short series is treated as
    # missing from its end rather than raising IndexError mid-sync.
    series: dict[str, Sequence] = {
        ours: hourly.get(theirs) or () for theirs, ours in HOURLY_FIELDS.items()
    }

    readings: list[HourlyReading] = []
    for i, stamp in enumerate(times):
        # timezone=UTC was requested, so these are naive UTC strings.
        observed_at = datetime.fromisoformat(stamp).replace(tzinfo=UTC)

        values = {
            ours: _coerce(ours, column[i] if i < len(column) else None)
            for ours, column in series.items()
        }
        readings.append(
            HourlyReading(
                observed_at=observed_at,
                is_forecast=observed_at > current_hour,
                fetched_at=fetched_at,
                **values,  # type: ignore[arg-type]
            )
        )
    return readings


def parse_daily(payload: dict, fetched_at: datetime, today: date) -> list[DailyReading]:
    """Open-Meteo's columnar daily block, transposed into one row per day."""
    daily = payload.get("daily") or {}
    times: Sequence[str] = daily.get("time") or []
    series: dict[str, Sequence] = {
        ours: daily.get(theirs) or () for theirs, ours in DAILY_FIELDS.items()
    }
    readings: list[DailyReading] = []
    for i, stamp in enumerate(times):
        day = date.fromisoformat(stamp)
        values = {
            ours: _coerce(ours, column[i] if i < len(column) else None)
            for ours, column in series.items()
        }
        readings.append(
            DailyReading(
                date=day,
                is_forecast=day > today,
                fetched_at=fetched_at,
                **values,  # type: ignore[arg-type]
            )
        )
    return readings


def parse_air_quality(payload: dict) -> dict[datetime, int]:
    """US AQI per UTC hour."""
    hourly = payload.get("hourly") or {}
    times: Sequence[str] = hourly.get("time") or []
    values: Sequence = hourly.get("us_aqi") or ()
    out: dict[datetime, int] = {}
    for i, stamp in enumerate(times):
        value = values[i] if i < len(values) else None
        if value is not None:
            out[datetime.fromisoformat(stamp).replace(tzinfo=UTC)] = int(round(value))
    return out


async def _get_json(
    client: httpx.AsyncClient, url: str, params: dict[str, Any], what: str = "Open-Meteo"
) -> dict:
    """One GET with the transient-failure retries, raising a readable error."""
    for attempt, delay in enumerate((*RETRY_DELAYS, None), start=1):
        try:
            response = await client.get(url, params=params)
        except httpx.TransportError as exc:
            if delay is None:
                raise Unreachable(f"{what} unreachable: {type(exc).__name__}") from None
            log.info("%s attempt %d: %s; retrying in %ds", what, attempt, exc, delay)
        else:
            if response.status_code not in TRANSIENT or delay is None:
                break
            log.info(
                "%s attempt %d: HTTP %d; retrying in %ds",
                what, attempt, response.status_code, delay,
            )
        await asyncio.sleep(delay)

    # Open-Meteo reports bad coordinates as 400 + {"error":true,"reason":...}.
    # Surface the reason: "latitude must be in range of -90 to 90" is a far
    # better sync_runs row than "Client error 400".
    if response.status_code >= 400:
        reason = ""
        try:
            reason = (response.json() or {}).get("reason", "")
        except ValueError:
            pass
        raise RuntimeError(f"{what} {response.status_code}: {reason or response.text[:200]}")
    return response.json()


def _where() -> dict[str, Any]:
    return {"latitude": settings.weather_lat, "longitude": settings.weather_lon}


async def fetch_hourly(
    client: httpx.AsyncClient, where: dict[str, Any] | None = None
) -> list[HourlyReading]:
    """`where` overrides the configured coordinates — Setup's Test passes its own."""
    params = {
        **(where or _where()),
        "hourly": ",".join(HOURLY_FIELDS),
        # UTC in, UTC in the table. Local time is a display concern, and the
        # only place it matters is picking out "today" for the high and low.
        "timezone": "UTC",
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
    }
    return parse_hourly(await _get_json(client, ENDPOINT, params), datetime.now(UTC))


async def fetch_daily(client: httpx.AsyncClient) -> list[DailyReading]:
    params = {
        **_where(),
        "daily": ",".join(DAILY_FIELDS),
        # Local, unlike the hourly call: a day's high, sunrise and UV peak only
        # mean something over the local calendar day.
        "timezone": local_zone().key,
        "past_days": PAST_DAYS,
        "forecast_days": DAILY_FORECAST_DAYS,
    }
    payload = await _get_json(client, ENDPOINT, params)
    return parse_daily(payload, datetime.now(UTC), local_today())


async def fetch_air_quality(client: httpx.AsyncClient) -> dict[datetime, int] | None:
    """None when the air-quality host fails — it is a nice-to-have, and a dead
    AQI feed must not cost the temperature."""
    params = {
        **_where(),
        "hourly": "us_aqi",
        "timezone": "UTC",
        "past_days": PAST_DAYS,
        "forecast_days": FORECAST_DAYS,
    }
    try:
        payload = await _get_json(client, AIR_QUALITY_ENDPOINT, params, "Open-Meteo air quality")
    except RuntimeError as exc:
        log.warning("air quality skipped: %s", exc)
        return None
    return parse_air_quality(payload)


async def sync_weather(session: AsyncSession) -> int:
    """Fetch the windows and upsert every hour and day in them. Returns rows
    touched."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        readings, days, aqi = await asyncio.gather(
            fetch_hourly(client), fetch_daily(client), fetch_air_quality(client)
        )
    if not readings:
        log.warning("open-meteo returned no hourly rows")
        return 0

    rows = [asdict(r) for r in readings]
    if aqi is not None:
        for row in rows:
            row["us_aqi"] = aqi.get(row["observed_at"])
    # With no AQI this run, the column is left out of the statement entirely,
    # so the readings already archived survive the failed call.
    stmt = insert(WeatherObservation).values(rows)
    # Everything but the key is refreshed, so a forecast row becomes a real
    # reading in place the first time the sync runs after that hour passes.
    stmt = stmt.on_conflict_do_update(
        index_elements=["observed_at"],
        set_={c: stmt.excluded[c] for c in rows[0] if c != "observed_at"},
    )
    await session.execute(stmt)

    if days:
        daily_rows = [asdict(d) for d in days]
        stmt = insert(WeatherDaily).values(daily_rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["date"],
            set_={c: stmt.excluded[c] for c in daily_rows[0] if c != "date"},
        )
        await session.execute(stmt)

    await session.commit()
    return len(rows) + len(days)


def window_bounds(now: datetime) -> tuple[datetime, datetime]:
    """The UTC span the archive should hold after a successful sync — used by
    the API to tell "we have no data yet" apart from "the sync is stale"."""
    return now - timedelta(days=PAST_DAYS), now + timedelta(days=FORECAST_DAYS)
