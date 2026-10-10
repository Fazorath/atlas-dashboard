"""One row per hour of weather at home.

Open-Meteo's free endpoint only serves a window around now — ask it for last
March and you get nothing. So history is ours to keep: this table is the archive,
and the dashboard reads it rather than the upstream. That is the same bargain
Canvas, Fitbit and habits make, and the opposite of Securo and Audiobookshelf,
which are proxied live and never written down here.

One location only (home, from WEATHER_LAT/WEATHER_LON), so the hour alone is the
key. If Atlas ever tracks a second place, that becomes a composite key and the
unique constraint below has to grow a location column with it.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Top of the hour, UTC. Unique: re-syncing the same hour updates it in
    # place, which is what turns yesterday's forecast into today's reading.
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, unique=True, index=True
    )

    # Stored metric, always — Celsius, km/h, mm. It is the unit the upstream
    # speaks, so nothing is lost on the way in, and display units are the front
    # end's business.
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    apparent_temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    relative_humidity: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation_probability: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    cloud_cover: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # WMO code. Open-Meteo's own describe() turns it into words; the front end
    # maps it to an icon. Kept as the number so neither is baked into the row.
    weather_code: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    is_day: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # False once the hour has passed and been re-fetched as a real reading.
    is_forecast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
