"""What the dashboard needs to know about this install before it draws
anything: whose it is, which modules are on, and whether Setup is still to
do. Nothing secret, ever. Each call also picks up a hand edit of config/."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app import live
from app.config import settings
from app.modules import enabled_modules
from app.schedule_photo import reader

router = APIRouter(tags=["config"])


class AtlasConfig(BaseModel):
    #: No config/atlas.yaml yet: a fresh install, and the dashboard opens Setup.
    setup: bool
    #: A hand edit of config/ that didn't apply; the last good config is in use.
    config_problem: str | None
    name: str
    timezone: str
    #: Module ids, in atlas.yaml's vocabulary.
    modules: list[str]
    #: The Area keys those modules bring, in the dashboard's vocabulary.
    areas: list[str]
    temperature_unit: Literal["F", "C"]
    #: Edit week offers "Read from photo" (ADR 0006).
    work_photo: bool


@router.get("/config", response_model=AtlasConfig)
async def get_config() -> AtlasConfig:
    live.reload()
    on = enabled_modules()
    return AtlasConfig(
        setup=live.setup_needed(),
        config_problem=live.problem(),
        name=settings.owner_name.strip(),
        timezone=settings.tz,
        modules=[m.id for m in on],
        areas=[m.area for m in on],
        temperature_unit="C" if settings.weather_units == "celsius" else "F",
        work_photo="work" in {m.id for m in on} and reader.available(),
    )
