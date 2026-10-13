"""Registry of syncable sources.

Each later phase adds one line: a name, whether its credentials are present, and
an async callable that writes rows and returns how many. Nothing else in the
sync plumbing changes.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.measured import apply_measured
from app.modules import source_enabled
from app.sources.audiobookshelf import check_audiobookshelf
from app.sources.canvas import sync_canvas
from app.sources.google_health import sync_google_health
from app.sources.securo import check_securo
from app.sources.weather import sync_weather

SyncFn = Callable[[AsyncSession], Awaitable[int]]


@dataclass(frozen=True)
class Source:
    name: str
    run: SyncFn
    is_configured: Callable[[], bool]
    description: str = ""
    #: True for a source Atlas reads straight through rather than archiving.
    #: Its `run` is a reachability probe that writes nothing, so "synced 4h ago"
    #: would be a lie — the dashboard says "live" for these instead, and falls
    #: back to the failure of the last probe to say when it is not.
    live: bool = False
    #: Plumbing rather than a Source anyone reads — left out of the Status
    #: screen. Cron still calls it and `sync_runs` still records it.
    hidden: bool = False


SOURCES: dict[str, Source] = {}

#: Sources whose module is switched off in atlas.yaml. Cron still calls them on
#: its fixed schedule; the sync endpoint answers 204 rather than 404 for these.
DISABLED: set[str] = set()


def register(
    name: str,
    run: SyncFn,
    is_configured: Callable[[], bool] = lambda: True,
    description: str = "",
    live: bool = False,
    hidden: bool = False,
) -> None:
    if not source_enabled(name):
        DISABLED.add(name)
        return
    SOURCES[name] = Source(
        name=name,
        run=run,
        is_configured=is_configured,
        description=description,
        live=live,
        hidden=hidden,
    )


async def _noop(session: AsyncSession) -> int:
    """Heartbeat source. Writes no data; its only job is to prove the whole
    cron -> HTTP -> sync -> sync_runs path is alive, from Phase 1 onward."""
    return 0


register(
    "noop",
    _noop,
    description="Heartbeat — proves cron reaches the API and can write.",
    hidden=True,
)

# Sources import nothing from here: registration is this module's job, so a
# provider module stays a plain function of a session and is testable alone.
register(
    "weather",
    sync_weather,
    is_configured=lambda: settings.weather_configured,
    description="Open-Meteo hourly, archived to weather_observations.",
)

# Phase 3 is a live proxy: this writes no rows, and exists so a broken login or
# an unreachable Securo shows up in the Sources strip rather than waiting to be
# discovered on the Money page.
register(
    "finance",
    check_securo,
    is_configured=lambda: settings.securo_configured,
    description="Securo reachability — live proxy, nothing stored.",
    live=True,
)

# Phase 4 is a live proxy too, and for a sharper reason than money: the card
# shows a position in a book, which stops being true the moment you press play
# somewhere else. Nothing is stored, so this probe exists to surface a revoked
# API key in the Sources strip rather than as an empty card.
register(
    "listening",
    check_audiobookshelf,
    is_configured=lambda: settings.abs_configured,
    description="Audiobookshelf reachability — live proxy, read-only, nothing stored.",
    live=True,
)

# Phase 6 is an archive, like weather: the card reads `assignments`, and a dead
# feed costs freshness rather than the card. Registered as "school" — the key the
# front end's SOURCE map uses — not "canvas", or the card never leaves setup.
register(
    "school",
    sync_canvas,
    is_configured=lambda: settings.canvas_configured,
    description="Canvas calendar feed, archived to assignments. Done ticks are local.",
)

# Phase 7 is an archive too. Registered as "sleep", the front end's key, and
# configured once the OAuth client is in .env — whether an account is actually
# connected is a row in oauth_tokens, and a missing or expired one fails the
# sync, which is what raises the Reconnect prompt.
async def _sync_health(session: AsyncSession) -> int:
    """Archive Health, then tick the Measured habits that read it (ADR 0001).
    Habits has no sync of its own; this is the moment its figures change."""
    rows = await sync_google_health(session)
    await apply_measured(session)
    return rows


register(
    "sleep",
    _sync_health,
    is_configured=lambda: settings.google_health_configured,
    description="Fitbit via Google Health, archived to sleep_sessions and daily_activity.",
)
