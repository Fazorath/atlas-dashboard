"""What the sleep screens read.

Instants are UTC and minutes are whole minutes; the front end formats both. A
night is filed under the local date you woke up, as Fitbit files it.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

ConnectionState = Literal["setup", "disconnected", "connected", "expired"]


class Connection(BaseModel):
    """Whether Atlas can read Google Health right now, and what to press if not.

    `setup`        no OAuth client in .env yet
    `disconnected` a client, but nobody has signed in through it
    `connected`    a working token; `reconnect_by` is when Google will stop
                   honouring it (7 days after consent, for a Testing-status app)
    `expired`      Google refused the token — `reason` says why
    """

    state: ConnectionState
    connected_at: datetime | None = None
    reconnect_by: datetime | None = None
    reason: str | None = None
    #: The redirect URI is a localhost one: after consent the browser lands on
    #: a page that doesn't load, and its address has to be pasted back here.
    paste_back: bool = False


class Stage(BaseModel):
    start: datetime
    end: datetime
    #: DEEP, LIGHT, REM, AWAKE — or ASLEEP, RESTLESS on a classic night.
    stage: str


class Night(BaseModel):
    """The main sleep session for one wake date. Naps are not nights."""

    id: str
    date: date
    start_at: datetime
    end_at: datetime
    #: STAGES or CLASSIC. A classic night has no deep/light/REM split.
    sleep_type: str
    #: False while Google is still computing stages.
    processed: bool
    minutes_asleep: int | None
    minutes_awake: int | None
    minutes_in_period: int | None
    #: 0–1. Not a Google field: asleep ÷ time in the sleep period, the formula
    #: Fitbit documents. Google works it out before splitting stages, so the
    #: app's own figure can differ by a point.
    efficiency: float | None
    deep_minutes: int | None
    light_minutes: int | None
    rem_minutes: int | None
    wake_minutes: int | None
    device: str | None
    #: The hypnogram. Filled for `last_night` only; lists leave it empty.
    stages: list[Stage] = []


class Activity(BaseModel):
    """One local day. Null means Google had nothing, not zero."""

    date: date
    steps: int | None
    resting_hr: int | None
    #: Moderate + vigorous — what Fitbit calls "active minutes". Light
    #: movement is its own figure.
    active_minutes: int | None
    light_minutes: int | None
    calories_kcal: float | None


class SleepSummary(BaseModel):
    configured: bool
    connection: Connection
    detail: str | None = None
    last_night: Night | None = None
    #: One entry per wake date for the last `days`, oldest first. A date with
    #: no night recorded is simply absent.
    nights: list[Night] = []
    #: Averages over `nights`.
    avg_minutes_asleep: int | None = None
    avg_efficiency: float | None = None
    #: Today so far — the most recent day on record, which is today once the
    #: watch has synced since midnight.
    activity: Activity | None = None
    #: Same window as `nights`, oldest first.
    activity_days: list[Activity] = []
    #: When the sync last wrote anything. Freshness, not a sync-run time.
    fetched_at: datetime | None = None


class PastedRedirect(BaseModel):
    """The whole address the browser landed on after Google's consent screen."""

    url: str
