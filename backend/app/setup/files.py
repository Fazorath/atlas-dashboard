"""Writing config/*.yaml — the same files you can edit by hand (ADR 0008).

A file Setup writes starts with MARKER. One without it was written by hand,
and Setup leaves it alone unless you let it take the file over: rewriting
YAML drops its comments. Keys Setup doesn't show (`demo:`, Work's `photo:`)
are kept either way.

Writes are atomic (a temp file, then a rename), and every file and folder
written takes the owner of config/ itself — the API runs as root in its
container, and a root-owned file in your config/ would need sudo to edit.
"""

import os
import tempfile
from pathlib import Path
from typing import Any

import yaml

from app import yaml_config

MARKER = "# Written by Atlas Setup. Hand edits are fine; comments are not kept."

_DEFAULTS = Path(__file__).parent / "defaults"
#: Example Custom modules a fresh install starts with (config.example/custom/).
DEFAULT_CUSTOM = ("links.yaml", "welcome.yaml")


class HandWritten(Exception):
    """The file exists and Setup didn't write it; saving would drop its comments."""

    def __init__(self, path: Path) -> None:
        self.path = path
        super().__init__(f"{relative(path)} was written by hand")


def relative(path: Path) -> str:
    try:
        return f"config/{path.relative_to(yaml_config.CONFIG_DIR)}"
    except ValueError:
        return str(path)


def ours(path: Path) -> bool:
    """Missing, or written by Setup — safe to (re)write without asking."""
    try:
        with path.open() as f:
            return f.readline().rstrip("\n") == MARKER
    except FileNotFoundError:
        return True


def read(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text())
    except FileNotFoundError:
        return {}
    return data if isinstance(data, dict) else {}


def _owner() -> tuple[int, int] | None:
    try:
        st = yaml_config.CONFIG_DIR.stat()
    except OSError:
        return None
    return st.st_uid, st.st_gid


def _hand_over(path: Path) -> None:
    owner = _owner()
    if owner is None or os.geteuid() != 0:
        return
    try:
        os.chown(path, *owner)
    except OSError:
        pass


def _mkdir(path: Path) -> None:
    missing = []
    while not path.exists():
        missing.append(path)
        path = path.parent
    for folder in reversed(missing):
        folder.mkdir()
        _hand_over(folder)


def _write_text(path: Path, text: str) -> None:
    _mkdir(path.parent)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.chmod(tmp, 0o644)
        _hand_over(Path(tmp))
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def update(path: Path, changes: dict[str, Any], take_over: bool = False) -> None:
    """Set these keys in the file (None removes one), keeping all others."""
    if not take_over and not ours(path):
        raise HandWritten(path)
    data = read(path)
    for key, value in changes.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    body = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, default_flow_style=False)
    _write_text(path, f"{MARKER}\n{body}")


def write_defaults() -> None:
    """The example Custom modules, where a fresh install has none of its own."""
    custom = yaml_config.CONFIG_DIR / "custom"
    for name in DEFAULT_CUSTOM:
        target = custom / name
        if not target.exists():
            _mkdir(custom)
            _write_text(target, (_DEFAULTS / name).read_text())
