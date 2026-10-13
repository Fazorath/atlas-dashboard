"""What the school screens read.

Instants are UTC; the front end formats them in local time. `all_day` means
Canvas published only a date (anything due at 11:59pm) — `due_at` is then 23:59
local, and the UI should say "end of day" rather than quote a time.
"""

from datetime import datetime

from pydantic import BaseModel


class AssignmentOut(BaseModel):
    ics_uid: str
    title: str
    #: Your short label from CANVAS_COURSE_LABELS, or Canvas's name if none matches.
    course: str | None
    #: Canvas's full course name, as stored — for a tooltip.
    course_full: str | None
    due_at: datetime
    all_day: bool
    url: str | None
    done: bool
    done_at: datetime | None
    #: Past due and not ticked. Computed on read, never stored.
    overdue: bool


class ClassOut(BaseModel):
    """A Class session: a time you join, never a to-do."""

    ics_uid: str
    title: str
    #: Short label, like an assignment's.
    course: str | None
    course_full: str | None
    start_at: datetime
    end_at: datetime | None
    location: str | None
    join_url: str | None
    #: Started and not yet over.
    in_progress: bool


class SchoolSummary(BaseModel):
    configured: bool
    detail: str | None = None
    #: Not done, due within the last OVERDUE_DAYS, oldest first.
    overdue: list[AssignmentOut] = []
    #: Due from now through the end of the window, done or not, soonest first.
    upcoming: list[AssignmentOut] = []
    #: The seven local days starting today, done or not — the Today ring.
    week_total: int = 0
    week_done: int = 0
    #: The class happening now, or the next one to start. Never counted above.
    next_class: ClassOut | None = None
    #: Class sessions from now to the end of the window, soonest first.
    classes: list[ClassOut] = []
    #: When the feed last listed anything. Freshness, not a sync-run time.
    fetched_at: datetime | None = None
