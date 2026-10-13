"""What the dashboard needs to know about this install before it draws
anything: whose it is, and which modules are on. Nothing secret, ever."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.modules import enabled_modules

router = APIRouter(tags=["config"])


class AtlasConfig(BaseModel):
    name: str
    timezone: str
    #: Module ids, in atlas.yaml's vocabulary.
    modules: list[str]
    #: The Area keys those modules bring, in the dashboard's vocabulary.
    areas: list[str]
    temperature_unit: Literal["F", "C"]


@router.get("/config", response_model=AtlasConfig)
async def get_config() -> AtlasConfig:
    on = enabled_modules()
    return AtlasConfig(
        name=settings.owner_name.strip(),
        timezone=settings.tz,
        modules=[m.id for m in on],
        areas=[m.area for m in on],
        temperature_unit="C" if settings.weather_units == "celsius" else "F",
    )
