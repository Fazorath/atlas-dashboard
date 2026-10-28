"""One notify run: what is due now, minus what already went out, sent.

Cron calls this every 5 minutes as the hidden `notify` source, so every run
lands in `sync_runs`. Nothing is evaluated while no device is subscribed — and
nothing is marked sent either, so turning a device on later starts clean.
"""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NotifySent, NotifySetting
from app.modules import ENABLED
from app.notify import push
from app.notify.alerts import ALERTS, Alert, Item, Rule, local_now

log = logging.getLogger(__name__)

#: Lines shown before "+N more"; a lock screen cuts off long bodies anyway.
MAX_LINES = 5


async def rules(session: AsyncSession) -> dict[str, Rule]:
    """Every Alert's effective settings: your row where there is one."""
    rows = {r.alert: r for r in (await session.execute(select(NotifySetting))).scalars()}
    out = {}
    for alert in ALERTS:
        row = rows.get(alert.id)
        d = alert.default
        out[alert.id] = (
            d
            if row is None
            else Rule(
                enabled=row.enabled,
                at=row.at or d.at,
                lead_minutes=row.lead_minutes or d.lead_minutes,
            )
        )
    return out


def available(alert: Alert) -> bool:
    """An Alert whose module is off in atlas.yaml doesn't run or show."""
    return alert.module is None or alert.module in ENABLED


def payload(alert: Alert, items: list[Item]) -> dict[str, str]:
    lines = [i.line for i in items[:MAX_LINES]]
    if len(items) > MAX_LINES:
        lines.append(f"+{len(items) - MAX_LINES} more")
    # Same tag replaces an older notification of the same Alert on the device.
    return {"title": alert.title(items), "body": "\n".join(lines), "url": alert.url, "tag": alert.id}


async def run_notify(session: AsyncSession, now: datetime | None = None) -> int:
    """Returns how many notifications went out (one per Alert with news)."""
    devices = await push.all_devices(session)
    if not devices:
        return 0
    now = now or local_now()
    effective = await rules(session)

    sent = 0
    for alert in ALERTS:
        if not available(alert) or not effective[alert.id].enabled:
            continue
        items = await alert.collect(session, now, effective[alert.id])
        if not items:
            continue
        done = set(
            (
                await session.execute(
                    select(NotifySent.key).where(
                        NotifySent.alert == alert.id,
                        NotifySent.key.in_([i.key for i in items]),
                    )
                )
            ).scalars()
        )
        news = [i for i in items if i.key not in done]
        if not news:
            continue
        if await push.send(session, devices, payload(alert, news)) == 0:
            # Nobody took it; the window is still open, so the next run retries.
            log.warning("notify %s: no device accepted it", alert.id)
            continue
        await session.execute(
            insert(NotifySent)
            .values([{"alert": alert.id, "key": i.key} for i in news])
            .on_conflict_do_nothing()
        )
        await session.commit()
        sent += 1
        devices = await push.all_devices(session)
        if not devices:
            break
    return sent
