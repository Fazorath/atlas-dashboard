"""Each Module's Test (ADR 0008): its sync's own fetch code, run with the
form's values as they stand, storing nothing. A failure is a plain sentence;
one that never reached the other app says so (`unreachable`), and the screen
links "Reaching your other apps" — the fix is in docker-compose.override.yml,
not in the form.
"""

import asyncio
import logging
from typing import Any

import httpx
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings, url_host
from app.sources import Unreachable, audiobookshelf, canvas, securo, weather

log = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

#: Countries that read temperatures in Fahrenheit.
FAHRENHEIT = {"US", "BS", "BZ", "KY", "LR", "PW", "FM", "MH", "PR", "GU", "VI", "AS", "MP"}


class Outcome(BaseModel):
    ok: bool
    message: str
    #: Nothing answered at that address — a network problem, not a setting.
    unreachable: bool = False


def _unreachable(address: str) -> Outcome:
    host = url_host(address) or address
    return Outcome(
        ok=False,
        unreachable=True,
        message=f"Atlas can't reach {host}. Is it running, and on a network Atlas has joined?",
    )


async def run(module: str, values: dict[str, Any], session: AsyncSession) -> Outcome:
    try:
        return await _PROBES[module](values, session)
    except (httpx.TransportError, Unreachable):
        address = values.get("base_url") or values.get("ics_url") or "api.open-meteo.com"
        return _unreachable(address)
    except RuntimeError as exc:
        return Outcome(ok=False, message=str(exc))


def _missing(values: dict[str, Any], *keys: str) -> Outcome | None:
    empty = [k for k in keys if not str(values.get(k) or "").strip()]
    if empty:
        return Outcome(
            ok=False, message=f"Fill in {', '.join(k.replace('_', ' ') for k in empty)} first."
        )
    return None


async def _weather(values: dict[str, Any], session: AsyncSession) -> Outcome:
    if not settings.weather_configured:
        return Outcome(ok=False, message="Pick your place first.")
    where = {"latitude": settings.weather_lat, "longitude": settings.weather_lon}
    async with httpx.AsyncClient(timeout=weather.TIMEOUT) as client:
        hours = await weather.fetch_hourly(client, where)
    return Outcome(ok=True, message=f"Open-Meteo answered with {len(hours)} hours of forecast.")


async def _securo(values: dict[str, Any], session: AsyncSession) -> Outcome:
    if gap := _missing(values, "base_url", "email", "password"):
        return gap
    snapshot = await securo.probe(
        values["base_url"], values["email"], values["password"], values.get("workspace_id") or ""
    )
    n = snapshot.accounts_count or 0
    return Outcome(ok=True, message=f"Signed in to Securo — {n} account{'s' * (n != 1)}.")


async def _audiobookshelf(values: dict[str, Any], session: AsyncSession) -> Outcome:
    if gap := _missing(values, "base_url", "token"):
        return gap
    n = await audiobookshelf.probe(values["base_url"], values["token"])
    return Outcome(ok=True, message=f"Audiobookshelf took the key — {n} in progress.")


async def _canvas(values: dict[str, Any], session: AsyncSession) -> Outcome:
    if gap := _missing(values, "ics_url"):
        return gap
    feed = await canvas.fetch_feed(values["ics_url"])
    return Outcome(
        ok=True,
        message=(
            f"Feed read — {len(feed.assignments)} assignments, "
            f"{len(feed.classes)} class sessions."
        ),
    )


async def _google_health(values: dict[str, Any], session: AsyncSession) -> Outcome:
    if gap := _missing(values, "client_id", "client_secret", "redirect_uri"):
        return gap
    from app.api.sleep import connection  # the router owns what "connected" means

    conn = await connection(session)
    if conn.state == "connected":
        return Outcome(ok=True, message="Connected to Google Health.")
    if conn.state == "expired":
        return Outcome(
            ok=False, message=f"Google stopped honouring the sign-in: {conn.reason}. Connect again."
        )
    return Outcome(
        ok=False, message="Saved, but not connected yet — press Connect to sign in with Google."
    )


_PROBES = {
    "open_meteo": _weather,
    "securo": _securo,
    "audiobookshelf": _audiobookshelf,
    "canvas": _canvas,
    "google_health": _google_health,
}


async def geocode(query: str) -> list[dict[str, Any]]:
    """Open-Meteo's city search, shaped for Setup's Place step."""
    params = {"name": query, "count": 6, "language": "en", "format": "json"}
    response = None
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        # One quick retry: someone is waiting on this, and Open-Meteo's
        # occasional blip passes in a second (the weather sync's own
        # retries wait far longer).
        for attempt in (1, 2):
            try:
                response = await client.get(GEOCODE_URL, params=params)
            except httpx.TransportError:
                response = None
            if response is not None and response.status_code not in weather.TRANSIENT:
                break
            if attempt == 1:
                await asyncio.sleep(1)
    if response is None:
        raise RuntimeError("Atlas can't reach Open-Meteo's place search right now.")
    if response.status_code >= 400:
        raise RuntimeError(f"Place search answered {response.status_code}")
    out = []
    for r in (response.json() or {}).get("results") or []:
        country = r.get("country_code") or ""
        label = ", ".join(x for x in (r.get("name"), r.get("admin1"), r.get("country")) if x)
        out.append(
            {
                "label": label,
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "timezone": r.get("timezone"),
                "units": "fahrenheit" if country.upper() in FAHRENHEIT else "celsius",
            }
        )
    return out
