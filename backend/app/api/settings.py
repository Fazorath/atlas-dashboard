"""Setup, and the Settings sections on Status afterwards (ADR 0008). Owner-only.

Every save writes config/*.yaml (app/setup/files) and, for secrets, the
encrypted store (app/setup/secrets), then applies at once — no restart. A
file written by hand is only rewritten when the request says `take_over`,
because rewriting drops its comments; without it the answer is a 409 the
screen turns into "rewrite this file?".
"""

from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app import live, yaml_config
from app.config import Settings, env_has, settings, url_host
from app.db import get_session
from app.modules import MODULES, MODULE_BY_ID, enabled_modules
from app.owner import require_owner
from app.setup import files, probes
from app.setup import secrets as store
from app.setup.fields import FORM_BY_ID, FORMS, Form, describe, setting_of

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_owner)])

#: What a fresh atlas.yaml switches on, as config.example/atlas.yaml does.
DEFAULT_MODULES = ["open_meteo", "habits"]


def _atlas_file():
    return yaml_config.CONFIG_DIR / "atlas.yaml"


def _module_file(module: str):
    return yaml_config.CONFIG_DIR / "modules" / f"{module}.yaml"


def _file(path) -> dict[str, Any]:
    return {"path": files.relative(path), "ours": files.ours(path)}


def state() -> dict[str, Any]:
    on = {m.id for m in enabled_modules()}
    return {
        "you": {"name": settings.owner_name, "timezone": settings.tz, "file": _file(_atlas_file())},
        "place": {
            "latitude": settings.weather_lat,
            "longitude": settings.weather_lon,
            "units": settings.weather_units,
            "label": settings.weather_place,
            "file": _file(_module_file("open_meteo")),
        },
        "enabled": [m.id for m in MODULES if m.id in on],
        "modules": [
            {**describe(form), "enabled": form.id in on, "file": _file(_module_file(form.id))}
            for form in FORMS
        ],
        "problem": live.problem(),
    }


def _write(path, changes: dict[str, Any], take_over: bool) -> None:
    try:
        files.update(path, changes, take_over=take_over)
    except files.HandWritten as exc:
        raise HTTPException(
            409,
            f"{files.relative(exc.path)} was written by hand; "
            "saving rewrites it and drops its comments.",
        ) from None


def _check(values: dict[str, Any]) -> None:
    """Refuse a value Settings wouldn't take, before anything is written."""
    try:
        Settings(**values)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise HTTPException(422, f"{'.'.join(map(str, first['loc']))}: {first['msg']}") from None


def _fresh_atlas() -> dict[str, Any]:
    """A first atlas.yaml also gets the example's modules and Custom modules."""
    if _atlas_file().exists():
        return {}
    files.write_defaults()
    return {"modules": DEFAULT_MODULES}


@router.get("")
async def get_settings() -> dict[str, Any]:
    live.reload()
    return state()


# --- You ---------------------------------------------------------------------


class YouIn(BaseModel):
    name: str = Field("", max_length=60)
    timezone: str
    take_over: bool = False


@router.put("/you")
async def save_you(body: YouIn) -> dict[str, Any]:
    try:
        ZoneInfo(body.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, f"{body.timezone!r} isn't a time zone Atlas knows") from None
    changes = {"name": body.name.strip(), "timezone": body.timezone, **_fresh_atlas()}
    _write(_atlas_file(), changes, body.take_over)
    live.reload(force=True)
    return state()


# --- Place -------------------------------------------------------------------


class PlaceIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    units: Literal["fahrenheit", "celsius"]
    label: str = Field("", max_length=120)
    take_over: bool = False


@router.put("/place")
async def save_place(body: PlaceIn) -> dict[str, Any]:
    changes = {
        "latitude": round(body.latitude, 4),
        "longitude": round(body.longitude, 4),
        "units": body.units,
        "place": body.label.strip() or None,
    }
    _write(_module_file("open_meteo"), changes, body.take_over)
    live.reload(force=True)
    return state()


@router.get("/geocode")
async def geocode(q: str = Query(min_length=2, max_length=80)) -> list[dict[str, Any]]:
    """City search through the backend, so the browser talks only to Atlas."""
    try:
        return await probes.geocode(q)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from None


# --- Modules -----------------------------------------------------------------


class EnabledIn(BaseModel):
    enabled: list[str]
    take_over: bool = False


@router.put("/modules")
async def save_enabled(body: EnabledIn) -> dict[str, Any]:
    unknown = sorted(set(body.enabled) - set(MODULE_BY_ID))
    if unknown:
        raise HTTPException(422, f"unknown modules {unknown}")
    on = [m.id for m in MODULES if m.id in body.enabled]
    _fresh_atlas()
    _write(_atlas_file(), {"modules": on}, body.take_over)
    live.reload(force=True)
    return state()


class ModuleIn(BaseModel):
    values: dict[str, Any] = {}
    #: Only the secrets being (re)entered; a missing or blank one is unchanged.
    secrets: dict[str, str] = {}
    take_over: bool = False


def _form(module_id: str) -> Form:
    form = FORM_BY_ID.get(module_id)
    if form is None:
        raise HTTPException(404, f"unknown module {module_id!r}")
    return form


def _yaml_value(kind: str, value: Any) -> Any:
    if kind == "pairs":
        if not isinstance(value, dict):
            raise HTTPException(422, "expected `part of name: short name` pairs")
        pairs = {str(k).strip(): str(v).strip() for k, v in value.items() if str(k).strip()}
        return pairs or None
    if value is None:
        return None
    return str(value).strip()


def _split(form: Form, body: ModuleIn) -> tuple[dict[str, Any], dict[str, str]]:
    """The YAML changes and the secrets (by name) a request carries, checked."""
    by_key = {f.key: f for f in form.fields}
    unknown = sorted(k for k in [*body.values, *body.secrets] if k not in by_key)
    if unknown:
        raise HTTPException(422, f"{form.id} has no field {unknown}")
    changes = {}
    for key, value in body.values.items():
        f = by_key[key]
        if f.secret:
            raise HTTPException(422, f"{key} is a secret; send it in `secrets`")
        changes[key] = _yaml_value(f.kind, value)
    entered = {}
    for name, value in body.secrets.items():
        if not by_key[name].secret:
            raise HTTPException(422, f"{name} isn't a secret")
        if value.strip():
            entered[name] = value.strip()
    return changes, entered


def _url_after(form: Form, changes: dict[str, Any], key: str) -> str:
    if key in changes:
        return changes[key] or ""
    return getattr(settings, setting_of(form.id, key)) or ""


@router.put("/modules/{module_id}")
async def save_module(
    module_id: str, body: ModuleIn, session: AsyncSession = Depends(get_session)
) -> dict[str, Any]:
    form = _form(module_id)
    changes, entered = _split(form, body)
    for name in entered:
        if env_has(setting_of(form.id, name)):
            raise HTTPException(409, f"{name} is set in .env, which wins; change it there")

    candidate = {setting_of(form.id, k): v for k, v in changes.items() if v is not None}
    if "canvas_course_labels" in candidate:
        candidate["canvas_course_labels"] = yaml_config.course_labels_text(
            candidate["canvas_course_labels"]
        )
    _check(candidate)

    cleared = []
    for f in form.fields:
        if not f.secret:
            continue
        host = url_host(_url_after(form, changes, f.bound_to)) if f.bound_to else ""
        if f.key in entered:
            await store.save(session, form.id, f.key, host, entered[f.key])
        elif f.bound_to:
            old = await store.stored_host(session, form.id, f.key)
            if old is not None and old != host:
                await store.clear(session, form.id, f.key)
                cleared.append(f.key)

    if changes or not _module_file(form.id).exists():
        _write(_module_file(form.id), changes, body.take_over)
    await store.apply(session)
    return {"cleared": cleared, "settings": state()}


@router.post("/modules/{module_id}/test")
async def test_module(
    module_id: str, body: ModuleIn, session: AsyncSession = Depends(get_session)
) -> probes.Outcome:
    """Run the Module's fetch with the form's values as they stand. Stores nothing."""
    form = _form(module_id)
    if not form.testable:
        raise HTTPException(404, f"{module_id} has nothing to test")
    changes, entered = _split(form, body)

    values: dict[str, Any] = {}
    for f in form.fields:
        current = getattr(settings, setting_of(form.id, f.key))
        if not f.secret:
            values[f.key] = changes.get(f.key, current)
            continue
        if f.key in entered:
            values[f.key] = entered[f.key]
        elif not f.bound_to or url_host(_url_after(form, changes, f.bound_to)) == url_host(
            getattr(settings, setting_of(form.id, f.bound_to)) or ""
        ):
            # The saved one, only while the address still points at its host.
            values[f.key] = current
        else:
            values[f.key] = ""
    return await probes.run(form.id, values, session)
