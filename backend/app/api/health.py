"""Liveness. Deliberately dependency-free — it must answer even when Postgres is
down, because that is exactly when you are curling it."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "atlas-api"}
