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
    stamps archived_at, `false` restores the habit to today's list.

    `metric` + `target` link the habit to a Health figure (a Measured habit);
    `metric: null` unlinks it and keeps every tick it already has."""

    name: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=16)
    sort_order: int | None = None
    archived: bool | None = None
    metric: str | None = Field(default=None, max_length=32)
    target: float | None = Field(default=None, gt=0)

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
    metric: str | None = None
    target: float | None = None


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
    #: Measured habits only: the linked figure, its target, and that figure on
    #: `date` (null when the Source has nothing for the day yet).
    metric: str | None = None
    target: float | None = None
    value: float | None = None
    #: True when `done` came from the data rather than from your hand.
    auto: bool = False


class MetricOut(BaseModel):
    """A Health figure a habit can be linked to."""

    key: str
    label: str
    unit: str
    default_target: float


class HistoryDay(BaseModel):
    """One heatmap cell: how many habits were ticked of how many were live."""

    date: date
    done: int
    total: int
