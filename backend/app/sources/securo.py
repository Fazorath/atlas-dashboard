"""Securo. The only module in Atlas that knows what Securo looks like.

Securo is a **live proxy**, not an archive. Nothing financial is written to
Atlas's database, on purpose: money already has one source of truth two
containers away, and a second copy that drifts is worse than no copy. So this
module has no models, no migration and no upsert — it fetches, reshapes into
Atlas's own dataclasses, and hands them straight to the router.

Reached at `http://backend:8000` over Securo's compose network. The browser never calls
Securo directly: its CORS policy allows only its own frontend origin, and doing
it server-side keeps the credentials out of the bundle.

Auth, confirmed against Securo's code rather than its spec (which declares
the login response as `{}`):

  * `POST /api/auth/login`, form-urlencoded `username`/`password`
  * fastapi-users `BearerTransport` -> `{"access_token": ..., "token_type": ...}`
  * `JWTStrategy` with `access_token_expire_minutes = 60 * 24` — a 24h JWT and
    **no refresh token**, so the only renewal is logging in again.

Which is why the token is cached in memory with its own `exp`: one login per
day rather than one per card refresh, and nothing written to disk.
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

log = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(20.0)

# Renew a minute early rather than discover expiry as a 401 mid-request.
CLOCK_SKEW = timedelta(minutes=1)
# Used only if the token turns out not to be a JWT, or carries no `exp`.
# Securo's configured lifetime is 24h; guessing short costs one extra login,
# guessing long costs a failed request.
FALLBACK_LIFETIME = timedelta(hours=23)

# How many months the trend endpoint defaults to, and Securo's own ceiling.
TREND_MONTHS = 6
TREND_MONTHS_MAX = 12

UNCATEGORISED = "Uncategorised"


@dataclass(frozen=True)
class _Token:
    value: str
    expires_at: datetime


# One process, one token. The lock keeps a cold start with several cards
# loading at once from firing several logins.
_token_cache: _Token | None = None
_token_lock = asyncio.Lock()


@dataclass(frozen=True)
class MoneySnapshot:
    """"Finances at a glance", in Atlas's shape and one currency.

    Securo reports most totals twice: a per-currency object, and a `_primary`
    number already converted into the workspace's primary currency. Atlas reads
    the `_primary` numbers only — the dashboard shows one currency, and doing
    FX here would be inventing a second opinion about a rate Securo already has.
    """

    currency: str
    balance: float
    projected_balance: float
    balance_date: date | None
    income_month: float
    expenses_month: float
    projected_income: float
    projected_expenses: float
    assets_value: float
    accounts_count: int
    pending_categorization: int
    fetched_at: datetime

    @property
    def net_month(self) -> float:
        return self.income_month - self.expenses_month


@dataclass(frozen=True)
class CategorySpend:
    """One slice of this month's spending. `color` is Securo's own category
    colour — the one place in Atlas where a mark is coloured by data rather
    than by the area's accent, because these categories are already colour-coded
    in Securo and matching them is what makes the list recognisable."""

    name: str
    icon: str | None
    color: str | None
    amount: float
    share: float  # 0–1, not 0–100
    #: Out that Securo has no category for yet. Shown as a to-do beside the
    #: breakdown, never as a category of its own.
    uncategorised: bool = False


@dataclass(frozen=True)
class Account:
    """One account's balance, in its own currency."""

    id: str
    name: str
    institution: str | None
    kind: str
    balance: float
    currency: str


@dataclass(frozen=True)
class Bill:
    """An upcoming outflow Securo projects from a recurring transaction."""

    date: date
    description: str
    amount: float
    currency: str
    category: str | None
    color: str | None


@dataclass(frozen=True)
class DayOut:
    """One day's spending, in the primary currency."""

    date: date
    amount: float


@dataclass(frozen=True)
class Goal:
    name: str
    target: float
    current: float
    currency: str
    share: float  # 0–1
    target_date: date | None
    #: Securo's own verdict: "ahead", "on_track", "behind"… passed through.
    on_track: str | None
    monthly_contribution: float | None
    color: str | None


@dataclass(frozen=True)
class MonthPoint:
    """One month of income against expenses, oldest first."""

    month: str  # "2026-09"
    income: float
    expenses: float

    @property
    def net(self) -> float:
        return self.income - self.expenses


def _money(value: Any) -> float:
    """Securo sends amounts as JSON numbers, but a missing key must read as 0
    rather than blow up a whole card."""
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _outflow(value: Any) -> float:
    """Expenses as a positive magnitude.

    Securo reports spending as a positive number, but `abs()` costs nothing and
    means a sign-convention change upstream shows up as the wrong arithmetic in
    one place here rather than as a negative number on the card."""
    return abs(_money(value))


def _as_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _reason(response: httpx.Response) -> str:
    """The most useful sentence available about a bad response.

    Securo answers failures with `{"detail": ...}`; the one worth translating is
    the login rejection, because "LOGIN_BAD_CREDENTIALS" in a sync_runs row
    should say which two lines of .env to look at."""
    detail: Any = ""
    try:
        body = response.json()
        if isinstance(body, dict):
            detail = body.get("detail", "")
    except ValueError:
        detail = response.text[:200]

    if detail == "LOGIN_BAD_CREDENTIALS":
        return "SECURO_EMAIL or SECURO_PASSWORD is wrong"
    if isinstance(detail, str) and detail:
        return detail
    return str(detail) if detail else response.text[:200]


def _expiry(token: str) -> datetime:
    """When the cached token stops being usable, read from the JWT's own `exp`.

    The payload is decoded but deliberately **not** verified: Atlas does not
    hold Securo's signing secret and has no business checking a signature it is
    only going to hand straight back. The claim is used for cache scheduling,
    never for a trust decision — a forged `exp` would cost an extra login.
    """
    try:
        payload = token.split(".")[1]
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        exp = json.loads(raw)["exp"]
        return datetime.fromtimestamp(int(exp), UTC) - CLOCK_SKEW
    except (IndexError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        log.debug("securo token carries no usable exp; falling back to %s", FALLBACK_LIFETIME)
        return datetime.now(UTC) + FALLBACK_LIFETIME


async def _login(client: httpx.AsyncClient) -> _Token:
    response = await client.post(
        "/api/auth/login",
        data={"username": settings.securo_email, "password": settings.securo_password},
    )

    if response.status_code >= 400:
        raise RuntimeError(f"Securo login {response.status_code}: {_reason(response)}")

    payload = response.json() or {}

    # A 200 that is not a token: Securo answers a 2FA-enabled account with a
    # challenge instead. There is no unattended way past a TOTP prompt, so say
    # so plainly — this lands in sync_runs and on the card.
    if payload.get("requires_2fa"):
        raise RuntimeError(
            "Securo account has two-factor auth enabled; Atlas cannot log in "
            "unattended. Turn 2FA off for this account or give Atlas its own."
        )

    value = payload.get("access_token")
    if not value:
        raise RuntimeError(f"Securo login returned no access_token (keys: {sorted(payload)})")

    return _Token(value=value, expires_at=_expiry(value))


async def _bearer(client: httpx.AsyncClient) -> str:
    global _token_cache

    now = datetime.now(UTC)
    cached = _token_cache
    if cached and cached.expires_at > now:
        return cached.value

    async with _token_lock:
        # Re-read inside the lock: whoever held it may have just logged in.
        cached = _token_cache
        if cached and cached.expires_at > datetime.now(UTC):
            return cached.value

        token = await _login(client)
        _token_cache = token
        log.info("securo: logged in, token good until %s", token.expires_at.isoformat())
        return token.value


def _forget(used: str) -> None:
    """Drop the cached token after it was rejected — but only if it is still the
    one we used, so a concurrent refresh is not thrown away."""
    global _token_cache
    if _token_cache and _token_cache.value == used:
        _token_cache = None


async def _get(client: httpx.AsyncClient, path: str, params: dict[str, Any] | None = None) -> Any:
    """One authenticated GET, with a single re-login on 401.

    A 24h token that has been invalidated early — Securo restarted with a new
    secret, the password changed — is indistinguishable from an expired one
    until it is used. One retry turns that into a slow request instead of a
    broken card.
    """
    last: httpx.Response | None = None

    for attempt in (1, 2):
        token = await _bearer(client)
        headers = {"Authorization": f"Bearer {token}"}
        # Omitted means "the user's oldest workspace", which is what Securo's
        # own frontend falls back to. Set SECURO_WORKSPACE_ID to pin a
        # different one.
        if settings.securo_workspace_id:
            headers["X-Workspace-Id"] = settings.securo_workspace_id

        last = await client.get(path, params=params, headers=headers)

        if last.status_code == 401 and attempt == 1:
            log.info("securo: token rejected on %s, logging in again", path)
            _forget(token)
            continue

        if last.status_code >= 400:
            raise RuntimeError(f"Securo {path} {last.status_code}: {_reason(last)}")

        return last.json()

    raise RuntimeError(f"Securo {path}: still unauthorised after re-login")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=settings.securo_base_url.rstrip("/"), timeout=TIMEOUT)


def parse_snapshot(payload: dict[str, Any], fetched_at: datetime) -> MoneySnapshot:
    return MoneySnapshot(
        currency=payload.get("primary_currency") or "USD",
        balance=_money(payload.get("total_balance_primary")),
        projected_balance=_money(payload.get("projected_balance_primary")),
        balance_date=_as_date(payload.get("balance_date")),
        income_month=_money(payload.get("monthly_income_primary")),
        expenses_month=_outflow(payload.get("monthly_expenses_primary")),
        projected_income=_money(payload.get("projected_income_primary")),
        projected_expenses=_outflow(payload.get("projected_expenses_primary")),
        assets_value=_money(payload.get("assets_value_primary")),
        accounts_count=int(payload.get("accounts_count") or 0),
        pending_categorization=int(payload.get("pending_categorization") or 0),
        fetched_at=fetched_at,
    )


def parse_categories(payload: Any) -> list[CategorySpend]:
    if not isinstance(payload, list):
        return []

    rows = [
        CategorySpend(
            # Securo names its no-category bucket in the server's language
            # ("Sem categoria"); the null id is what actually identifies it.
            name=(
                UNCATEGORISED
                if row.get("category_id") is None
                else row.get("category_name") or UNCATEGORISED
            ),
            icon=row.get("category_icon") or None,
            color=row.get("category_color") or None,
            amount=_outflow(row.get("total")),
            # Securo sends a percentage; Atlas carries fractions, so the bar
            # width is the number and no component divides by 100.
            share=max(0.0, min(1.0, _money(row.get("percentage")) / 100)),
            uncategorised=row.get("category_id") is None,
        )
        for row in payload
        if isinstance(row, dict)
    ]
    # Biggest first: the list is read top-down and stops being interesting
    # somewhere around the fifth row.
    return sorted(rows, key=lambda r: r.amount, reverse=True)


def parse_trend(payload: Any) -> list[MonthPoint]:
    if not isinstance(payload, list):
        return []

    points = [
        MonthPoint(
            month=str(row.get("month") or ""),
            income=_money(row.get("income")),
            expenses=_outflow(row.get("expenses")),
        )
        for row in payload
        if isinstance(row, dict)
    ]
    return sorted(points, key=lambda p: p.month)


async def fetch_snapshot() -> MoneySnapshot:
    async with _client() as client:
        payload = await _get(client, "/api/dashboard/summary")
    return parse_snapshot(payload or {}, datetime.now(UTC))


async def fetch_categories(month: date | None = None) -> list[CategorySpend]:
    params = {"month": month.isoformat()} if month else None
    async with _client() as client:
        payload = await _get(client, "/api/dashboard/spending-by-category", params)
    return parse_categories(payload)


async def fetch_trend(months: int = TREND_MONTHS) -> list[MonthPoint]:
    months = max(1, min(TREND_MONTHS_MAX, months))
    async with _client() as client:
        payload = await _get(client, "/api/dashboard/monthly-trend", {"months": months})
    return parse_trend(payload)


def parse_accounts(payload: Any) -> list[Account]:
    if not isinstance(payload, list):
        return []
    accounts = [
        Account(
            id=str(row.get("id") or ""),
            name=row.get("display_name") or row.get("name") or "Account",
            institution=row.get("institution_name") or None,
            kind=str(row.get("type") or ""),
            balance=_money(row.get("current_balance", row.get("balance"))),
            currency=row.get("currency") or "USD",
        )
        for row in payload
        if isinstance(row, dict) and not row.get("is_closed")
    ]
    # Largest magnitude first: a card's debt matters as much as savings do.
    return sorted(accounts, key=lambda a: abs(a.balance), reverse=True)


def parse_bills(payload: Any) -> list[Bill]:
    if not isinstance(payload, list):
        return []
    bills = []
    for row in payload:
        if not isinstance(row, dict) or str(row.get("type")) != "debit":
            continue
        day = _as_date(row.get("date"))
        if day is None:
            continue
        amount = row.get("amount_primary")
        bills.append(
            Bill(
                date=day,
                description=str(row.get("description") or "Bill"),
                amount=_outflow(amount if amount is not None else row.get("amount")),
                currency=row.get("currency") or "USD",
                category=row.get("category_name") or None,
                color=row.get("category_color") or None,
            )
        )
    return sorted(bills, key=lambda b: (b.date, b.description))


def parse_goals(payload: Any) -> list[Goal]:
    if not isinstance(payload, list):
        return []
    goals = []
    for row in payload:
        if not isinstance(row, dict) or row.get("status", "active") != "active":
            continue
        target = _money(row.get("target_amount_primary") or row.get("target_amount"))
        current = _money(row.get("current_amount_primary") or row.get("current_amount"))
        contribution = row.get("monthly_contribution")
        goals.append(
            Goal(
                name=str(row.get("name") or "Goal"),
                target=target,
                current=current,
                currency=row.get("currency") or "USD",
                share=max(0.0, min(1.0, _money(row.get("percentage")) / 100)),
                target_date=_as_date(row.get("target_date")),
                on_track=row.get("on_track") or None,
                monthly_contribution=_money(contribution) if contribution is not None else None,
                color=row.get("color") or None,
            )
        )
    return goals


async def fetch_accounts() -> list[Account]:
    async with _client() as client:
        return parse_accounts(await _get(client, "/api/accounts"))


async def fetch_bills(start: date, end: date) -> list[Bill]:
    """Projected outflows in [start, end] — what Securo expects to leave from
    recurring transactions you have set up there."""
    params = {"from": start.isoformat(), "to": end.isoformat()}
    async with _client() as client:
        return parse_bills(await _get(client, "/api/dashboard/projected-transactions", params))


async def fetch_goals() -> list[Goal]:
    async with _client() as client:
        return parse_goals(await _get(client, "/api/goals"))


async def fetch_uncategorised_count(start: date, end: date) -> int:
    """How many outgoing transactions in [start, end] have no category — the
    "N transactions" in Money's nudge. One row is asked for; `total` is read."""
    params = {
        "uncategorized": "true",
        "type": "debit",
        "exclude_ignored": "true",
        "from": start.isoformat(),
        "to": end.isoformat(),
        "limit": 1,
    }
    async with _client() as client:
        payload = await _get(client, "/api/transactions", params)
    try:
        return int((payload or {}).get("total") or 0)
    except (TypeError, ValueError, AttributeError):
        return 0


#: Securo's page size for `/api/transactions`; a month is rarely one page short.
PAGE_LIMIT = 500


def parse_daily_out(items: Any, start: date, end: date) -> list[DayOut]:
    """Every day in [start, end] with what left that day, zeros included.

    Transfers between your own accounts (a card payment from checking) are not
    spending; leaving out the rows Securo pairs as transfers is what makes the
    days add up to its own month Out."""
    totals: dict[date, float] = {}
    for row in items if isinstance(items, list) else []:
        if not isinstance(row, dict) or row.get("transfer_pair_id"):
            continue
        day = _as_date(row.get("date"))
        if day is None or not start <= day <= end:
            continue
        amount = row.get("amount_primary")
        totals[day] = totals.get(day, 0.0) + _outflow(
            amount if amount is not None else row.get("amount")
        )
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    return [DayOut(date=d, amount=round(totals.get(d, 0.0), 2)) for d in days]


async def fetch_daily_out(start: date, end: date) -> list[DayOut]:
    """Out per day over [start, end], read page by page from the transaction
    list — Securo has no per-day aggregate."""
    params: dict[str, Any] = {
        "type": "debit",
        "exclude_ignored": "true",
        "from": start.isoformat(),
        "to": end.isoformat(),
        "limit": PAGE_LIMIT,
    }
    items: list[Any] = []
    async with _client() as client:
        # Bounded, so a paging bug upstream can't spin forever.
        for page in range(1, 21):
            payload = await _get(client, "/api/transactions", {**params, "page": page}) or {}
            batch = payload.get("items") or []
            items.extend(batch)
            if len(batch) < PAGE_LIMIT or len(items) >= int(payload.get("total") or 0):
                break
    return parse_daily_out(items, start, end)


async def check_securo(session: AsyncSession) -> int:
    """The registry's entry point — a reachability probe, not a sync.

    There is nothing to write, so this returns 0 rows every time. Its job is to
    put a dated row in `sync_runs`: the Sources strip then says "live" while
    Securo answers and "unreachable" the moment it stops, which is how a broken
    login or an expired password gets noticed without opening the Money page.
    """
    snapshot = await fetch_snapshot()
    log.info(
        "securo: reachable, %d accounts in %s",
        snapshot.accounts_count,
        snapshot.currency,
    )
    return 0
