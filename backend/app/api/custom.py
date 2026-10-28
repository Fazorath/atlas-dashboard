"""Custom modules (config/custom/*.yaml): what is loaded, and the data a Widget shows.

Atlas makes the request to the module's source, not the browser, and nothing is
stored. See app/custom/loader for the file format and app/custom/pull for how a
pull can fail.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app import live
from app.custom import pull, registry, rows
from app.custom import secrets as store
from app.custom.loader import Module
from app.db import get_session
from app.owner import require_owner

router = APIRouter(prefix="/custom", tags=["custom"])


class AreaOut(BaseModel):
    key: str
    #: True when the module brings this Area; False when it joins an existing one.
    new: bool
    label: str | None = None
    icon: str | None = None
    accent: str | None = None


class WidgetOut(BaseModel):
    #: "custom.<module>.<widget>"
    id: str
    widget: str
    type: str
    title: str
    sizes: list[str]
    #: Type-specific display fields (Stat: format, decimals, unit).
    display: dict[str, Any]


class SecretOut(BaseModel):
    name: str
    #: Whether a usable value is stored. The value itself is never returned.
    set: bool


class SecretIn(BaseModel):
    value: str


class ModuleOut(BaseModel):
    id: str
    name: str
    secrets: list[SecretOut] = []
    area: AreaOut | None = None
    widgets: list[WidgetOut]
    problem: str | None = None


class StatOut(BaseModel):
    value: Any
    unit: str | None = None


class RowOut(BaseModel):
    title: str
    detail: str | None = None
    value: Any = None
    #: "ok", "warn" or "bad"; None when the status map doesn't list the row's value.
    status: str | None = None


class ListOut(BaseModel):
    rows: list[RowOut]


def _out(m: Module, have: dict[str, str]) -> ModuleOut:
    return ModuleOut(
        id=m.id,
        name=m.name or m.id,
        secrets=[SecretOut(name=n, set=n in have) for n in m.secrets],
        area=AreaOut(**vars(m.area)) if m.area else None,
        widgets=[
            WidgetOut(
                id=f"custom.{m.id}.{w.id}",
                widget=w.id,
                type=w.type,
                title=w.title,
                sizes=list(w.sizes),
                display=w.display,
            )
            for w in m.widgets
        ],
        problem=m.problem,
    )


@router.get("", response_model=list[ModuleOut])
async def list_modules(session: AsyncSession = Depends(get_session)) -> list[ModuleOut]:
    live.reload()
    await store.prune(session)
    return [_out(m, await store.read(session, m)) for m in registry.MODULES.values()]


def _problem(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=502, detail={"code": code, "message": message})


def _usable(module: str) -> Module:
    live.reload()
    mod = registry.MODULES.get(module)
    if mod is None:
        raise HTTPException(404, f"no Custom module {module!r}")
    if mod.problem:
        raise HTTPException(409, f"module {module!r} has a Problem: {mod.problem}")
    return mod


def _declared(mod: Module, name: str) -> None:
    if name not in mod.secrets:
        raise HTTPException(404, f"module {mod.id!r} doesn't declare a secret {name!r}")


@router.put("/{module}/secrets/{name}", response_model=SecretOut, dependencies=[Depends(require_owner)])
async def put_secret(
    module: str, name: str, body: SecretIn, session: AsyncSession = Depends(get_session)
) -> SecretOut:
    mod = _usable(module)
    _declared(mod, name)
    value = body.value.strip()
    if not value or len(value) > store.MAX_LENGTH or not value.isprintable():
        raise HTTPException(422, "The value must be one line of text, up to 4096 characters.")
    await store.put(session, mod, name, value)
    registry.forget_pull(module)
    return SecretOut(name=name, set=True)


@router.delete("/{module}/secrets/{name}", response_model=SecretOut, dependencies=[Depends(require_owner)])
async def delete_secret(
    module: str, name: str, session: AsyncSession = Depends(get_session)
) -> SecretOut:
    mod = _usable(module)
    _declared(mod, name)
    await store.remove(session, module, name)
    registry.forget_pull(module)
    return SecretOut(name=name, set=False)


@router.get("/{module}/widgets/{widget}", response_model=StatOut | ListOut)
async def widget_data(
    module: str, widget: str, session: AsyncSession = Depends(get_session)
) -> StatOut | ListOut:
    live.reload()
    mod = registry.MODULES.get(module)
    if mod is None:
        raise HTTPException(404, f"no Custom module {module!r}")
    if mod.problem:
        raise _problem("module", mod.problem)
    w = next((w for w in mod.widgets if w.id == widget), None)
    if w is None:
        raise HTTPException(404, f"module {module!r} has no widget {widget!r}")
    have = await store.read(session, mod)
    missing = [n for n in w.source.secrets if n not in have]
    if missing:
        message = registry.needs_secret_message(missing)
        registry.record_pull(module, message)
        raise HTTPException(
            409, detail={"code": "needs_secret", "message": message, "secrets": missing}
        )
    try:
        body = await pull.fetch(module, w.source, have)
        if w.type == "list":
            out: StatOut | ListOut = ListOut(rows=rows.build(body, w.fields))
        else:
            value = pull.dig(body, w.fields["value"])
            if isinstance(value, (dict, list)):
                raise pull.PullProblem("not_found", f"`{w.fields['value']}` isn't a single value")
            out = StatOut(value=value, unit=w.fields.get("unit"))
    except pull.PullProblem as exc:
        registry.record_pull(module, exc.message)
        raise _problem(exc.code, exc.message) from exc
    registry.record_pull(module, None)
    return out
