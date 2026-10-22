"""Fitbit sleep and daily activity, via the Google Health API — and the token
that reads them.

Archived, like weather and Canvas: Fitbit's own app ages detail out, and the
card should survive a dead token. The sync is the only writer of the two data
tables and the OAuth flow the only writer of `oauth_tokens`.

Tokens live in the database rather than .env because they change without you:
a refresh mints a new access token every hour, and a reconnect replaces the
refresh token. .env is for things a human sets.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OAuthToken(Base):
    """One row per provider. Only `google_health` exists."""

    __tablename__ = "oauth_tokens"

    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    # Google reports `refresh_token_expires_in` for a Testing-status app, whose
    # refresh tokens die 7 days after consent however often they are used. Null
    # when Google does not say — then expiry is only discovered as invalid_grant.
    refresh_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scope: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Google's stable ids for the account, from /v4/users/me/identity. Stored
    # once at consent so a reconnect to a *different* account is noticeable.
    health_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    legacy_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Set when Google refuses the refresh token (invalid_grant). The row is kept
    # rather than deleted so the dashboard can say *why* it wants a reconnect.
    invalid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invalid_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class SleepSession(Base):
    """One sleep session — a night or a nap — as Google reports it."""

    __tablename__ = "sleep_sessions"

    # The id off the end of the data point's `name`
    # (`users/{uid}/dataTypes/sleep/dataPoints/{id}`). Server-generated and
    # stable across edits, so it is the upsert key.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # The local date you woke up on — the night of the 21st–22nd is "the 22nd",
    # which is how Fitbit files it and how the sync's window is filtered. Taken
    # from the session's own UTC offset, so a night away keeps its local date.
    wake_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Seconds east of UTC at the end of the session, as Google reported it.
    end_utc_offset_s: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_main: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_nap: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # STAGES (deep/light/REM) or CLASSIC (asleep/restless) — a short or badly
    # worn night falls back to classic.
    sleep_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # False while Google is still computing stages; a later sync fills them in.
    processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    minutes_asleep: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minutes_awake: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minutes_in_period: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minutes_to_fall_asleep: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deep_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    light_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rem_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    wake_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # The hypnogram: [[start_iso, end_iso, "DEEP"], ...]. Small, and the one
    # part of a night that cannot be rebuilt from the summary columns.
    stages: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    device: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The data point exactly as Google sent it. The parser was written against
    # docs whose own examples disagree with their schema, so the original is
    # kept: a wrong assumption is then a re-parse, not lost history.
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    upstream_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DailyActivity(Base):
    """One local day of totals. A column Google had nothing for stays null —
    an off-wrist day is not a day of zero steps."""

    __tablename__ = "daily_activity"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resting_hr: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    light_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    moderate_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    vigorous_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    calories_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
