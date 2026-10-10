"""What the habits screens read and write.

Dates are local calendar days (settings.tz) as plain YYYY-MM-DD, never
timestamps — a tick belongs to a day, not an instant.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _clean_name(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(value.split())
    if not value:
        raise ValueError("name can't be blank")
    return value


class HabitIn(BaseModel):
    name: str = Field(max_length=80)
    icon: str | None = Field(default=None, max_length=16)

    _name = field_validator("name")(_clean_name)


class HabitPatch(BaseModel):
    """Every field optional; only what is sent changes. `archived: true`
    stamps archived_at, `false` restores the habit to today's list."""

    name: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=16)
    sort_order: int | None = None
    archived: bool | None = None

    _name = field_validator("name")(_clean_name)


class HabitOut(BaseModel):
    """A habit's definition, without any day's state."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str | None
    sort_order: int
    created_at: datetime
    archived_at: datetime | None


class HabitDay(BaseModel):
    """One habit as it stands on `date`, with streaks as of today.

    `done` answers for the day asked about; the streak figures always answer
    for today, so stepping back through the week never changes them."""

    id: int
    name: str
    icon: str | None
    date: date
    done: bool
    #: Consecutive days ending today — or yesterday, if today isn't ticked yet.
    #: A streak isn't broken until the day it would break is over.
    current_streak: int
    longest_streak: int
    #: Share of the last 30 days ticked, counting only days since the habit
    #: began (its creation, or its earliest backfilled tick if that is older).
    completion_30d: float


class HistoryDay(BaseModel):
    """One heatmap cell: how many habits were ticked of how many were live."""

    date: date
    done: int
    total: int
