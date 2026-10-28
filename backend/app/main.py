"""Atlas API.

Anyone who can reach Atlas may look at it and rearrange Boards; changing its
setup is Owner-only (app/owner, ADR 0008). Whatever sits in front of Atlas (a
VPN, or a reverse proxy with auth) is still the access boundary. Ports bind to
127.0.0.1 by default.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import live, owner
from app.api import api_router
from app.config import settings
from app.custom import crypto
from app.db import SessionLocal
from app.setup import secrets as stored_secrets
from app.schedule_photo.reader import fail_interrupted
from app.sync.runner import fail_stale_runs

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)-5.5s [%(name)s] %(message)s",
)
# httpx logs every request's full URL at INFO. The Canvas feed URL *is* its
# credential, so at the default level the token would land in `docker logs`.
logging.getLogger("httpx").setLevel(logging.WARNING)


log = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        crypto.check_key(settings.atlas_secret_key)
    except crypto.SecretKeyMissing as exc:
        log.critical("%s", exc)
        raise
    await fail_stale_runs()
    await fail_interrupted()
    async with SessionLocal() as session:
        live.set_secrets(await stored_secrets.load(session))
        if await owner.get_owner(session) is None:
            owner.setup_code()
    watcher = asyncio.create_task(live.watch())
    yield
    watcher.cancel()


app = FastAPI(
    lifespan=lifespan,
    title="Atlas API",
    version="0.1.0",
    description="Personal life dashboard — weather, finances, listening, habits, school, sleep.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(api_router)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "atlas-api", "docs": "/api/docs", "health": "/api/health"}
