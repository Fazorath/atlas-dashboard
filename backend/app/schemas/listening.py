"""What the Listening card reads.

Times are seconds and `progress` is a fraction 0-1 — the same rule the rest of
Atlas follows, so no component divides by 100 and no server formats a duration
it cannot measure the width of.

`configured: false` is a 200 with empty fields, the contract weather and finance
both use: a source whose key is not filled in yet is a card that says how to
switch it on, never a red error. A *configured* source whose upstream is down is
the other case, and like finance that one is a 502 — a live proxy has no archive
behind it, so there is no last-good position to fall back on and the card has to
say it could not reach Audiobookshelf rather than quietly showing nothing.
"""

from datetime import datetime

from pydantic import BaseModel


class Book(BaseModel):
    """One book in progress."""

    item_id: str
    title: str
    subtitle: str | None = None
    author: str | None = None
    narrator: str | None = None
    series: str | None = None
    #: "audiobook" or "ebook".
    kind: str

    duration_s: float | None = None
    current_time_s: float | None = None
    remaining_s: float | None = None
    #: 0-1, already divided down.
    progress: float = 0.0

    last_listened_at: datetime | None = None

    #: Same-origin path to the cover, proxied by atlas-api because ABS wants the
    #: API key on the request and an `<img src>` cannot carry one privately.
    cover_url: str | None = None
    #: Deep link into Audiobookshelf's own player. Null when ABS_PUBLIC_URL is
    #: unset — an unreachable link is worse than no link, and Atlas has no way
    #: to guess the address the browser can reach ABS on.
    link: str | None = None


class ListeningSummary(BaseModel):
    """Everything the Today card needs, in one request."""

    configured: bool
    detail: str | None = None

    #: The book the card is about: the most recently advanced audiobook.
    current: Book | None = None
    in_progress: list[Book] = []

    #: Seconds listened today, as Audiobookshelf buckets days in its own
    #: timezone. Atlas does not recompute this — ABS owns what "today" means for
    #: a session that runs past midnight.
    today_s: float = 0.0
    total_s: float = 0.0

    #: When Atlas asked ABS. Always "just now" in practice: this is a live
    #: proxy, so the position on screen is never older than the request.
    fetched_at: datetime | None = None
