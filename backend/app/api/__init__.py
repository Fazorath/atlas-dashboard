"""Aggregates every router under a single /api prefix."""

from fastapi import APIRouter

from app.api import (
    boards,
    config,
    custom,
    finance,
    habits,
    health,
    listening,
    notify,
    owner,
    school,
    settings,
    sleep,
    sync,
    weather,
    work,
)

api_router = APIRouter(prefix="/api")

api_router.include_router(health.router)
api_router.include_router(config.router)
api_router.include_router(custom.router)
api_router.include_router(sync.router)
api_router.include_router(weather.router)
api_router.include_router(finance.router)
api_router.include_router(listening.router)
api_router.include_router(habits.router)
api_router.include_router(school.router)
api_router.include_router(sleep.router)
api_router.include_router(boards.router)
api_router.include_router(work.router)
api_router.include_router(notify.router)
api_router.include_router(owner.router)
api_router.include_router(settings.router)

__all__ = ["api_router"]
