"""What the Work screens read and write.

Days are local calendar days as YYYY-MM-DD; times are local wall-clock "HH:MM"
on that day, never timestamps — a shift belongs to a day on the schedule.
"""

from datetime import date, datetime, time

from pydantic import BaseModel, Field, field_serializer, model_validator

from app.models.work import DraftStatus


class ShiftIn(BaseModel):
    date: date
    start: time
    end: time

    @model_validator(mode="after")
    def _same_day(self) -> "ShiftIn":
        if self.end <= self.start:
            raise ValueError("a shift has to end after it starts, on the same day")
        return self


class WeekIn(BaseModel):
    # Seven days, one shift each at most.
    shifts: list[ShiftIn] = Field(max_length=7)
    # The Draft week these rows were based on, if any. Saving deletes only that
    # one: a newer Draft for the same week stays for the user to look at.
    draft_id: int | None = None


class ShiftOut(BaseModel):
    date: date
    start: time
    end: time
    minutes: int

    @field_serializer("start", "end")
    def _hhmm(self, value: time) -> str:
        return value.strftime("%H:%M")


class WeekOut(BaseModel):
    week_start: date
    # False: nobody has saved this week, so an empty day means "unknown", not
    # "off".
    entered: bool
    saved_at: datetime | None
    shifts: list[ShiftOut]
    total_minutes: int


class WorkSummary(BaseModel):
    """Everything the Shift and Week widgets need in one read."""

    today: date
    this_week: WeekOut
    next_week: WeekOut
    # The first shift on a day after today, from any entered week.
    next_shift: ShiftOut | None


class DraftDay(BaseModel):
    date: date
    # "HH:MM", or null when the day was read as off or couldn't be read.
    start: str | None
    end: str | None
    off: bool
    #: What the model copied from the paper, shown beside a flagged day.
    raw: str


class PhotoRead(BaseModel):
    """A Schedule photo read: in progress, failed, or a Draft week."""

    id: int
    status: DraftStatus
    week_start: date | None
    #: No dates were read off the paper: week_start is the week that was open.
    week_guessed: bool
    days: list[DraftDay] | None
    error: str | None
    created_at: datetime
