"""The YAML half of Atlas's configuration: who you are and which modules are on.

    config/atlas.yaml               name, timezone, the list of modules
    config/modules/<module>.yaml    that module's non-secret settings

Secrets are never here: they're in `.env` or entered in the app (ADR 0008).
Each YAML key maps onto one `Settings` field, and a value given here wins over
the environment.

A missing atlas.yaml is not an error: it means a fresh install, and the app
opens Setup, which writes these files (app/setup). Broken YAML *is* an error —
at boot it stops Atlas with the file name; while running, app/live keeps the
last good config and shows it as a Problem.
"""

import logging
import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

log = logging.getLogger(__name__)

CONFIG_DIR = Path(os.environ.get("ATLAS_CONFIG_DIR", "/config"))

ATLAS_KEYS = {"name": "owner_name", "timezone": "tz", "modules": "modules", "demo": "demo"}


#: Per module file: YAML key -> Settings field. A module with no entry here
#: has nothing to set and needs no file.
MODULE_KEYS: dict[str, dict[str, str]] = {
    "open_meteo": {
        "latitude": "weather_lat",
        "longitude": "weather_lon",
        "units": "weather_units",
        "place": "weather_place",
    },
    "securo": {
        "base_url": "securo_base_url",
        "email": "securo_email",
        "public_url": "securo_public_url",
        "workspace_id": "securo_workspace_id",
    },
    "audiobookshelf": {
        "base_url": "abs_base_url",
        "public_url": "abs_public_url",
    },
    "canvas": {"course_labels": "canvas_course_labels", "study": "canvas_study"},
    "google_health": {
        "client_id": "google_oauth_client_id",
        "redirect_uri": "google_oauth_redirect_uri",
    },
    "work": {"photo": "work_photo"},
}


def _origins() -> dict[str, tuple[str, str]]:
    """Settings field -> (file relative to the config dir, YAML key)."""
    out = {field: ("atlas.yaml", key) for key, field in ATLAS_KEYS.items()}
    for module, keys in MODULE_KEYS.items():
        out.update({field: (f"modules/{module}.yaml", key) for key, field in keys.items()})
    return out


def explain_invalid(
    exc: ValidationError, set_in_yaml: set[str], config_dir: Path | None = None
) -> RuntimeError:
    """Re-word a Settings validation error in terms of the file and key a bad
    value was written in. Only fields the YAML actually set are blamed on it;
    any other failure keeps its own wording."""
    root = config_dir or CONFIG_DIR
    origins = _origins()
    lines = []
    for err in exc.errors():
        field = str(err["loc"][0]) if err.get("loc") else ""
        msg = f"{err.get('msg', 'invalid value')} (got {err.get('input')!r})"
        if field in set_in_yaml and field in origins:
            file, key = origins[field]
            lines.append(f"{root / file}: `{key}`: {msg}")
        else:
            lines.append(f"{field or 'settings'}: {msg}")
    return RuntimeError("; ".join(lines))


# Every file Atlas reads, relative to the config dir — what app/live watches.
def watched_files(config_dir: Path | None = None) -> list[Path]:
    root = config_dir or CONFIG_DIR
    custom = sorted((root / "custom").glob("*.yaml"))
    return [root / "atlas.yaml", *(root / "modules" / f"{m}.yaml" for m in MODULE_KEYS), *custom]


def _read(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as exc:
        raise RuntimeError(f"{path}: not valid YAML — {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"{path}: expected `key: value` lines at the top level")
    return data


def _pick(path: Path, data: dict[str, Any], keys: dict[str, str]) -> dict[str, Any]:
    unknown = sorted(set(data) - set(keys))
    if unknown:
        log.warning("%s: ignoring unknown keys %s (known: %s)", path, unknown, sorted(keys))
    return {keys[k]: v for k, v in data.items() if k in keys and v is not None}


def course_labels_text(value: Any) -> Any:
    """`{CS101: Intro CS}` in YAML is the `fragment=Label;...` string the
    Canvas source has always read."""
    if isinstance(value, dict):
        return ";".join(f"{k}={v}" for k, v in value.items())
    return value


def load_yaml_settings(config_dir: Path | None = None) -> dict[str, Any]:
    """Settings fields found in the YAML files, ready to pass to `Settings`."""
    config_dir = config_dir or CONFIG_DIR
    atlas = config_dir / "atlas.yaml"
    if not atlas.is_file():
        return {}

    values = _pick(atlas, _read(atlas), ATLAS_KEYS)
    values["config_found"] = True
    if "owner_name" in values:
        values["owner_name"] = str(values["owner_name"])
    if "modules" in values:
        if not isinstance(values["modules"], list):
            raise RuntimeError(f"{atlas}: `modules` must be a list, e.g. [weather, habits]")
        values["modules"] = [str(m) for m in values["modules"]]

    for module, keys in MODULE_KEYS.items():
        path = config_dir / "modules" / f"{module}.yaml"
        if path.is_file():
            values.update(_pick(path, _read(path), keys))

    if "canvas_course_labels" in values:
        values["canvas_course_labels"] = course_labels_text(values["canvas_course_labels"])
    return values
