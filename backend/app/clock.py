"""What "today" means, in one place.

Weather's daily high/low and a habit's calendar day both hinge on the local
day, not the UTC one: in America/New_York a UTC day ends at 8pm, which would
file an evening's reading — or an evening's tick — under tomorrow.
"""

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings

log = logging.getLogger(__name__)


def local_zone() -> ZoneInfo:
    """settings.tz, or UTC if the container has no tzdata. Degrading shifts day
    boundaries by a few hours rather than breaking an endpoint."""
    try:
        return ZoneInfo(settings.tz)
    except (ZoneInfoNotFoundError, ValueError):
        log.warning("unknown timezone %r; using UTC for the local day", settings.tz)
        return ZoneInfo("UTC")


def local_today() -> date:
    return datetime.now(local_zone()).date()
