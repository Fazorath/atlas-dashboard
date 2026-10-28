"""Web Push delivery: the VAPID keypair and sending one payload to devices.

pywebpush is synchronous (requests), so each send runs in a thread. A device
the push service says is gone (404/410) is deleted; any other failure is kept
on the device row for the settings list and retried on the next run.
"""

import asyncio
import base64
import json
import logging
from datetime import UTC, datetime

import requests
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PushDevice, PushKeys

log = logging.getLogger(__name__)

#: The VAPID `sub` claim: who runs the sender. Apple refuses `localhost`
#: addresses and py_vapid only takes a mailto: or a bare https origin, so it is
#: the Manual's site rather than a made-up mailbox.
CONTACT = "https://fazorath.github.io"
#: How long the push service holds a message for a phone that is offline. A
#: shift reminder that arrives half a day late is only noise.
TTL_SECONDS = 4 * 3600
TIMEOUT_SECONDS = 10


async def keys(session: AsyncSession) -> PushKeys:
    """The keypair, made on first use. Only one row ever exists (id 1)."""
    row = await session.get(PushKeys, 1)
    if row is not None:
        return row
    vapid = Vapid()
    vapid.generate_keys()
    point = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    await session.execute(
        insert(PushKeys)
        .values(
            id=1,
            private_pem=vapid.private_pem().decode(),
            public_key=base64.urlsafe_b64encode(point).rstrip(b"=").decode(),
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    await session.commit()
    return await session.get(PushKeys, 1, populate_existing=True)


def _send_one(endpoint: str, p256dh: str, auth: str, pem: str, data: str) -> None:
    webpush(
        {"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
        data=data,
        vapid_private_key=Vapid.from_pem(pem.encode()),
        vapid_claims={"sub": CONTACT},
        ttl=TTL_SECONDS,
        timeout=TIMEOUT_SECONDS,
    )


def _gone(exc: Exception) -> bool:
    response = getattr(exc, "response", None)
    return isinstance(exc, WebPushException) and getattr(response, "status_code", None) in (
        404,
        410,
    )


def _reason(exc: Exception) -> str:
    response = getattr(exc, "response", None)
    if response is not None:
        return f"Push service answered {response.status_code}: {response.text[:200]}".strip()
    if isinstance(exc, requests.Timeout):
        return "Couldn't reach the push service: timed out. Can Atlas reach the internet?"
    if isinstance(exc, requests.ConnectionError):
        return "Couldn't reach the push service. Can Atlas reach the internet?"
    return str(exc)[:300] or type(exc).__name__


async def send(
    session: AsyncSession, devices: list[PushDevice], payload: dict[str, str]
) -> int:
    """Send `payload` to each device; returns how many took it. Commits."""
    pem = (await keys(session)).private_pem
    data = json.dumps(payload)
    rows = [(d.id, d.endpoint, d.p256dh, d.auth) for d in devices]
    results = await asyncio.gather(
        *(asyncio.to_thread(_send_one, e, p, a, pem, data) for _, e, p, a in rows),
        return_exceptions=True,
    )

    ok = 0
    now = datetime.now(UTC)
    for (device_id, *_), result in zip(rows, results, strict=True):
        device = await session.get(PushDevice, device_id)
        if device is None:
            continue
        if result is None:
            ok += 1
            device.last_ok_at, device.last_error = now, None
        elif _gone(result):
            log.info("push device %s is gone; dropping it", device_id)
            await session.delete(device)
        else:
            log.warning("push to device %s failed: %s", device_id, _reason(result))
            device.last_error = _reason(result)
    await session.commit()
    return ok


async def all_devices(session: AsyncSession) -> list[PushDevice]:
    return list((await session.execute(select(PushDevice).order_by(PushDevice.id))).scalars())


async def forget(session: AsyncSession, device_id: int) -> None:
    await session.execute(delete(PushDevice).where(PushDevice.id == device_id))
    await session.commit()
