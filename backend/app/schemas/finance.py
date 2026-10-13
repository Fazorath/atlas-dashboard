"""What the Money cards read.

Amounts are floats in one currency — the workspace's primary, named in
`currency` so the front end can format without guessing. Expenses are always a
positive magnitude; `net_month` is the signed one, and it is computed here so
no component does arithmetic on money.

`configured: false` is a 200 with empty fields, the same contract weather uses:
a source whose credentials are not filled in yet is a card that says how to
switch it on, never a red error. A *configured* source whose upstream is down is
the other case, and that one is a 502 — with no archive behind it there is no
last-good reading to fall back on, so the card has to say it could not reach
Securo rather than quietly showing nothing.
"""

from datetime import date, datetime

from pydantic import BaseModel


class CategorySpend(BaseModel):
    """One row of "where it went", biggest first."""

    name: str
    icon: str | None = None
    #: Securo's own category colour, e.g. "#ffb547" — see the note in
    #: `sources/securo.py`; this is the one mark in Atlas coloured by data.
    color: str | None = None
    amount: float
    #: 0–1, already divided down from Securo's percentage.
    share: float
    #: Securo's no-category bucket, renamed from "Sem categoria".
    uncategorised: bool = False


class Uncategorised(BaseModel):
    """Out with no category yet — the nudge beside the breakdown."""

    amount: float
    count: int


class Spending(BaseModel):
    """"Where it went": categorised spend only, with shares of *categorised*
    Out, and the uncategorised remainder said separately."""

    categories: list[CategorySpend] = []
    uncategorised: Uncategorised | None = None
    #: Where the nudge's "open Securo" goes; null when SECURO_PUBLIC_URL is unset.
    securo_url: str | None = None


class Account(BaseModel):
    id: str
    name: str
    institution: str | None = None
    kind: str
    balance: float
    currency: str


class Bill(BaseModel):
    date: date
    description: str
    amount: float
    currency: str
    category: str | None = None
    color: str | None = None


class Goal(BaseModel):
    name: str
    target: float
    current: float
    currency: str
    #: 0–1.
    share: float
    target_date: date | None = None
    on_track: str | None = None
    monthly_contribution: float | None = None
    color: str | None = None


class MonthPoint(BaseModel):
    """One month in the income-against-expenses trend, oldest first."""

    month: str
    income: float
    expenses: float
    net: float


class DayOut(BaseModel):
    """One calendar day's Out, transfers left out — the bars under This month."""

    date: date
    amount: float


class FinanceSummary(BaseModel):
    """Everything the Today tile and the Money hero need, in one request."""

    configured: bool
    detail: str | None = None

    currency: str = "USD"
    balance: float | None = None
    projected_balance: float | None = None
    #: The day the balance is stated as of, from Securo.
    balance_date: date | None = None

    income_month: float | None = None
    expenses_month: float | None = None
    net_month: float | None = None
    projected_income: float | None = None
    projected_expenses: float | None = None

    assets_value: float | None = None
    accounts_count: int | None = None
    #: Transactions Securo has not categorised yet — a nudge, not an error.
    pending_categorization: int | None = None

    #: When Atlas asked Securo. Always "just now" in practice: this is a live
    #: proxy, so the number on screen is never older than the request.
    fetched_at: datetime | None = None
