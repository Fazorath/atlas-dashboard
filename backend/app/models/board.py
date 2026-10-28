"""Boards (ADR 0002) — the saved arrangement of one screen's Widgets.

One row per (user, Board). A Board with no row shows its default arrangement,
which lives with the Widgets in the frontend, so a fresh account and a "Reset"
are the same thing: no row.

The layout is an ordered list of `{"widget": "<id>", "size": "S|M|L|XL"}`; the
grid packs it, so order and Size are the whole of a Board. Widget ids are not
checked against a catalog here — the frontend owns the catalog and drops ids
it no longer knows, so removing a Widget never breaks a saved Board.

`user_id` is designed in ahead of accounts (M2): every row today belongs to
the owner, user 1. It becomes a foreign key when the users table lands.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

OWNER_ID = 1


class Board(Base):
    __tablename__ = "boards"

    user_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=OWNER_ID, server_default=str(OWNER_ID)
    )
    # "today", or an Area key ("health", "money", …).
    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    layout: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    # Module ids that were on when this layout was last saved or brought up to
    # date. A module on now but not listed here was enabled since, and the
    # dashboard appends its default Widgets once. Null: saved before this
    # was recorded, so the modules with a Widget on the layout count as seen
    # and any other enabled module gets its defaults on the next visit.
    seen_modules: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
