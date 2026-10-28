"""Config that applies while Atlas runs (ADR 0008): no restart after a Save in
Setup, and none after a hand edit of config/*.yaml either.

`reload()` rebuilds `settings` from the files, `.env` and the secrets entered
in the app, then updates it in place and recomputes which Modules and Sources
are on. It is cheap when nothing changed — it compares each watched file's
mtime and size — so it runs on every `/api/config` and from a background
check every few seconds.

A broken file at boot still stops Atlas (app/config raises at import). A file
broken *while running* is different: the dashboard keeps the last good config
and the mistake shows as a Problem on the Status screen until it is fixed.
"""

import asyncio
import logging
from pathlib import Path

from pydantic import ValidationError

from app import config, modules, yaml_config
from app.custom import registry as custom
from app.sync import registry

log = logging.getLogger(__name__)

#: Seconds between background checks for a hand edit.
CHECK_EVERY_S = 5

_stamps: dict[Path, tuple[int, int]] | None = None
_secrets: dict[str, tuple[str, str]] = {}
_problem: str | None = None


def _stamp() -> dict[Path, tuple[int, int]]:
    out = {}
    for path in yaml_config.watched_files():
        try:
            st = path.stat()
        except OSError:
            continue
        out[path] = (st.st_mtime_ns, st.st_size)
    return out


def reload(force: bool = False) -> bool:
    """Apply the config if a file changed (or `force`). True if it applied."""
    global _stamps, _problem
    stamps = _stamp()
    if not force and stamps == _stamps:
        return False
    _stamps = stamps
    custom.refresh()  # a broken module file is its own Problem, never this one
    try:
        new = config.build_settings(_secrets)
    except (RuntimeError, ValidationError) as exc:
        _problem = _describe(exc)
        log.warning("config not applied, keeping the last good one: %s", _problem)
        return False
    config.apply(new)
    modules.refresh()
    registry.refresh()
    _problem = None
    return True


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first.get("loc", ()))
        return f"config/: {where}: {first.get('msg', 'invalid value')}"
    return str(exc).replace(str(yaml_config.CONFIG_DIR), "config")


def set_secrets(values: dict[str, tuple[str, str]]) -> None:
    """The opened secrets from the store — Settings field -> (bound host,
    value) — and apply them."""
    global _secrets
    _secrets = dict(values)
    reload(force=True)


def problem() -> str | None:
    """What's wrong with the files on disk right now, if the last check failed."""
    return _problem


def setup_needed() -> bool:
    return not config.settings.config_found


async def watch() -> None:
    """Background task: pick up hand edits."""
    while True:
        await asyncio.sleep(CHECK_EVERY_S)
        try:
            if reload():
                log.info("config: applied a change from config/")
        except Exception:  # never let the watcher die
            log.exception("config check failed")
