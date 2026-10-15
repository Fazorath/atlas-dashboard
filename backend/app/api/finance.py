"""Money — Phase 3. A live proxy onto Securo; nothing financial is stored here.

Read `sources/securo.py` for the auth and the reshaping. This module is only
the seam between that and HTTP: it decides what an unconfigured source looks
like (a calm 200), what a dead upstream looks like (a 502), and how much of
Securo each card is allowed to ask for.

Why no archive: money already has a source of truth two containers away. A
second copy in Atlas could only ever drift out of date, and a finance number
that is quietly stale is worse than one that is honestly missing.
"""

import asyncio
import logging
from collections.abc import Awaitable
from datetime import date, timedelta
from typing import TypeVar

from fastapi import APIRouter, HTTPException, Query

from app.clock import local_today
from app.config import settings
from app.schemas.finance import (
    Account,
    Bill,
    CategorySpend,
    DayOut,
    FinanceSummary,
    Goal,
    MonthPoint,
    Spending,
    Uncategorised,
)
from app.sources import securo

log = logging.getLogger(__name__)

router = APIRouter(prefix="/finance", tags=["finance"])

NOT_CONFIGURED = (
    "Add SECURO_EMAIL and SECURO_PASSWORD to .env, then run docker compose up -d atlas-api."
)

#: How many category rows the Money page will draw before the list stops being
#: readable. Asking Securo for fewer is not an option — it returns them all —
#: so the trim happens here rather than in the browser.
TOP_CATEGORIES = 8

T = TypeVar("T")


async def _upstream(call: Awaitable[T]) -> T:
    """Run one Securo call, turning any failure into a 502.

    Deliberately not the weather pattern of always answering 200: weather can
    fall back on its archive, and this cannot. A card with no number and no
    error would just look broken, so the failure is stated.
    """
    try:
        return await call
    except Exception as exc:
        log.warning("securo: %s", exc)
        # The source module already names Securo in the failures it raises
        # itself; only a transport error arrives here unlabelled, and
        # "All connection attempts failed" on its own says nothing useful.
        message = str(exc) or type(exc).__name__
        if not message.startswith("Securo"):
            message = f"Securo unreachable — {message}"
        raise HTTPException(status_code=502, detail=message) from exc


@router.get("/", response_model=FinanceSummary)
async def finance_root() -> FinanceSummary:
    if not settings.securo_configured:
        return FinanceSummary(configured=False, detail=NOT_CONFIGURED)

    snapshot = await _upstream(securo.fetch_snapshot())

    return FinanceSummary(
        configured=True,
        currency=snapshot.currency,
        balance=snapshot.balance,
        projected_balance=snapshot.projected_balance,
        balance_date=snapshot.balance_date,
        income_month=snapshot.income_month,
        expenses_month=snapshot.expenses_month,
        net_month=snapshot.net_month,
        projected_income=snapshot.projected_income,
        projected_expenses=snapshot.projected_expenses,
        assets_value=snapshot.assets_value,
        accounts_count=snapshot.accounts_count,
        pending_categorization=snapshot.pending_categorization,
        fetched_at=snapshot.fetched_at,
    )


@router.get("/categories", response_model=list[CategorySpend])
async def finance_categories(
    month: date | None = Query(
        default=None,
        description="Any day in the month to report on. Defaults to the current month.",
    ),
) -> list[CategorySpend]:
    """This month's spending broken down by category, biggest first.

    An empty list when the source is unconfigured, not a 4xx: the Money page
    renders its own setup state from `GET /api/finance/`, and a second error
    there would only be noise.
    """
    if not settings.securo_configured:
        return []

    rows = await _upstream(securo.fetch_categories(month))
    return [
        CategorySpend(
            name=row.name,
            icon=row.icon,
            color=row.color,
            amount=row.amount,
            share=row.share,
            uncategorised=row.uncategorised,
        )
        for row in rows[:TOP_CATEGORIES]
    ]


def _month_bounds(day: date) -> tuple[date, date]:
    start = day.replace(day=1)
    following = (start + timedelta(days=32)).replace(day=1)
    return start, following - timedelta(days=1)


@router.get("/spending", response_model=Spending)
async def finance_spending() -> Spending:
    """This month's Out by category — categorised spend only, each share a
    fraction of categorised Out — with the Uncategorised remainder and its
    transaction count said once, beside it, as a to-do."""
    if not settings.securo_configured:
        return Spending()

    start, end = _month_bounds(local_today())
    rows, count = await _upstream(
        asyncio.gather(securo.fetch_categories(), securo.fetch_uncategorised_count(start, end))
    )
    categorised = [r for r in rows if not r.uncategorised]
    total = sum(r.amount for r in categorised)
    loose = sum(r.amount for r in rows if r.uncategorised)

    return Spending(
        categories=[
            CategorySpend(
                name=r.name,
                icon=r.icon,
                color=r.color,
                amount=r.amount,
                share=r.amount / total if total > 0 else 0.0,
            )
            for r in categorised[:TOP_CATEGORIES]
        ],
        uncategorised=Uncategorised(amount=loose, count=count) if loose > 0 or count else None,
        securo_url=settings.securo_public_url.rstrip("/") or None,
    )


@router.get("/daily", response_model=list[DayOut])
async def finance_daily(
    month: date | None = Query(
        default=None,
        description="Any day in the month to report on. Defaults to the current month.",
    ),
) -> list[DayOut]:
    """Out per day from the 1st through today (or the month's last day, for a
    past month), transfers left out. The bars under This month."""
    if not settings.securo_configured:
        return []
    today = local_today()
    start, end = _month_bounds(month or today)
    if start > today:
        return []
    days = await _upstream(securo.fetch_daily_out(start, min(end, today)))
    return [DayOut(date=d.date, amount=d.amount) for d in days]


@router.get("/accounts", response_model=list[Account])
async def finance_accounts() -> list[Account]:
    """Every open account's balance, largest magnitude first."""
    if not settings.securo_configured:
        return []
    return [Account(**vars(a)) for a in await _upstream(securo.fetch_accounts())]


@router.get("/bills", response_model=list[Bill])
async def finance_bills(days: int = Query(default=30, ge=1, le=92)) -> list[Bill]:
    """Outflows Securo projects from today through the next `days`, soonest
    first. Only recurring transactions set up in Securo appear here."""
    if not settings.securo_configured:
        return []
    today = local_today()
    bills = await _upstream(securo.fetch_bills(today, today + timedelta(days=days)))
    return [Bill(**vars(b)) for b in bills]


@router.get("/goals", response_model=list[Goal])
async def finance_goals() -> list[Goal]:
    """Active savings goals, in Securo's order."""
    if not settings.securo_configured:
        return []
    return [Goal(**vars(g)) for g in await _upstream(securo.fetch_goals())]


@router.get("/trend", response_model=list[MonthPoint])
async def finance_trend(
    months: int = Query(default=securo.TREND_MONTHS, ge=1, le=securo.TREND_MONTHS_MAX),
) -> list[MonthPoint]:
    """Income against expenses, oldest month first."""
    if not settings.securo_configured:
        return []

    points = await _upstream(securo.fetch_trend(months))
    return [
        MonthPoint(month=p.month, income=p.income, expenses=p.expenses, net=p.net) for p in points
    ]
