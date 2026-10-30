"""One pull of a Custom module's source: a GET, JSON only, cached for a minute.

The pull is made by Atlas, never the browser. Only http(s), a 10 s timeout and
a 1 MB cap; every way it can fail is a `PullProblem` with a short code and a
message that names the cause, never the headers (they may carry a token).
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from app.custom.loader import TEMPLATE, Source

# httpx logs "GET <url>" at INFO, and the URL's query may carry a secret.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

TIMEOUT_S = 10.0
MAX_BYTES = 1_000_000
CACHE_S = 60.0


class PullProblem(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class _Entry:
    at: float
    body: Any


_cache: dict[tuple[str, str], _Entry] = {}


def _now() -> float:
    return time.monotonic()


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False)


def forget(module_id: str | None = None) -> None:
    for key in [k for k in _cache if module_id is None or k[0] == module_id]:
        del _cache[key]


def fill(source: Source, secrets: dict[str, str]) -> tuple[str, dict[str, str]]:
    """The URL and headers with `{{secrets.x}}` replaced. A value in the query is
    URL-encoded so it can't add parameters of its own."""

    def put(text: str, encode: bool) -> str:
        return TEMPLATE.sub(lambda m: quote(secrets[m.group(1)], safe="") if encode else secrets[m.group(1)], text)

    return put(source.url, True), {k: put(v, False) for k, v in source.headers.items()}


async def fetch(module_id: str, source: Source, secrets: dict[str, str] | None = None) -> Any:
    """The parsed JSON at the source's URL, from the cache when it is under a minute old.

    `secrets` must hold every secret the source uses: the caller has checked.
    The cache key is the URL as written in the file, never the filled-in one."""
    key = (module_id, source.url)
    hit = _cache.get(key)
    if hit and _now() - hit.at < CACHE_S:
        return hit.body
    body = await _get(source, secrets or {})
    _cache[key] = _Entry(_now(), body)
    return body


async def _get(source: Source, secrets: dict[str, str]) -> Any:
    host = source.host
    url, headers = fill(source, secrets)
    try:
        async with _client() as client:
            async with client.stream("GET", url, headers=headers) as response:
                if response.status_code in (401, 403) and source.secrets:
                    raise PullProblem(
                        "token_rejected", f"{host} rejected the token ({response.status_code}); enter it again"
                    )
                if response.status_code >= 400:
                    raise PullProblem("status", f"{host} answered {response.status_code}")
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise PullProblem("too_large", f"{host}'s response is over 1 MB")
                    chunks.append(chunk)
    except PullProblem:
        raise
    except UnicodeEncodeError:
        # Header values are ASCII; the error text is left out because it could quote the value.
        raise PullProblem(
            "bad_header", f"a header (or a secret in one) for {host} has a character HTTP can't carry; use plain ASCII"
        ) from None
    except httpx.InvalidURL:
        # The filled-in URL can hold a secret, so neither it nor the error text is quoted.
        raise PullProblem("bad_url", f"the URL for {host} isn't one Atlas can use") from None
    except httpx.TimeoutException as exc:
        raise PullProblem("timeout", f"{host} didn't answer within {TIMEOUT_S:.0f} s") from exc
    except httpx.HTTPError as exc:
        raise PullProblem("unreachable", f"can't reach {host}: {type(exc).__name__}") from exc
    try:
        return json.loads(b"".join(chunks))
    except ValueError as exc:
        raise PullProblem("not_json", f"{host} didn't answer with JSON") from exc


_MISSING = object()


def dig(body: Any, path: str) -> Any:
    """The value at a dot path: keys, and integer segments for list indexes.
    An empty path, or `.`, is the root. Raises `PullProblem` when nothing is there."""
    cur = body
    if path.strip() not in ("", "."):
        for step in path.strip().split("."):
            if isinstance(cur, dict):
                cur = cur.get(step, _MISSING)
            elif isinstance(cur, list) and step.lstrip("-").isdigit():
                try:
                    cur = cur[int(step)]
                except IndexError:
                    cur = _MISSING
            else:
                cur = _MISSING
            if cur is _MISSING:
                raise PullProblem("not_found", f"`{path}` not found in the response")
    return cur
