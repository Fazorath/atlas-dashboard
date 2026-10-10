"""Money — Phase 3. A live proxy onto Securo; nothing financial is stored here.

Read `sources/securo.py` for the auth and the reshaping. This module is only
the seam between that and HTTP: it decides what an unconfigured source looks
like (a calm 200), what a dead upstream looks like (a 502), and how much of
Securo each card is allowed to ask for.

Why no archive: money already has a source of truth two containers away. A
second copy in Atlas could only ever drift out of date, and a finance number
that is quietly stale is worse than one that is honestly missing.
"""

import logging
from collections.abc import Awaitable
from datetime import date
from typing import TypeVar

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.schemas.finance import CategorySpend, FinanceSummary, MonthPoint
from app.sources import securo

log = logging.getLogger(__name__)

router = APIRouter(prefix="/finance", tags=["finance"])

NOT_CONFIGURED = (
    "Add SECURO_EMAIL and SECURO_PASSWORD to /srv/atlas/.env, then restart atlas-api."
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
        )
        for row in rows[:TOP_CATEGORIES]
    ]


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
