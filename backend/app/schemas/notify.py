import hashlib
from datetime import datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.sync import SyncResult


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    created_at: datetime
    last_ok_at: datetime | None
    last_error: str | None
    #: sha256 of the endpoint, first 16 hex chars: lets a browser find its own
    #: row without the API handing endpoints back out.
    endpoint_hash: str

    @model_validator(mode="before")
    @classmethod
    def _hash(cls, data: Any) -> Any:
        endpoint = getattr(data, "endpoint", None)
        if endpoint is None:
            return data
        return {
            name: getattr(data, name)
            for name in ("id", "label", "created_at", "last_ok_at", "last_error")
        } | {"endpoint_hash": hashlib.sha256(endpoint.encode()).hexdigest()[:16]}


class AlertOut(BaseModel):
    id: str
    label: str
    detail: str
    #: The Area a tap opens, e.g. "/school".
    url: str
    enabled: bool
    #: Set for clock-time Alerts, else null.
    at: time | None
    #: Set for lead-time Alerts, else null.
    lead_minutes: int | None
    #: How the lead reads: "90 min before", or "6 h after".
    lead_word: Literal["before", "after"]


class NotifyOut(BaseModel):
    #: VAPID public key, base64url — what the browser subscribes with.
    public_key: str
    alerts: list[AlertOut]
    devices: list[DeviceOut]
    last_run: SyncResult | None


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class SubscribeIn(BaseModel):
    """`PushSubscription.toJSON()`, plus a label for the device list."""

    endpoint: str = Field(pattern=r"^https://", max_length=2000)
    keys: SubscriptionKeys
    label: str = Field(default="This device", max_length=80)


class AlertIn(BaseModel):
    enabled: bool
    at: time | None = None
    lead_minutes: int | None = Field(default=None, ge=5, le=24 * 60)
