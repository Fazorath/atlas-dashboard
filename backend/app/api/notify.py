"""Notifications settings: devices, Alerts, and a test send (ADR 0007).

The sending itself is the `notify` source — cron's POST /api/sync/notify.
Anyone who can reach Atlas may turn a device on or off; changing an Alert's
switch or time is Owner-only (ADR 0008).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import NotifySetting, PushDevice, SyncRun
from app.notify import push
from app.notify.alerts import ALERT_BY_ID, ALERTS
from app.notify.run import available, rules
from app.owner import require_owner
from app.schemas.notify import AlertIn, AlertOut, DeviceOut, NotifyOut, SubscribeIn
from app.schemas.sync import SyncResult

router = APIRouter(prefix="/notify", tags=["notify"])


async def _alerts(session: AsyncSession) -> list[AlertOut]:
    effective = await rules(session)
    out = []
    for alert in ALERTS:
        if not available(alert):
            continue
        rule = effective[alert.id]
        out.append(
            AlertOut(
                id=alert.id,
                label=alert.label,
                detail=alert.detail,
                url=alert.url,
                enabled=rule.enabled,
                # Only the kind of timing the Alert has, so the form knows which field to show.
                at=rule.at if alert.default.at else None,
                lead_minutes=rule.lead_minutes if alert.default.lead_minutes else None,
                lead_word=alert.lead_word,
            )
        )
    return out


@router.get("", response_model=NotifyOut)
async def notify_root(session: AsyncSession = Depends(get_session)) -> NotifyOut:
    keys = await push.keys(session)
    last = (
        await session.execute(
            select(SyncRun)
            .where(SyncRun.source == "notify")
            .order_by(SyncRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return NotifyOut(
        public_key=keys.public_key,
        alerts=await _alerts(session),
        devices=[DeviceOut.model_validate(d) for d in await push.all_devices(session)],
        last_run=SyncResult.model_validate(last) if last else None,
    )


@router.post("/devices", response_model=DeviceOut)
async def subscribe(body: SubscribeIn, session: AsyncSession = Depends(get_session)) -> DeviceOut:
    """Turn notifications on for one browser. Subscribing again (same endpoint)
    refreshes its keys and label instead of adding a second row."""
    values = {
        "endpoint": body.endpoint,
        "p256dh": body.keys.p256dh,
        "auth": body.keys.auth,
        "label": body.label or "This device",
    }
    await session.execute(
        insert(PushDevice)
        .values(**values)
        .on_conflict_do_update(
            index_elements=["endpoint"],
            set_={k: v for k, v in values.items() if k != "endpoint"} | {"last_error": None},
        )
    )
    await session.commit()
    row = (
        await session.execute(select(PushDevice).where(PushDevice.endpoint == body.endpoint))
    ).scalar_one()
    return DeviceOut.model_validate(row)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(device_id: int, session: AsyncSession = Depends(get_session)) -> None:
    await push.forget(session, device_id)


@router.post("/devices/{device_id}/test", response_model=DeviceOut)
async def test_send(device_id: int, session: AsyncSession = Depends(get_session)) -> DeviceOut:
    device = await session.get(PushDevice, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="That device isn't subscribed any more.")
    payload = {
        "title": "Atlas",
        "body": "Notifications work on this device.",
        "url": "/status",
        "tag": "test",
    }
    if await push.send(session, [device], payload) == 0:
        device = await session.get(PushDevice, device_id, populate_existing=True)
        detail = device.last_error if device else "The push service says this device is gone."
        raise HTTPException(status_code=502, detail=detail or "The push service refused it.")
    device = await session.get(PushDevice, device_id, populate_existing=True)
    return DeviceOut.model_validate(device)


@router.put(
    "/alerts/{alert_id}", response_model=AlertOut, dependencies=[Depends(require_owner)]
)
async def set_alert(
    alert_id: str, body: AlertIn, session: AsyncSession = Depends(get_session)
) -> AlertOut:
    alert = ALERT_BY_ID.get(alert_id)
    if alert is None or not available(alert):
        raise HTTPException(status_code=404, detail=f"unknown alert {alert_id!r}")
    values = {
        "enabled": body.enabled,
        "at": body.at if alert.default.at else None,
        "lead_minutes": body.lead_minutes if alert.default.lead_minutes else None,
    }
    await session.execute(
        insert(NotifySetting)
        .values(alert=alert_id, **values)
        .on_conflict_do_update(index_elements=["user_id", "alert"], set_=values)
    )
    await session.commit()
    return next(a for a in await _alerts(session) if a.id == alert_id)
