"""The YAML half of Atlas's configuration: who you are and which modules are on.

    config/atlas.yaml               name, timezone, the list of modules
    config/modules/<module>.yaml    that module's non-secret settings

Secrets stay in .env. Each YAML key maps onto one `Settings` field, and a value
given here wins over the environment, so `.env` only ever has to hold
passwords, tokens and the database.

A missing directory or a missing atlas.yaml is not an error: every module is
then on, and each one that has no settings reports "needs setup", which is how
Atlas behaved before this file existed. Broken YAML *is* an error — failing at
boot with the file name beats a dashboard that is quietly wrong.
"""

import logging
import os
from pathlib import Path
from typing import Any

import yaml

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
    },
    "securo": {
        "base_url": "securo_base_url",
        "public_url": "securo_public_url",
        "workspace_id": "securo_workspace_id",
    },
    "audiobookshelf": {
        "base_url": "abs_base_url",
        "public_url": "abs_public_url",
    },
    "canvas": {"course_labels": "canvas_course_labels"},
    "google_health": {"redirect_uri": "google_oauth_redirect_uri"},
}


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


def _course_labels(value: Any) -> Any:
    """`{CS101: Intro CS}` in YAML is the `fragment=Label;...` string the
    Canvas source has always read."""
    if isinstance(value, dict):
        return ";".join(f"{k}={v}" for k, v in value.items())
    return value


def load_yaml_settings(config_dir: Path = CONFIG_DIR) -> dict[str, Any]:
    """Settings fields found in the YAML files, ready to pass to `Settings`."""
    atlas = config_dir / "atlas.yaml"
    if not atlas.is_file():
        log.info("no %s — every module is on; copy config.example/ to set one up", atlas)
        return {}

    values = _pick(atlas, _read(atlas), ATLAS_KEYS)
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
        values["canvas_course_labels"] = _course_labels(values["canvas_course_labels"])
    return values
