"""What a Board's saved arrangement looks like on the wire."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

Size = Literal["S", "M", "L", "XL"]

# A Board holds a screenful or two. The cap only stops a runaway client from
# writing an unbounded JSON blob.
MAX_TILES = 48


class Tile(BaseModel):
    widget: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    size: Size


ModuleId = Field(min_length=1, max_length=32, pattern=r"^[a-z][a-z0-9_-]*$")


class BoardIn(BaseModel):
    layout: list[Tile] = Field(max_length=MAX_TILES)
    # The modules that were on when the dashboard wrote this layout. Left out,
    # a saved Board keeps what it had.
    seen_modules: list[Annotated[str, ModuleId]] | None = Field(default=None, max_length=64)


class BoardOut(BaseModel):
    key: str
    # Null when the Board has never been saved: show its default arrangement.
    layout: list[Tile] | None
    # Null: never saved, or saved before modules were recorded.
    seen_modules: list[str] | None = None
    updated_at: datetime | None
