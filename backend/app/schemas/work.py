"""What the Work screens read and write.

Days are local calendar days as YYYY-MM-DD; times are local wall-clock "HH:MM"
on that day, never timestamps — a shift belongs to a day on the schedule.
"""

from datetime import date, datetime, time

from pydantic import BaseModel, Field, field_serializer, model_validator


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
