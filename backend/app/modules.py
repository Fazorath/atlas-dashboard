"""The modules you can switch on in config/atlas.yaml, and what each one brings.

A module is one Area plus the Source that feeds it, if it has one. The module
id is what you write in atlas.yaml; the Source name is the sync registry key
the dashboard has always used. This table is the only place the two meet.
"""

import logging
from dataclasses import dataclass

from app.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Module:
    id: str
    #: The Area key the dashboard shows (frontend `AREAS`).
    area: str
    #: The sync registry key, or None for an Area you are the upstream of.
    source: str | None


MODULES: tuple[Module, ...] = (
    Module("open_meteo", area="weather", source="weather"),
    Module("securo", area="money", source="finance"),
    Module("audiobookshelf", area="listening", source="listening"),
    Module("canvas", area="school", source="school"),
    Module("google_health", area="health", source="sleep"),
    Module("habits", area="habits", source=None),
    Module("work", area="work", source=None),
)

MODULE_BY_ID = {m.id: m for m in MODULES}
_BY_SOURCE = {m.source: m for m in MODULES if m.source}


def _enabled_ids() -> frozenset[str]:
    if settings.modules is None:
        return frozenset(MODULE_BY_ID)
    unknown = [m for m in settings.modules if m not in MODULE_BY_ID]
    if unknown:
        log.warning("atlas.yaml: unknown modules %s (known: %s)", unknown, sorted(MODULE_BY_ID))
    return frozenset(m for m in settings.modules if m in MODULE_BY_ID)


ENABLED: frozenset[str] = _enabled_ids()


def enabled_modules() -> list[Module]:
    return [m for m in MODULES if m.id in ENABLED]


def source_enabled(source: str) -> bool:
    """False only for a Source whose module is switched off. Plumbing that
    belongs to no module (the `noop` heartbeat) is always on."""
    module = _BY_SOURCE.get(source)
    return module is None or module.id in ENABLED
