"""Claim, unlock and lock (ADR 0008). See app/owner for how each works."""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app import owner
from app.db import get_session

router = APIRouter(prefix="/owner", tags=["owner"])


class OwnerState(BaseModel):
    #: False: Setup starts with the code from the api log.
    claimed: bool
    #: This device holds a valid unlock cookie.
    unlocked: bool


class ClaimIn(BaseModel):
    code: str
    passphrase: str


class UnlockIn(BaseModel):
    passphrase: str


class PassphraseIn(BaseModel):
    current: str
    new: str


def _set_cookie(request: Request, response: Response, generation: int) -> None:
    https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https"
    )
    response.set_cookie(
        owner.COOKIE,
        owner.make_cookie(generation),
        max_age=owner.COOKIE_DAYS * 86400,
        path="/api",
        httponly=True,
        samesite="strict",
        secure=https,
    )


@router.get("", response_model=OwnerState)
async def owner_state(request: Request, session: AsyncSession = Depends(get_session)) -> OwnerState:
    if await owner.get_owner(session) is None:
        # Asked for by Setup's first screen: make sure the log has a code to read.
        owner.setup_code()
        return OwnerState(claimed=False, unlocked=False)
    return OwnerState(claimed=True, unlocked=await owner.is_unlocked(request, session))


@router.post("/claim", response_model=OwnerState)
async def claim(
    body: ClaimIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> OwnerState:
    row = await owner.claim(session, body.code, body.passphrase)
    _set_cookie(request, response, row.generation)
    return OwnerState(claimed=True, unlocked=True)


@router.post("/unlock", response_model=OwnerState)
async def unlock(
    body: UnlockIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> OwnerState:
    row = await owner.unlock(session, body.passphrase)
    _set_cookie(request, response, row.generation)
    return OwnerState(claimed=True, unlocked=True)


@router.post("/lock", response_model=OwnerState)
async def lock(response: Response, session: AsyncSession = Depends(get_session)) -> OwnerState:
    response.delete_cookie(owner.COOKIE, path="/api")
    return OwnerState(claimed=await owner.get_owner(session) is not None, unlocked=False)


@router.post("/passphrase", response_model=OwnerState)
async def change_passphrase(
    body: PassphraseIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> OwnerState:
    """Every other device is locked out; this one gets a fresh cookie."""
    row = await owner.change(session, body.current, body.new)
    _set_cookie(request, response, row.generation)
    return OwnerState(claimed=True, unlocked=True)
