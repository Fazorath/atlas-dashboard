"""The Custom modules currently on disk, and when each was last pulled.

`refresh()` re-reads config/custom/ and is called by app/live when a watched
file changes. Pull results are in memory only: nothing about a Custom module is
archived, so "last pull" starts empty after a restart.
"""

from datetime import UTC, datetime

from app import yaml_config
from app.custom import pull
from app.custom.loader import Module, load_all
from app.schemas.sync import SyncResult
from app.models import SyncStatus

MODULES: dict[str, Module] = {}
_last_pull: dict[str, SyncResult] = {}


def refresh() -> None:
    """Re-read every module file; the dict is updated in place."""
    new = load_all(yaml_config.CONFIG_DIR)
    for old_id, old in MODULES.items():
        if new.get(old_id) != old:  # gone or edited: its cache and last pull are stale
            pull.forget(old_id)
            _last_pull.pop(old_id, None)
    MODULES.clear()
    MODULES.update(new)


def record_pull(module_id: str, error: str | None) -> None:
    now = datetime.now(UTC)
    _last_pull[module_id] = SyncResult(
        source=f"custom:{module_id}",
        status=SyncStatus.failed if error else SyncStatus.success,
        started_at=now,
        finished_at=now,
        duration_ms=0,
        error=error,
    )


def forget_pull(module_id: str) -> None:
    """A secret changed: the last pull's verdict (and its cached body) is stale."""
    pull.forget(module_id)
    _last_pull.pop(module_id, None)


def needs_secret_message(missing: list[str] | tuple[str, ...]) -> str:
    names = ", ".join(f"`{n}`" for n in missing)
    return f"needs a token: enter {names} on the Status screen"


def last_pull(module_id: str, missing: tuple[str, ...] = ()) -> SyncResult | None:
    """A module's own Problem wins over its last pull: a broken file can't have been pulled.
    A declared secret that isn't set is a Problem too, whatever the last pull said."""
    module = MODULES.get(module_id)
    if module is None:
        return None
    error = module.problem or (needs_secret_message(missing) if missing else None)
    if error:
        now = datetime.now(UTC)
        return SyncResult(
            source=f"custom:{module_id}", status=SyncStatus.failed,
            started_at=now, finished_at=now, error=error,
        )
    return _last_pull.get(module_id)
