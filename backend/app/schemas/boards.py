"""What a Board's saved arrangement looks like on the wire."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Size = Literal["S", "M", "L", "XL"]

# A Board holds a screenful or two. The cap only stops a runaway client from
# writing an unbounded JSON blob.
MAX_TILES = 48


class Tile(BaseModel):
    widget: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    size: Size


class BoardIn(BaseModel):
    layout: list[Tile] = Field(max_length=MAX_TILES)


class BoardOut(BaseModel):
    key: str
    # Null when the Board has never been saved: show its default arrangement.
    layout: list[Tile] | None
    updated_at: datetime | None
