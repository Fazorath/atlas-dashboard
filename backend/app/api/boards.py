"""Boards — read and save a screen's Widget arrangement (ADR 0002).

The second router that takes writes from the dashboard, after habits. There is
no upstream and no sync: the arrangement is yours, like a habit.

GET answers `layout: null` for a Board that was never saved, and DELETE puts it
back there, so "Reset to default" never has to know what the default is.
"""

from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Board
from app.models.board import OWNER_ID
from app.schemas.boards import BoardIn, BoardOut

router = APIRouter(prefix="/boards", tags=["boards"])

BoardKey = Path(min_length=1, max_length=32, pattern=r"^[a-z][a-z0-9_-]*$")


@router.get("/{key}", response_model=BoardOut)
async def get_board(key: str = BoardKey, session: AsyncSession = Depends(get_session)) -> BoardOut:
    row = (
        await session.execute(select(Board).where(Board.user_id == OWNER_ID, Board.key == key))
    ).scalar_one_or_none()
    if row is None:
        return BoardOut(key=key, layout=None, updated_at=None)
    return BoardOut(
        key=key, layout=row.layout, seen_modules=row.seen_modules, updated_at=row.updated_at
    )


@router.put("/{key}", response_model=BoardOut)
async def save_board(
    body: BoardIn, key: str = BoardKey, session: AsyncSession = Depends(get_session)
) -> BoardOut:
    layout = [tile.model_dump() for tile in body.layout]
    stmt = insert(Board).values(
        user_id=OWNER_ID, key=key, layout=layout, seen_modules=body.seen_modules
    )
    changes: dict = {"layout": layout, "updated_at": func.now()}
    if body.seen_modules is not None:
        changes["seen_modules"] = body.seen_modules
    row = (
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["user_id", "key"], set_=changes
            ).returning(Board.updated_at, Board.seen_modules)
        )
    ).one()
    await session.commit()
    return BoardOut(
        key=key, layout=body.layout, seen_modules=row.seen_modules, updated_at=row.updated_at
    )


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_board(key: str = BoardKey, session: AsyncSession = Depends(get_session)) -> Response:
    await session.execute(delete(Board).where(Board.user_id == OWNER_ID, Board.key == key))
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
