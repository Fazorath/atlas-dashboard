"""Notifications — Web Push to the devices you turned them on for (ADR 0007).

- `push_devices`: one row per browser subscription. The endpoint is the push
  service's URL for that one device; a device that answers 404/410 has gone and
  its row is dropped.
- `notify_settings`: your changes to an Alert's on/off and time/lead. An Alert
  with no row runs at its defaults, which live with the Alert in code.
- `notify_sent`: what has already gone out, as (alert, key). The key names the
  thing (an assignment and its due time, a Shift's date and start), so each
  thing alerts once and a moved due time can alert again.
- `push_keys`: the VAPID keypair, made on first use so there is no .env step.
  Rotating it would orphan every subscription, so it is never rewritten.

`user_id` is designed in ahead of accounts (M2), as on boards.
"""

from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.board import OWNER_ID


class PushDevice(Base):
    __tablename__ = "push_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, default=OWNER_ID, server_default=str(OWNER_ID), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    #: What the browser said it was ("iPhone", "Mac · Safari"), for the list.
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: The last delivery error short of the device being gone, e.g. a timeout.
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class NotifySetting(Base):
    __tablename__ = "notify_settings"

    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=OWNER_ID, server_default=str(OWNER_ID)
    )
    alert: Mapped[str] = mapped_column(String(40), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    #: Clock-time Alerts ("19:00").
    at: Mapped[time | None] = mapped_column(Time, nullable=True)
    #: Lead-time Alerts ("90 minutes before").
    lead_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)


class NotifySent(Base):
    __tablename__ = "notify_sent"

    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=OWNER_ID, server_default=str(OWNER_ID)
    )
    alert: Mapped[str] = mapped_column(String(40), primary_key=True)
    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PushKeys(Base):
    __tablename__ = "push_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    private_pem: Mapped[str] = mapped_column(Text, nullable=False)
    #: The base64url uncompressed P-256 point the browser subscribes with.
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
