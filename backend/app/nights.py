"""Which sleep session is a date's Night.

Shared by the Health screens and by Measured habits, so "how long did I sleep
on the 9th" has one answer everywhere: the session Google flags as main sleep,
else the longest that isn't a nap, else the longest — filed under the local
date you woke up.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SleepSession


async def main_nights(
    session: AsyncSession, since: date, until: date | None = None
) -> list[SleepSession]:
    """One session per wake date in [since, until], oldest first."""
    stmt = select(SleepSession).where(SleepSession.wake_date >= since)
    if until is not None:
        stmt = stmt.where(SleepSession.wake_date <= until)
    rows = (
        await session.execute(stmt.order_by(SleepSession.wake_date, SleepSession.start_at))
    ).scalars()

    best: dict[date, SleepSession] = {}
    for row in rows:
        rank = (row.is_main, not row.is_nap, row.minutes_asleep or 0)
        held = best.get(row.wake_date)
        if held is None or rank > (held.is_main, not held.is_nap, held.minutes_asleep or 0):
            best[row.wake_date] = row
    return [best[d] for d in sorted(best)]
