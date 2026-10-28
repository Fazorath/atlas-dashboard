"""The Owner: who may change this install (ADR 0008).

Claiming. While there is no Owner, a one-time setup code is printed to the
api log — on every boot, and again whenever one is asked for and none is
outstanding. Only someone who can read the host's logs has it, which holds
however traffic reaches Atlas (a reverse proxy makes every request look
local). Claiming takes the code and a new passphrase, and the code is gone.

Unlocking. The passphrase is kept as a stdlib scrypt hash. Proving it gets a
signed HttpOnly cookie good for 30 days on that device. The cookie carries the
Owner's `generation`; a new passphrase or a reset bumps it, so every cookie
handed out before stops working at once.

Lost passphrase, from the host:

    docker compose exec atlas-api python -m app.owner reset

clears it (stored secrets stay — they're keyed by ATLAS_SECRET_KEY) and the
install is claimed again with a fresh code from the log.
"""

import asyncio
import hashlib
import hmac
import logging
import secrets
import sys
import time

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.custom import crypto
from app.db import get_session
from app.models import Owner

log = logging.getLogger(__name__)

COOKIE = "atlas_owner"
COOKIE_DAYS = 30
MIN_PASSPHRASE = 8
_COOKIE_PURPOSE = b"atlas/owner-cookie/v1"

#: scrypt cost: 2^15 x 8 takes ~0.1 s and 32 MiB, plenty for one passphrase.
_N, _R, _P = 2**15, 8, 1
_MAXMEM = 64 * 1024 * 1024

#: No ambiguous letters (0/O, 1/I/L), so a code read off a terminal types right.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
#: Wrong codes before the current one is replaced with a new one in the log.
_CODE_TRIES = 10

_code: str | None = None
_code_misses = 0


# --- passphrase ------------------------------------------------------------


def hash_passphrase(passphrase: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(passphrase.encode(), salt=salt, n=_N, r=_R, p=_P, maxmem=_MAXMEM)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def check_passphrase(passphrase: str, stored: str) -> bool:
    try:
        kind, n, r, p, salt, digest = stored.split("$")
        if kind != "scrypt":
            return False
        attempt = hashlib.scrypt(
            passphrase.encode(),
            salt=bytes.fromhex(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            maxmem=_MAXMEM,
        )
    except ValueError:
        return False
    return hmac.compare_digest(attempt.hex(), digest)


# --- setup code --------------------------------------------------------------


def setup_code() -> str:
    """The outstanding code, issuing (and logging) one if there is none."""
    global _code, _code_misses
    if _code is None:
        raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        _code = f"{raw[:4]}-{raw[4:]}"
        _code_misses = 0
        log.warning(
            "This Atlas has no Owner yet. Open it in a browser and enter the setup code: %s", _code
        )
    return _code


def _take_code(attempt: str) -> bool:
    global _code_misses
    expected = setup_code()
    cleaned = attempt.strip().upper().replace(" ", "")
    if hmac.compare_digest(cleaned.replace("-", ""), expected.replace("-", "")):
        forget_code()
        return True
    _code_misses += 1
    if _code_misses >= _CODE_TRIES:
        log.warning("%d wrong setup codes; replacing it", _code_misses)
        forget_code()
        setup_code()
    return False


def forget_code() -> None:
    global _code, _code_misses
    _code, _code_misses = None, 0


# --- cookie ------------------------------------------------------------------


def _sign(message: str) -> str:
    key = crypto.subkey(settings.atlas_secret_key, _COOKIE_PURPOSE)
    return hmac.new(key, message.encode(), hashlib.sha256).hexdigest()


def make_cookie(generation: int, now: float | None = None) -> str:
    expires = int((now or time.time()) + COOKIE_DAYS * 86400)
    message = f"{generation}.{expires}"
    return f"{message}.{_sign(message)}"


def cookie_valid(value: str | None, generation: int, now: float | None = None) -> bool:
    if not value:
        return False
    try:
        gen, expires, signature = value.split(".")
        fresh = int(expires) > (now or time.time())
    except ValueError:
        return False
    return (
        hmac.compare_digest(signature, _sign(f"{gen}.{expires}"))
        and gen == str(generation)
        and fresh
    )


# --- the Owner row -----------------------------------------------------------


async def get_owner(session: AsyncSession) -> Owner | None:
    """The Owner, or None while the install is unclaimed (also after a reset)."""
    row = await session.get(Owner, 1)
    return row if row is not None and row.passphrase_hash else None


def _check_new(passphrase: str) -> None:
    if len(passphrase) < MIN_PASSPHRASE:
        raise HTTPException(
            422,
            f"Use at least {MIN_PASSPHRASE} characters.",
        )


async def claim(session: AsyncSession, code: str, passphrase: str) -> Owner:
    if await get_owner(session) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This Atlas already has an Owner.")
    _check_new(passphrase)
    if not _take_code(code):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "That isn't the setup code. It's in the atlas-api log: docker compose logs atlas-api",
        )
    row = await session.get(Owner, 1)
    if row is None:
        row = Owner(id=1, passphrase_hash="", generation=0)
        session.add(row)
    row.passphrase_hash = hash_passphrase(passphrase)
    row.generation += 1
    await session.commit()
    log.info("owner: install claimed")
    return row


async def unlock(session: AsyncSession, passphrase: str) -> Owner:
    row = await get_owner(session)
    if row is None or not check_passphrase(passphrase, row.passphrase_hash):
        # A guess costs a second; the hash already costs a tenth.
        await asyncio.sleep(1)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That passphrase isn't right.")
    return row


async def change(session: AsyncSession, current: str, new: str) -> Owner:
    _check_new(new)
    row = await unlock(session, current)
    row.passphrase_hash = hash_passphrase(new)
    row.generation += 1
    await session.commit()
    return row


async def reset(session: AsyncSession) -> None:
    """Forget the passphrase and every cookie. Secrets are untouched."""
    row = await session.get(Owner, 1)
    if row is not None:
        row.passphrase_hash = ""
        row.generation += 1
        await session.commit()


# --- FastAPI -----------------------------------------------------------------


async def is_unlocked(request: Request, session: AsyncSession) -> bool:
    row = await get_owner(session)
    return row is not None and cookie_valid(request.cookies.get(COOKIE), row.generation)


async def require_owner(request: Request, session: AsyncSession = Depends(get_session)) -> None:
    """Dependency for every endpoint that changes this install's setup."""
    row = await get_owner(session)
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Claim this Atlas first.")
    if not cookie_valid(request.cookies.get(COOKIE), row.generation):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unlock with the Owner passphrase.")


# --- python -m app.owner reset -------------------------------------------------


async def _reset_cli() -> None:
    from app.db import SessionLocal, engine

    async with SessionLocal() as session:
        await reset(session)
    await engine.dispose()


def main(argv: list[str]) -> int:
    if argv != ["reset"]:
        print("usage: python -m app.owner reset", file=sys.stderr)
        return 2
    asyncio.run(_reset_cli())
    print(
        "Owner passphrase cleared; every device is locked. Your secrets are kept.\n"
        "Open Atlas to claim it again — the setup code is in: docker compose logs atlas-api"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
