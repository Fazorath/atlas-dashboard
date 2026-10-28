"""Audiobookshelf. The only module in Atlas that knows what ABS looks like.

Audiobookshelf is a **live proxy**, like Securo and for a sharper reason: the thing on
the card is a *position in a book*, and a position is only true for as long as
nobody has listened since. An archived copy would be a number that is wrong the
moment you press play on your phone, so there is no model, no migration and no
upsert here — this module fetches, reshapes into Atlas's own dataclasses, and
hands them to the router.

**Read-only, deliberately.** Nothing here issues a PATCH, a POST or a DELETE.
No progress write means no way for a dashboard bug to corrupt where you are in
a book, which is the one piece of state in this integration that cannot be
re-derived from anything.

Reached at `http://audiobookshelf:80` over its compose network. The browser never
calls ABS directly — covers come back through `/api/listening/cover/{id}` — so
the API key stays server-side, out of the bundle.

Auth is the easy half of this module. An ABS API key (Settings -> API Keys) is a
static bearer token with no expiry and no refresh:

    Authorization: Bearer <ABS_TOKEN>

so unlike `sources/securo.py` there is no login, no token cache and no lock.

The shape that needed working out was **progress**, which ABS splits across two
endpoints and never joins for you:

  * `GET /api/me/items-in-progress` -> the library items, already filtered to
    unfinished and not-hidden and already sorted most-recent-first, with full
    metadata (title, author, narrator, series, duration) and **no progress**.
  * `GET /api/me` -> `mediaProgress[]`, which has `progress`, `currentTime`,
    `isFinished` and `lastUpdate`, keyed on `libraryItemId` and carrying **no
    metadata at all**.

One fetch of each, joined on `libraryItemId`, is the whole trick. Both are
cheap (`/api/me` is the user row ABS already has in memory), and asking for
them concurrently makes the pair cost about one round trip.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

log = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(20.0)

#: Cover width asked of ABS. It re-encodes to webp at whatever width you name,
#: and 400px covers the 96px tile at 4x without shipping the 1400px original
#: through two proxies.
COVER_WIDTH = 400

#: How many in-progress books the API will hand out at most. The card shows one
#: and the Listening screen shows them all; this only bounds a runaway shelf.
MAX_IN_PROGRESS = 50
#: Finished books the Listening screen lists, newest first.
MAX_FINISHED = 12


@dataclass(frozen=True)
class Book:
    """One book you are partway through, in Atlas's shape.

    Times are seconds and `progress` is a fraction — no percentages and no
    formatted strings leave this module, because the front end is the only
    place that knows how wide the card is.
    """

    item_id: str
    title: str
    subtitle: str | None
    author: str | None
    narrator: str | None
    series: str | None
    #: "audiobook" or "ebook". ABS keeps both in `mediaProgress`, and an epub
    #: has no audio duration — see `_kind`.
    kind: str
    duration_s: float | None
    current_time_s: float | None
    progress: float
    #: When ABS last moved this position. The honest answer to "is this what I
    #: am listening to", and what the list is sorted by.
    last_listened_at: datetime | None

    @property
    def remaining_s(self) -> float | None:
        if self.duration_s is None or self.current_time_s is None:
            return None
        return max(0.0, self.duration_s - self.current_time_s)


@dataclass(frozen=True)
class Listening:
    """What the Today card needs, in one object."""

    current: Book | None
    in_progress: list[Book]
    #: Seconds listened today, from ABS's own day bucketing in its server
    #: timezone. Atlas does not recompute it: ABS owns the definition of "today"
    #: for a session that crosses midnight.
    today_s: float
    #: Lifetime seconds, as ABS counts them.
    total_s: float
    fetched_at: datetime


def _seconds(value: Any) -> float | None:
    """ABS sends durations as floats, but a missing key must read as unknown
    rather than as zero — zero is a real position and "no idea" is not."""
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out >= 0 else None


def _fraction(value: Any) -> float:
    """A 0-1 progress, clamped. ABS reports exactly 1 for a finished book."""
    try:
        return max(0.0, min(1.0, float(value or 0)))
    except (TypeError, ValueError):
        return 0.0


def _moment(millis: Any) -> datetime | None:
    """ABS timestamps are epoch **milliseconds**, not seconds. Reading one as
    seconds silently produces 1970 and a card that says "55 years ago"."""
    if not millis:
        return None
    try:
        return datetime.fromtimestamp(float(millis) / 1000, UTC)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _text(value: Any) -> str | None:
    """ABS uses both `null` and `""` for "not set"; the card wants one of them."""
    if value is None:
        return None
    out = str(value).strip()
    return out or None


@dataclass(frozen=True)
class FinishedBook:
    item_id: str
    title: str
    author: str | None
    finished_at: datetime


@dataclass(frozen=True)
class ListeningStats:
    """ABS's own history: seconds listened per day (in ABS's timezone, as it
    buckets them) and the books you finished. Atlas keeps no copy — ABS owns
    this history, and it is read live like everything else here."""

    days: dict[str, float]
    finished: list[FinishedBook]
    fetched_at: datetime


def _author(metadata: dict[str, Any]) -> str | None:
    if name := _text(metadata.get("authorName")):
        return name
    authors = metadata.get("authors")
    if isinstance(authors, list):
        names = [_text(a.get("name")) for a in authors if isinstance(a, dict)]
        return ", ".join(n for n in names if n) or None
    return None


def _reason(response: httpx.Response) -> str:
    """The most useful sentence available about a bad response.

    A rejected API key is the failure worth translating: ABS answers a bad
    bearer with a bare 401 and an empty body, which in a `sync_runs` row would
    read as though the server were broken rather than the key wrong.
    """
    if response.status_code in (401, 403):
        return "Audiobookshelf rejected the API key — make a new one under Settings, API Keys"
    body = response.text.strip()
    return body[:200] if body else response.reason_phrase or "no response body"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.abs_base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {settings.abs_token}"},
        timeout=TIMEOUT,
    )


async def _get(client: httpx.AsyncClient, path: str, params: dict[str, Any] | None = None) -> Any:
    response = await client.get(path, params=params)
    if response.status_code >= 400:
        raise RuntimeError(f"Audiobookshelf {path} {response.status_code}: {_reason(response)}")
    return response.json()


def _kind(item: dict[str, Any], progress: dict[str, Any]) -> str:
    """Audiobook or ebook.

    An ABS library item can carry an epub, an audiobook, or both, and the
    `mediaProgress` row is the same shape either way. The distinguishing fact is
    that an item with no audio has `duration: 0` and tracks its position in
    `ebookProgress` instead of `progress` — so duration, not a media type field,
    is what separates them.
    """
    duration = _seconds((item.get("media") or {}).get("duration")) or _seconds(
        progress.get("duration")
    )
    return "audiobook" if duration else "ebook"


def _book(item: dict[str, Any], progress: dict[str, Any]) -> Book:
    media = item.get("media") or {}
    metadata = media.get("metadata") or {}
    kind = _kind(item, progress)

    # An ebook's position lives in `ebookProgress`; `progress` stays 0 for it.
    # Reading the wrong one shows every epub as untouched.
    fraction = _fraction(progress.get("progress" if kind == "audiobook" else "ebookProgress"))

    duration = _seconds(media.get("duration")) or _seconds(progress.get("duration"))
    current = _seconds(progress.get("currentTime"))

    return Book(
        item_id=str(item.get("id") or ""),
        title=_text(metadata.get("title")) or "Untitled",
        subtitle=_text(metadata.get("subtitle")),
        author=_text(metadata.get("authorName")),
        narrator=_text(metadata.get("narratorName")),
        series=_text(metadata.get("seriesName")),
        kind=kind,
        duration_s=duration,
        current_time_s=current if kind == "audiobook" else None,
        progress=fraction,
        last_listened_at=_moment(progress.get("lastUpdate") or item.get("progressLastUpdate")),
    )


def parse_listening(
    items: Any,
    me: Any,
    stats: Any,
    fetched_at: datetime,
) -> Listening:
    """Join the three payloads into one object. Pure, so it is testable without
    an Audiobookshelf."""
    library_items = (items or {}).get("libraryItems") if isinstance(items, dict) else None
    if not isinstance(library_items, list):
        library_items = []

    media_progress = (me or {}).get("mediaProgress") if isinstance(me, dict) else None
    by_item: dict[str, dict[str, Any]] = {}
    if isinstance(media_progress, list):
        for row in media_progress:
            if isinstance(row, dict) and row.get("libraryItemId"):
                by_item[str(row["libraryItemId"])] = row

    books = [
        _book(item, by_item.get(str(item.get("id") or ""), {}))
        for item in library_items
        if isinstance(item, dict) and item.get("id")
    ]

    # ABS returns these most-recent-first already, but it sorts on its own
    # notion of recency; sorting here on the timestamp Atlas actually shows
    # means the card and the list can never disagree about which book is current.
    books.sort(key=lambda b: b.last_listened_at or datetime.min.replace(tzinfo=UTC), reverse=True)
    books = books[:MAX_IN_PROGRESS]

    # "Currently listening" is the most recently moved *audiobook*: an epub you
    # opened once should not displace the book you are eight hours into on a
    # card whose whole job is a listening position.
    current = next((b for b in books if b.kind == "audiobook"), None) or (
        books[0] if books else None
    )

    totals = stats if isinstance(stats, dict) else {}

    return Listening(
        current=current,
        in_progress=books,
        today_s=_seconds(totals.get("today")) or 0.0,
        total_s=_seconds(totals.get("totalTime")) or 0.0,
        fetched_at=fetched_at,
    )


async def fetch_listening() -> Listening:
    """One round trip's worth of the three reads the card needs."""
    async with _client() as client:
        items, me, stats = await asyncio.gather(
            _get(client, "/api/me/items-in-progress"),
            _get(client, "/api/me"),
            _get(client, "/api/me/listening-stats"),
        )
    return parse_listening(items, me, stats, datetime.now(UTC))


async def fetch_stats() -> ListeningStats:
    """Daily listening and finished books. Titles come from the stats payload's
    own `items` where ABS included them, else one item read each."""
    async with _client() as client:
        stats, me = await asyncio.gather(
            _get(client, "/api/me/listening-stats"),
            _get(client, "/api/me"),
        )
        stats = stats if isinstance(stats, dict) else {}
        days = {
            str(k): float(v)
            for k, v in (stats.get("days") or {}).items()
            if isinstance(v, (int, float))
        }

        progress = me.get("mediaProgress") if isinstance(me, dict) else None
        done = sorted(
            (
                p for p in (progress or [])
                if isinstance(p, dict) and p.get("isFinished") and p.get("libraryItemId")
            ),
            key=lambda p: p.get("finishedAt") or p.get("lastUpdate") or 0,
            reverse=True,
        )[:MAX_FINISHED]

        known: dict[str, dict[str, Any]] = {}
        for item_id, item in (stats.get("items") or {}).items():
            if isinstance(item, dict) and isinstance(item.get("mediaMetadata"), dict):
                known[str(item_id)] = item["mediaMetadata"]

        missing = [str(p["libraryItemId"]) for p in done if str(p["libraryItemId"]) not in known]

        async def _metadata(item_id: str) -> tuple[str, dict[str, Any]]:
            try:
                item = await _get(client, f"/api/items/{item_id}")
            except RuntimeError:
                return item_id, {}
            return item_id, ((item or {}).get("media") or {}).get("metadata") or {}

        for item_id, metadata in await asyncio.gather(*(_metadata(i) for i in missing)):
            known[item_id] = metadata

    finished = []
    for p in done:
        item_id = str(p["libraryItemId"])
        when = _moment(p.get("finishedAt") or p.get("lastUpdate"))
        if when is None:
            continue
        metadata = known.get(item_id) or {}
        finished.append(
            FinishedBook(
                item_id=item_id,
                title=_text(metadata.get("title")) or "Untitled",
                author=_author(metadata),
                finished_at=when,
            )
        )

    return ListeningStats(days=days, finished=finished, fetched_at=datetime.now(UTC))


async def fetch_cover(item_id: str, width: int = COVER_WIDTH) -> tuple[bytes, str]:
    """A cover image and its content type, proxied.

    The browser cannot fetch this itself: ABS wants the API key on the request,
    and putting the key in an `<img src>` would publish it to anything on the
    network with a view of the page. So atlas-api fetches it and re-serves it
    same-origin, which is the same reason Securo is proxied.
    """
    async with _client() as client:
        response = await client.get(f"/api/items/{item_id}/cover", params={"width": width})
        if response.status_code >= 400:
            raise RuntimeError(
                f"Audiobookshelf cover {response.status_code}: {_reason(response)}"
            )
        content_type = response.headers.get("content-type", "image/jpeg")
        return response.content, content_type


async def probe(base_url: str, token: str) -> int:
    """Setup's Test: who the key belongs to and how many books are in progress,
    with these values rather than the saved ones."""
    async with httpx.AsyncClient(
        base_url=base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    ) as client:
        me = await _get(client, "/api/me")
    return sum(1 for p in me.get("mediaProgress") or [] if not p.get("isFinished"))


async def check_audiobookshelf(session: AsyncSession) -> int:
    """The registry's entry point — a reachability probe, not a sync.

    Nothing is written, so this returns 0 rows every time. Its job is to put a
    dated row in `sync_runs` so the Sources strip reads "live" while ABS answers
    and "unreachable" once it stops — which is how a revoked API key gets
    noticed without opening the Today page and finding an empty card.
    """
    listening = await fetch_listening()
    log.info(
        "audiobookshelf: reachable, %d in progress, current=%s",
        len(listening.in_progress),
        listening.current.title if listening.current else "none",
    )
    return 0
