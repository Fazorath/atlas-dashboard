"""Registry of syncable sources.

Each source adds one line: a name, whether its credentials are present, and
an async callable that writes rows and returns how many. Nothing else in the
sync plumbing changes.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.measured import apply_measured
from app.modules import source_enabled
from app.notify.run import run_notify
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


#: Every Source there is, whether its module is on or not.
_ALL: dict[str, Source] = {}

#: The Sources whose module is on — what the sync endpoint and Status see.
SOURCES: dict[str, Source] = {}

#: Sources whose module is switched off in atlas.yaml. Cron still calls them on
#: its fixed schedule; the sync endpoint answers 204 rather than 404 for these.
DISABLED: set[str] = set()


#: Demo mode: these sources' rows come from `python -m app.demo`, so their sync
#: reaches no upstream and rewrites nothing — it only keeps Freshness current.
DEMO_SEEDED = {"school", "sleep"}


async def _demo_hold(session: AsyncSession) -> int:
    return 0


def register(
    name: str,
    run: SyncFn,
    is_configured: Callable[[], bool] = lambda: True,
    description: str = "",
    live: bool = False,
    hidden: bool = False,
) -> None:
    _ALL[name] = Source(
        name=name,
        run=run,
        is_configured=is_configured,
        description=description,
        live=live,
        hidden=hidden,
    )
    refresh()


def refresh() -> None:
    """Recompute SOURCES and DISABLED from the current config, in place, so
    everyone holding them sees a module switched on or off at once."""
    SOURCES.clear()
    DISABLED.clear()
    for name, source in _ALL.items():
        if not source_enabled(name):
            DISABLED.add(name)
        elif settings.demo and name in DEMO_SEEDED:
            SOURCES[name] = replace(source, run=_demo_hold)
        else:
            SOURCES[name] = source


async def _noop(session: AsyncSession) -> int:
    """Heartbeat source. Writes no data; its only job is to prove the whole
    cron -> HTTP -> sync -> sync_runs path is alive before any real source is set up."""
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

# Securo is a live proxy: this writes no rows, and exists so a broken login or
# an unreachable Securo shows up in the Sources strip rather than waiting to be
# discovered on the Money page.
register(
    "finance",
    check_securo,
    is_configured=lambda: settings.securo_configured,
    description="Securo reachability — live proxy, nothing stored.",
    live=True,
)

# Audiobookshelf is a live proxy too, and for a sharper reason than money: the card
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

# Canvas is an archive, like weather: the card reads `assignments`, and a dead
# feed costs freshness rather than the card. Registered as "school" — the key the
# front end's SOURCE map uses — not "canvas", or the card never leaves setup.
register(
    "school",
    sync_canvas,
    is_configured=lambda: settings.canvas_configured,
    description="Canvas calendar feed, archived to assignments. Done ticks are local.",
)

# Google Health is an archive too. Registered as "sleep", the front end's key, and
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

# Notifications (ADR 0007) ride the same rails: cron calls it every 5 minutes,
# and each run is a row in sync_runs. Plumbing, so hidden from the Sources list;
# the Notifications card on Status shows its last run instead. "Rows" is how
# many notifications went out.
register(
    "notify",
    run_notify,
    description="Sends due Alerts by Web Push to subscribed devices.",
    hidden=True,
)
