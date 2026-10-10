"""Fitbit, via the Google Health API. The only module in Atlas that knows what
Google Health or Google OAuth look like.

Why not the Fitbit Web API: `dev.fitbit.com` was turned down in September 2026
and its tokens do not carry over. Nearly every tutorial online still describes
it. This targets `health.googleapis.com/v4`, read from its discovery document
(revision 20260916) rather than from the guides, whose examples disagree with
the schema in places (see `parse_sleep` on `mainSleep`). Sleep efficiency is
not a Google field at all; app/api/sleep.py computes it.

The sharp edge is the token, not the data:

* Every Google Health scope is **Restricted**, so a personal, unverified app
  stays in "Testing" publishing status, where a refresh token **expires 7 days
  after consent however often it is used**. Google reports the deadline as
  `refresh_token_expires_in`; it is stored, so the dashboard can say "reconnect
  by Friday" before the sync fails rather than after.
* Google does not rotate refresh tokens on use. If a refresh response ever does
  carry a new one, it is stored anyway.
* An expired or revoked refresh token is `invalid_grant`. That marks the token
  row invalid and fails the sync with a message the Sleep screen turns into a
  Reconnect button. The row is kept, not deleted, so the screen can say why.

What gets archived, and from where:

  sleep            GET  dataTypes/sleep/dataPoints          (list, 25 a page)
  steps            POST dataTypes/steps/dataPoints:dailyRollUp
  active minutes   POST dataTypes/active-minutes/...:dailyRollUp   (14-day cap)
  calories         POST dataTypes/total-calories/...:dailyRollUp   (14-day cap)
  resting HR       GET  dataTypes/daily-resting-heart-rate/dataPoints
                   (not rollable — a roll-up returns a personal *range*)

Paths are kebab-case, filter fields snake_case (`daily_resting_heart_rate.date`);
mixing them is a 400. Every int64 arrives as a JSON string.
"""

import asyncio
import logging
import secrets
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import local_today
from app.config import settings
from app.models import DailyActivity, OAuthToken, SleepSession

log = logging.getLogger(__name__)

PROVIDER = "google_health"
TIMEOUT = httpx.Timeout(30.0)

_SCOPE = "https://www.googleapis.com/auth/googlehealth."
#: Resting heart rate is a "health metric", not activity — without the third
#: scope `daily-resting-heart-rate` answers 403 MISSING_OAUTH_SCOPE.
SCOPES: dict[str, str] = {
    "sleep": _SCOPE + "sleep.readonly",
    "activity": _SCOPE + "activity_and_fitness.readonly",
    "heart rate": _SCOPE + "health_metrics_and_measurements.readonly",
}

#: A normal run re-reads the last week: Google finishes staging a night after
#: the fact (`processed: false` until then) and lets you edit sessions, so
#: recent nights are re-fetched until they settle.
LOOKBACK_DAYS = 7
#: The first run after connecting pulls this much history instead.
BACKFILL_DAYS = 90
#: `active-minutes` and `total-calories` refuse a roll-up range over 14 days.
ROLLUP_CHUNK_DAYS = 14
SLEEP_PAGE_SIZE = 25  # also Google's maximum for sleep

#: Renew this early rather than discover expiry as a 401 mid-sync.
CLOCK_SKEW = timedelta(minutes=2)
#: How long a Connect click stays valid before its `state` is forgotten.
STATE_TTL_S = 15 * 60

RECONNECT = "Reconnect on the Sleep page."


class NotConnected(RuntimeError):
    """Configured, but nobody has signed in through it yet."""


class Disconnected(RuntimeError):
    """Signed in once; Google no longer accepts the token."""


# --- OAuth: consent --------------------------------------------------------

# state -> monotonic time it was issued. One process, one user: an in-memory
# map is enough, and a restart mid-consent costs one more click.
_pending_states: dict[str, float] = {}
_refresh_lock = asyncio.Lock()


def paste_back() -> bool:
    """True when the registered redirect is a loopback address. Google sends
    the browser there, nothing answers, and the code is read out of the address
    bar instead — the Sleep screen asks for it to be pasted."""
    host = (urlsplit(settings.google_oauth_redirect_uri).hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1")


def authorization_url() -> str:
    now = time.monotonic()
    for stale in [s for s, t in _pending_states.items() if now - t > STATE_TTL_S]:
        _pending_states.pop(stale, None)

    state = secrets.token_urlsafe(24)
    _pending_states[state] = now
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES.values()),
        # offline: a refresh token at all. consent: a *new* one on every
        # reconnect — without it Google may skip the screen and return none.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{settings.google_oauth_auth_url}?{urlencode(params)}"


def code_from_url(url: str) -> tuple[str, str]:
    """Pull `code` and `state` out of the address the browser landed on — the
    paste-back path. Raises ValueError with something a person can act on."""
    query = parse_qs(urlsplit(url.strip()).query)
    if "error" in query:
        raise ValueError(f"Google answered {query['error'][0]} — the connection was not approved.")
    code, state = query.get("code", [""])[0], query.get("state", [""])[0]
    if not code or not state:
        raise ValueError("That address has no code in it. Paste the whole URL from the address bar.")
    return code, state


def _utc(seconds: object) -> datetime | None:
    try:
        return datetime.now(UTC) + timedelta(seconds=int(seconds))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


async def _token_request(data: dict[str, str]) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            return await client.post(settings.google_oauth_token_url, data=data)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Google sign-in unreachable: {type(exc).__name__}") from None


def _oauth_error(response: httpx.Response) -> tuple[str, str]:
    try:
        body = response.json()
    except ValueError:
        return "", response.text[:200]
    return str(body.get("error", "")), str(body.get("error_description", ""))


async def complete_consent(session: AsyncSession, code: str, state: str) -> OAuthToken:
    """Trade the consent code for tokens and store them, replacing any old row."""
    if _pending_states.pop(state, None) is None:
        raise ValueError("That sign-in link has expired or was already used. Press Connect again.")

    response = await _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
        }
    )
    if response.status_code >= 400:
        error, description = _oauth_error(response)
        if error == "redirect_uri_mismatch":
            description = "GOOGLE_OAUTH_REDIRECT_URI must match the client's redirect URI exactly"
        raise ValueError(f"Google refused the code ({error or response.status_code}): {description}")

    body = response.json()
    if not body.get("refresh_token"):
        # Only happens without prompt=consent, which authorization_url always
        # sends — but a token with no refresh half would die within the hour.
        raise ValueError(
            "Google returned no refresh token. Remove Atlas at "
            "myaccount.google.com/permissions, then connect again."
        )

    now = datetime.now(UTC)
    row = {
        "provider": PROVIDER,
        "access_token": body["access_token"],
        "access_expires_at": _utc(body.get("expires_in", 3600)) or now,
        "refresh_token": body["refresh_token"],
        "refresh_expires_at": _utc(body.get("refresh_token_expires_in")),
        "scope": body.get("scope", ""),
        "health_user_id": None,
        "legacy_user_id": None,
        "connected_at": now,
        "updated_at": now,
        "invalid_at": None,
        "invalid_reason": None,
    }

    # Best effort: Google recommends keeping both ids from first consent, and
    # a failure here should not throw away a perfectly good token.
    try:
        async with _client() as client:
            identity = await _get(client, body["access_token"], "/v4/users/me/identity", "identity")
        row["health_user_id"] = identity.get("healthUserId")
        row["legacy_user_id"] = identity.get("legacyUserId")
    except Exception as exc:  # noqa: BLE001
        log.warning("google health identity lookup failed: %s", exc)

    stmt = insert(OAuthToken).values(row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["provider"], set_={k: stmt.excluded[k] for k in row if k != "provider"}
    )
    await session.execute(stmt)
    await session.commit()
    return await session.get(OAuthToken, PROVIDER, populate_existing=True)


async def disconnect(session: AsyncSession) -> None:
    """Revoke at Google (best effort) and forget the token. Archived nights stay."""
    token = await session.get(OAuthToken, PROVIDER)
    if token is None:
        return
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            await client.post(settings.google_oauth_revoke_url, data={"token": token.refresh_token})
    except httpx.HTTPError as exc:
        log.warning("google token revoke failed, forgetting it anyway: %s", exc)
    await session.delete(token)
    await session.commit()


# --- OAuth: using the token ------------------------------------------------

def missing_scopes(granted: str) -> list[str]:
    """Google's consent screen lets you untick individual scopes."""
    have = set(granted.split())
    return [label for label, scope in SCOPES.items() if scope not in have]


async def _mark_invalid(session: AsyncSession, token: OAuthToken, reason: str) -> None:
    # Committed here, before raising: the sync runner rolls the session back on
    # any exception, and the reconnect prompt depends on this surviving.
    token.invalid_at = datetime.now(UTC)
    token.invalid_reason = reason
    await session.commit()


async def access_token(session: AsyncSession) -> str:
    """A live access token, refreshing if needed. Raises NotConnected or
    Disconnected — both mean a person has to press a button."""
    async with _refresh_lock:
        token = await session.get(OAuthToken, PROVIDER, populate_existing=True)
        if token is None:
            raise NotConnected("Fitbit is not connected yet. Connect on the Sleep page.")
        if token.invalid_at is not None:
            raise Disconnected(f"{token.invalid_reason or 'Google refused the token'}. {RECONNECT}")

        now = datetime.now(UTC)
        if token.refresh_expires_at is not None and token.refresh_expires_at <= now:
            await _mark_invalid(session, token, "Google's 7-day sign-in window ran out")
            raise Disconnected(f"Google's 7-day sign-in window ran out. {RECONNECT}")

        if token.access_expires_at - CLOCK_SKEW > now:
            return token.access_token

        response = await _token_request(
            {
                "grant_type": "refresh_token",
                "refresh_token": token.refresh_token,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
            }
        )
        if response.status_code >= 400:
            error, description = _oauth_error(response)
            if error == "invalid_grant":
                reason = "Google no longer accepts the sign-in (expired or revoked)"
                await _mark_invalid(session, token, reason)
                raise Disconnected(f"{reason}. {RECONNECT}")
            if error == "invalid_client":
                raise RuntimeError(
                    "Google rejected the OAuth client — check GOOGLE_OAUTH_CLIENT_ID and "
                    "GOOGLE_OAUTH_CLIENT_SECRET"
                )
            raise RuntimeError(f"Google token refresh failed ({error or response.status_code}): {description}")

        body = response.json()
        token.access_token = body["access_token"]
        token.access_expires_at = _utc(body.get("expires_in", 3600)) or now
        if body.get("refresh_token"):
            token.refresh_token = body["refresh_token"]
        if body.get("refresh_token_expires_in") is not None:
            token.refresh_expires_at = _utc(body["refresh_token_expires_in"])
        if body.get("scope"):
            token.scope = body["scope"]
        token.updated_at = now
        await session.commit()
        return token.access_token


# --- HTTP ------------------------------------------------------------------

def _raise_for(response: httpx.Response, what: str) -> None:
    if response.status_code < 400:
        return
    try:
        err = (response.json() or {}).get("error", {})
        message, status = str(err.get("message", "")), str(err.get("status", ""))
    except (ValueError, AttributeError):
        message, status = response.text[:200], ""
    if "UberMint" in message:
        raise RuntimeError(
            "Google Health refused the account: the Fitbit login is not a Google account yet. "
            "Sign in to the Fitbit app with “Continue with Google”, then reconnect."
        )
    if response.status_code == 403 and "SCOPE" in (message + status).upper():
        raise RuntimeError(f"Google Health {what}: permission missing — reconnect and leave every box ticked")
    if response.status_code == 401:
        raise Disconnected(f"Google Health rejected the access token. {RECONNECT}")
    raise RuntimeError(f"Google Health {what} answered {response.status_code} {status}: {message}".strip())


def _client() -> httpx.AsyncClient:
    """One per sync, shared by every page and chunk — a backfill is ~25 calls."""
    return httpx.AsyncClient(base_url=settings.google_health_base_url, timeout=TIMEOUT)


async def _get(
    client: httpx.AsyncClient,
    token: str,
    path: str,
    what: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = await client.get(path, params=params, headers={"Authorization": f"Bearer {token}"})
    _raise_for(response, what)
    return response.json()


async def _post(
    client: httpx.AsyncClient, token: str, path: str, what: str, body: dict[str, Any]
) -> dict[str, Any]:
    response = await client.post(path, json=body, headers={"Authorization": f"Bearer {token}"})
    _raise_for(response, what)
    return response.json()


# --- Parsing ---------------------------------------------------------------

def _int(value: object) -> int | None:
    """int64 fields arrive as strings; absent is None, not 0."""
    if value is None or value == "":
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _offset_s(value: str | None) -> int:
    """Google writes UTC offsets as Duration strings: "-14400s"."""
    if not value:
        return 0
    try:
        return int(float(value.rstrip("s")))
    except ValueError:
        return 0


def _civil(d: date) -> dict[str, Any]:
    # Integers, never zero-padded strings — `07` is an octal literal to
    # Google's JSON parser and a 400.
    return {"date": {"year": d.year, "month": d.month, "day": d.day}}


def _civil_date(value: dict[str, Any] | None) -> date | None:
    d = (value or {}).get("date") or {}
    try:
        return date(int(d["year"]), int(d["month"]), int(d["day"]))
    except (KeyError, TypeError, ValueError):
        return None


@dataclass(frozen=True)
class Night:
    """Just enough of a parsed session for the sync to decide what to keep."""

    id: str
    wake_date: date
    row: dict[str, Any]


def parse_sleep(point: dict[str, Any], fetched_at: datetime) -> Night | None:
    sleep = point.get("sleep") or {}
    interval = sleep.get("interval") or {}
    start, end = _ts(interval.get("startTime")), _ts(interval.get("endTime"))
    name = point.get("name") or ""
    if not name or start is None or end is None:
        return None

    point_id = name.rsplit("/", 1)[-1]
    offset = _offset_s(interval.get("endUtcOffset"))
    wake_date = end.astimezone(timezone(timedelta(seconds=offset))).date()

    summary = sleep.get("summary") or {}
    stage_minutes = {
        s.get("type"): _int(s.get("minutes")) for s in summary.get("stagesSummary") or []
    }
    metadata = sleep.get("metadata") or {}
    source = point.get("dataSource") or {}

    row = {
        "id": point_id,
        "start_at": start,
        "end_at": end,
        "wake_date": wake_date,
        "end_utc_offset_s": offset,
        # The schema says `mainSleep`; the guide's own worked example says
        # `main`. Believe either.
        "is_main": bool(metadata.get("mainSleep", metadata.get("main", False))),
        "is_nap": bool(metadata.get("nap", False)),
        "sleep_type": sleep.get("type") or "STAGES",
        "processed": bool(metadata.get("processed", True)),
        "minutes_asleep": _int(summary.get("minutesAsleep")),
        "minutes_awake": _int(summary.get("minutesAwake")),
        "minutes_in_period": _int(summary.get("minutesInSleepPeriod")),
        "minutes_to_fall_asleep": _int(summary.get("minutesToFallAsleep")),
        "deep_minutes": stage_minutes.get("DEEP"),
        "light_minutes": stage_minutes.get("LIGHT"),
        "rem_minutes": stage_minutes.get("REM"),
        "wake_minutes": stage_minutes.get("AWAKE"),
        "stages": [
            [s.get("startTime"), s.get("endTime"), s.get("type")]
            for s in sleep.get("stages") or []
            if s.get("startTime") and s.get("endTime")
        ],
        "device": (source.get("device") or {}).get("displayName"),
        "raw": point,
        "upstream_updated_at": _ts(sleep.get("updateTime")),
        "fetched_at": fetched_at,
    }
    return Night(id=point_id, wake_date=wake_date, row=row)


def parse_rollup(point: dict[str, Any]) -> tuple[date | None, dict[str, Any]]:
    """One day of a dailyRollUp, into daily_activity columns. Only the keys the
    point actually speaks for are returned, so merging three roll-ups for the
    same day never overwrites one metric with another's absence."""
    day = _civil_date(point.get("civilStartTime"))
    out: dict[str, Any] = {}
    if "steps" in point:
        # A record with no count is a worn-but-idle day: a true zero. No record
        # at all (off-wrist) never reaches here and stays null.
        out["steps"] = _int((point["steps"] or {}).get("countSum")) or 0
    if "activeMinutes" in point:
        levels = {
            lv.get("activityLevel"): _int(lv.get("activeMinutesSum")) or 0
            for lv in (point["activeMinutes"] or {}).get("activeMinutesRollupByActivityLevel") or []
        }
        out["light_minutes"] = levels.get("LIGHT", 0)
        out["moderate_minutes"] = levels.get("MODERATE", 0)
        out["vigorous_minutes"] = levels.get("VIGOROUS", 0)
    if "totalCalories" in point:
        kcal = (point["totalCalories"] or {}).get("kcalSum")
        out["calories_kcal"] = float(kcal) if kcal is not None else None
    return day, out


def parse_resting_hr(point: dict[str, Any]) -> tuple[date | None, int | None]:
    rhr = point.get("dailyRestingHeartRate") or {}
    return _civil_date({"date": rhr.get("date")}), _int(rhr.get("beatsPerMinute"))


# --- Fetching --------------------------------------------------------------

def _chunks(start: date, end: date, days: int) -> Iterator[tuple[date, date]]:
    """[start, end) in closed-open pieces of at most `days`."""
    while start < end:
        stop = min(start + timedelta(days=days), end)
        yield start, stop
        start = stop


async def fetch_sleep(
    client: httpx.AsyncClient, token: str, start: date, end: date
) -> list[dict[str, Any]]:
    """Every session that *ended* in [start, end) local — the only field sleep
    can be filtered on. Date-only civil bounds; AND only (OR is a 400)."""
    points: list[dict[str, Any]] = []
    params: dict[str, Any] = {
        "filter": (
            f'sleep.interval.civil_end_time >= "{start.isoformat()}" AND '
            f'sleep.interval.civil_end_time < "{end.isoformat()}"'
        ),
        "pageSize": SLEEP_PAGE_SIZE,
    }
    while True:
        body = await _get(client, token, "/v4/users/me/dataTypes/sleep/dataPoints", "sleep", params)
        points.extend(body.get("dataPoints") or [])
        page = body.get("nextPageToken")
        if not page:
            return points
        params["pageToken"] = page


async def fetch_rollup(
    client: httpx.AsyncClient, token: str, data_type: str, start: date, end: date
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for lo, hi in _chunks(start, end, ROLLUP_CHUNK_DAYS):
        body: dict[str, Any] = {
            "range": {"start": _civil(lo), "end": _civil(hi)},
            "windowSizeDays": 1,
            "pageSize": ROLLUP_CHUNK_DAYS,
        }
        while True:
            reply = await _post(
                client,
                token, f"/v4/users/me/dataTypes/{data_type}/dataPoints:dailyRollUp", data_type, body
            )
            points.extend(reply.get("rollupDataPoints") or [])
            if not reply.get("nextPageToken"):
                break
            body["pageToken"] = reply["nextPageToken"]
    return points


async def fetch_resting_hr(
    client: httpx.AsyncClient, token: str, start: date, end: date
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    params: dict[str, Any] = {
        "filter": (
            f'daily_resting_heart_rate.date >= "{start.isoformat()}" AND '
            f'daily_resting_heart_rate.date < "{end.isoformat()}"'
        ),
    }
    while True:
        body = await _get(
            client,
            token,
            "/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints",
            "resting heart rate",
            params,
        )
        points.extend(body.get("dataPoints") or [])
        if not body.get("nextPageToken"):
            return points
        params["pageToken"] = body["nextPageToken"]


# --- Sync ------------------------------------------------------------------

async def _window(session: AsyncSession) -> tuple[date, date]:
    """[start, end) in local dates. Normally the last week; after a gap — a
    first run, or a reconnect after the sign-in lapsed — back to the newest
    archived day, so the days the token was dead for are filled in too.
    Never further back than the backfill."""
    today = local_today()
    newest = max(
        filter(
            None,
            [
                (await session.execute(select(func.max(SleepSession.wake_date)))).scalar(),
                (await session.execute(select(func.max(DailyActivity.date)))).scalar(),
            ],
        ),
        default=None,
    )
    floor = today - timedelta(days=BACKFILL_DAYS - 1)
    start = today - timedelta(days=LOOKBACK_DAYS - 1)
    if newest is None:
        start = floor
    elif newest < start:
        start = max(newest, floor)
    return start, today + timedelta(days=1)


async def sync_google_health(session: AsyncSession) -> int:
    """Archive sleep and daily activity for the window. Returns rows touched."""
    token = await access_token(session)
    row = await session.get(OAuthToken, PROVIDER)
    if missing := missing_scopes(row.scope):
        reason = f"Google was not given access to {', '.join(missing)}"
        await _mark_invalid(session, row, reason)
        raise Disconnected(f"{reason}. Reconnect and leave every box ticked on the consent screen.")

    start, end = await _window(session)
    fetched_at = datetime.now(UTC)

    try:
        async with _client() as client:
            sleep_points, steps, minutes, calories, resting = await asyncio.gather(
                fetch_sleep(client, token, start, end),
                fetch_rollup(client, token, "steps", start, end),
                fetch_rollup(client, token, "active-minutes", start, end),
                fetch_rollup(client, token, "total-calories", start, end),
                fetch_resting_hr(client, token, start, end),
            )
    except Disconnected:
        # A 401 on an access token we thought was live. Expire it so the next
        # run refreshes; if the refresh is refused too, that marks it invalid.
        row.access_expires_at = datetime.now(UTC)
        await session.commit()
        raise

    # Sleep. Within the window Google is the truth: a session it no longer
    # lists was deleted or merged by an edit, so it goes. Outside the window
    # nothing is touched — ageing out of Google is what the archive survives.
    # By id: a session edited mid-paging can come back on two pages, and one
    # upsert statement may not touch the same row twice.
    nights = list({n.id: n for p in sleep_points if (n := parse_sleep(p, fetched_at))}.values())
    if nights:
        stmt = insert(SleepSession).values([n.row for n in nights])
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={c: stmt.excluded[c] for c in nights[0].row if c != "id"},
        )
        await session.execute(stmt)
        await session.execute(
            delete(SleepSession)
            .where(SleepSession.wake_date >= start)
            .where(SleepSession.wake_date < end)
            .where(SleepSession.id.not_in([n.id for n in nights]))
        )
    else:
        # Same rule as an empty Canvas feed: a week with no sleep at all is far
        # likelier to be a watch that hasn't synced than a week awake.
        log.warning("google health returned no sleep for %s..%s; archive left alone", start, end)

    # Activity: three roll-ups and a list, merged per local day.
    days: dict[date, dict[str, Any]] = {}
    for point in [*steps, *minutes, *calories]:
        day, values = parse_rollup(point)
        if day is not None and start <= day < end:
            days.setdefault(day, {}).update(values)
    for point in resting:
        day, bpm = parse_resting_hr(point)
        if day is not None and start <= day < end and bpm is not None:
            days.setdefault(day, {})["resting_hr"] = bpm

    columns = ("steps", "resting_hr", "light_minutes", "moderate_minutes",
               "vigorous_minutes", "calories_kcal")
    rows = [
        {"date": d, **{c: v.get(c) for c in columns}, "fetched_at": fetched_at}
        for d, v in sorted(days.items())
    ]
    if rows:
        stmt = insert(DailyActivity).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["date"],
            set_={c: stmt.excluded[c] for c in rows[0] if c != "date"},
        )
        await session.execute(stmt)

    await session.commit()
    log.info("google health %s..%s: %d sessions, %d days", start, end, len(nights), len(rows))
    return len(nights) + len(rows)
