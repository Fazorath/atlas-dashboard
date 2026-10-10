"""Aggregates every router under a single /api prefix."""

from fastapi import APIRouter

from app.api import finance, habits, health, listening, school, sleep, sync, weather

api_router = APIRouter(prefix="/api")

api_router.include_router(health.router)
api_router.include_router(sync.router)
api_router.include_router(weather.router)
api_router.include_router(finance.router)
api_router.include_router(listening.router)
api_router.include_router(habits.router)
api_router.include_router(school.router)
api_router.include_router(sleep.router)

__all__ = ["api_router"]
