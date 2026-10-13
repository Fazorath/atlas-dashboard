"""Atlas API.

No app-level auth yet: whatever sits in front of Atlas (a VPN, or a reverse
proxy with auth) is the access boundary. Ports bind to 127.0.0.1 by default.
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
