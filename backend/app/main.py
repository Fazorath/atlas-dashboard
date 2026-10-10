"""Atlas API.

No app-level auth by design: Tailscale is the access boundary, same as homarr
and glances on this host. Nothing here is published beyond 127.0.0.1.
"""

import logging

from fastapi import FastAPI

from app.api import api_router
from app.config import settings

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)-5.5s [%(name)s] %(message)s",
)
# httpx logs every request's full URL at INFO. The Canvas feed URL *is* its
# credential, so at the default level the token would land in `docker logs`.
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(
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
