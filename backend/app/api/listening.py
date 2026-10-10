"""Listening — Phase 4. A live proxy onto Audiobookshelf; nothing is stored.

Read `sources/audiobookshelf.py` for the joining and the reshaping. This module
is only the seam between that and HTTP: it decides what an unconfigured source
looks like (a calm 200), what a dead upstream looks like (a 502), and it serves
covers on ABS's behalf.

Why no archive: a listening position is only true until the next time you press
play. A copy in Atlas could only ever be behind the phone in your pocket, and a
position that is quietly stale is worse than one that is honestly fetched.

Read-only throughout. There is no route here that writes to ABS, so no bug in
this dashboard can move where you are in a book.
"""

import logging
import re
from collections.abc import Awaitable
from typing import TypeVar

from fastapi import APIRouter, HTTPException, Response

from app.config import settings
from app.schemas.listening import Book, ListeningSummary
from app.sources import audiobookshelf as abs_source

log = logging.getLogger(__name__)

router = APIRouter(prefix="/listening", tags=["listening"])

NOT_CONFIGURED = (
    "Mint an API key in Audiobookshelf under Settings, API Keys, put it in "
    "/srv/atlas/.env as ABS_TOKEN, then restart atlas-api."
)

#: ABS ids are UUIDs. The id goes into an upstream URL path, so anything that is
#: not one is refused here rather than being sent on — a path segment is the one
#: place a caller could otherwise steer which ABS endpoint gets called.
ITEM_ID = re.compile(r"\A[A-Za-z0-9_-]{1,64}\Z")

#: Covers are immutable for as long as the book's art does not change, and the
#: card fetches one on every mount. An hour of browser cache turns a re-render
#: into no request at all, and a changed cover is one refresh behind.
COVER_CACHE = "private, max-age=3600"

T = TypeVar("T")


async def _upstream(call: Awaitable[T]) -> T:
    """Run one ABS call, turning any failure into a 502.

    Deliberately not the weather pattern of always answering 200: weather falls
    back on its archive and this cannot. A card with no book and no error would
    just look broken, so the failure is stated.
    """
    try:
        return await call
    except Exception as exc:
        log.warning("audiobookshelf: %s", exc)
        # The source module names ABS in the failures it raises itself; only a
        # transport error arrives here unlabelled, and "All connection attempts
        # failed" on its own says nothing useful.
        message = str(exc) or type(exc).__name__
        if not message.startswith("Audiobookshelf"):
            message = f"Audiobookshelf unreachable — {message}"
        raise HTTPException(status_code=502, detail=message) from exc


def _link(item_id: str) -> str | None:
    base = settings.abs_public_url.rstrip("/")
    return f"{base}/item/{item_id}" if base else None


def _as_book(book: abs_source.Book) -> Book:
    return Book(
        item_id=book.item_id,
        title=book.title,
        subtitle=book.subtitle,
        author=book.author,
        narrator=book.narrator,
        series=book.series,
        kind=book.kind,
        duration_s=book.duration_s,
        current_time_s=book.current_time_s,
        remaining_s=book.remaining_s,
        progress=book.progress,
        last_listened_at=book.last_listened_at,
        cover_url=f"/api/listening/cover/{book.item_id}",
        link=_link(book.item_id),
    )


@router.get("/", response_model=ListeningSummary)
async def listening_root() -> ListeningSummary:
    if not settings.abs_configured:
        return ListeningSummary(configured=False, detail=NOT_CONFIGURED)

    listening = await _upstream(abs_source.fetch_listening())

    return ListeningSummary(
        configured=True,
        current=_as_book(listening.current) if listening.current else None,
        in_progress=[_as_book(b) for b in listening.in_progress],
        today_s=listening.today_s,
        total_s=listening.total_s,
        fetched_at=listening.fetched_at,
    )


@router.get(
    "/cover/{item_id}",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}, "description": "Cover art, proxied from ABS."}},
)
async def listening_cover(item_id: str) -> Response:
    """The book's cover, fetched with Atlas's key and re-served same-origin.

    A 404 rather than a 502 when the source is off: this route is only ever
    reached from an `<img>` the summary put on the page, and a broken image is
    the right failure for one — there is no card state to drive from it.
    """
    if not settings.abs_configured:
        raise HTTPException(status_code=404, detail="Audiobookshelf is not configured")
    if not ITEM_ID.match(item_id):
        raise HTTPException(status_code=400, detail="Not a library item id")

    content, content_type = await _upstream(abs_source.fetch_cover(item_id))
    return Response(content=content, media_type=content_type, headers={"Cache-Control": COVER_CACHE})
