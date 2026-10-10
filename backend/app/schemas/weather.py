"""What the weather card reads.

Temperatures stay Celsius here, the same as in the table. The front end formats
them, because "which unit do I want to look at" is a display preference and not
something worth a round trip or a second column.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HourlyPoint(BaseModel):
    """One hour in the strip under the current reading."""

    model_config = ConfigDict(from_attributes=True)

    at: datetime
    temperature_c: float | None = None
    apparent_temperature_c: float | None = None
    precipitation_probability: int | None = None
    weather_code: int | None = None
    is_day: bool | None = None
    is_forecast: bool = False


class WeatherNow(BaseModel):
    """The current hour, with its code already turned into words."""

    at: datetime
    temperature_c: float | None = None
    apparent_temperature_c: float | None = None
    relative_humidity: int | None = None
    precipitation_mm: float | None = None
    precipitation_probability: int | None = None
    wind_speed_kmh: float | None = None
    cloud_cover: int | None = None
    weather_code: int | None = None
    description: str
    is_day: bool | None = None


class WeatherSummary(BaseModel):
    """Everything the Today card needs, in one request.

    `configured` false is a 200, not a 4xx: a source whose coordinates are not
    filled in yet is a card that says how to switch it on, never a red error.
    """

    configured: bool
    now: WeatherNow | None = None
    # Today's extremes in local time, over real readings and forecast alike, so
    # the high is right in the morning before the day has warmed up.
    high_c: float | None = None
    low_c: float | None = None
    hourly: list[HourlyPoint] = []
    fetched_at: datetime | None = None
    detail: str | None = None
