"""Settings, from the environment, config/*.yaml and the secrets entered in
the app.

Everything but secrets can be set in the YAML files, which win over the
environment where both give a value — see app/yaml_config. Secrets come from
`.env` or, failing that, from the encrypted store Setup writes (ADR 0008).

`settings` is one object for the life of the process: every module imports it
and reads it at call time, so app/live applies a change by updating it in
place — no restart.

Every module adds its credentials here with a safe default of empty string, so a
half-configured stack still boots and each source can report itself as "not
configured" rather than crashing the API.
"""

import logging
import os
from typing import Any, Literal
from urllib.parse import urlsplit

from datetime import time, timedelta

from pydantic import BaseModel, ConfigDict, Field, ValidationError, PositiveInt, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

from app.study import Rules
from app.yaml_config import explain_invalid, load_yaml_settings


log = logging.getLogger(__name__)

_DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _weekdays(key: str) -> list[int]:
    """`mon`, or a range like `mon-thu`, as weekday numbers (Monday 0)."""
    first, _, last = str(key).lower().partition("-")
    if first not in _DAYS or (last and last not in _DAYS):
        raise ValueError(f"{key!r} isn't a weekday or range like mon-thu")
    a, b = _DAYS.index(first), _DAYS.index(last or first)
    # Modulo 7, so a range can run past Sunday: sun-thu is sun, mon..thu.
    return [(a + i) % 7 for i in range((b - a) % 7 + 1)]


def _clock(value: Any) -> str:
    """A closing time as "HH:MM". YAML reads an unquoted 20:30 as the int 1230
    (minutes, base 60), so an int is taken as minutes after midnight."""
    if isinstance(value, bool):
        raise ValueError(f"{value!r} isn't a time like \"20:30\"")
    if isinstance(value, int):
        if not 0 <= value < 24 * 60:
            raise ValueError(f"{value!r} isn't a time of day")
        return f"{value // 60:02d}:{value % 60:02d}"
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value)


class WorkPhoto(BaseModel):
    """`photo:` in config/modules/work.yaml — reading a Week from a Schedule
    photo (ADR 0006). Absent means the feature is off."""

    model_config = ConfigDict(extra="forbid")

    ollama_url: str
    model: str = "gemma3:4b"
    #: Your name exactly as it's printed in the schedule's first column.
    name: str
    #: "C" on the paper, per weekday: `{mon-thu: "20:30", fri-sat: "23:00", sun: "19:00"}`.
    close: dict[str, Any]
    #: A start hour from here to 11 is morning; below it, afternoon. 1-12.
    morning_from: int = Field(default=7, ge=1, le=12)
    #: How the paper writes a date: `md` is 10/26 for 26 October, `dm` is 26/10.
    date_format: Literal["md", "dm"] = "md"

    @field_validator("close")
    @classmethod
    def _close_days(cls, value: dict[str, Any]) -> dict[str, str]:
        out: dict[str, str] = {}
        for key, raw in value.items():
            hhmm = _clock(raw)
            if time.fromisoformat(hhmm).tzinfo is not None:
                raise ValueError(
                    f"close {key!r}: {raw!r} has a timezone; write the local time without one, like \"21:00\""
                )
            for i in _weekdays(key):
                out[_DAYS[i]] = hhmm
        missing = [d for d in _DAYS if d not in out]
        if missing:
            log.warning(
                "work.yaml photo.close has no closing time for %s; a 'C' shift on those days can't be read",
                ", ".join(missing),
            )
        return out

    def close_times(self) -> dict[int, time]:
        return {_DAYS.index(d): time.fromisoformat(t) for d, t in self.close.items()}


class StudyConfig(BaseModel):
    """`study:` in config/modules/canvas.yaml — the Study planner's rules.
    Hours are whole numbers, as YAML reads an unquoted 23:00 as 1380."""

    #: The hours study may fall between, 0–24.
    earliest: int = Field(default=8, ge=0, le=23)
    latest: int = Field(default=22, ge=1, le=24)
    #: Minutes.
    max_block: int = Field(default=90, ge=15)
    min_block: int = Field(default=30, ge=15)
    gap: int = Field(default=15, ge=0)
    #: Hours before the due time to be finished by.
    buffer: int = Field(default=2, ge=0)
    days_off: list[str] = []
    #: Words in an assignment's title and the minutes it takes, checked
    #: before the built-in guesses: `{reading: 30}`.
    effort: dict[str, PositiveInt] = {}

    @field_validator("days_off")
    @classmethod
    def _days(cls, value: list[str]) -> list[str]:
        for key in value:
            _weekdays(key)
        return value

    @model_validator(mode="after")
    def _order(self) -> "StudyConfig":
        if self.latest <= self.earliest:
            raise ValueError("study: latest has to be after earliest")
        if self.min_block > self.max_block:
            raise ValueError("study: min_block can't be longer than max_block")
        return self

    def rules(self) -> Rules:
        return Rules(
            earliest=time(self.earliest),
            latest=time.max if self.latest == 24 else time(self.latest),
            max_block=timedelta(minutes=self.max_block),
            min_block=timedelta(minutes=self.min_block),
            gap=timedelta(minutes=self.gap),
            buffer=timedelta(hours=self.buffer),
            days_off=frozenset(d for key in self.days_off for d in _weekdays(key)),
            effort=tuple((str(word), minutes) for word, minutes in self.effort.items()),
        )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Built from the POSTGRES_* parts below unless DATABASE_URL is set. Building
    # it here escapes the password, so `@ / # : ? %` in it can't break the URL.
    database_url: str = ""
    postgres_user: str = "atlas"
    postgres_password: str = "atlas"
    postgres_db: str = "atlas"
    postgres_host: str = "atlas-db"
    log_level: str = "info"
    tz: str = "America/New_York"

    # config/atlas.yaml — the greeting's name ("Hello, Sam!"; blank says
    # "Hello!") and the module ids that are on. None means no atlas.yaml: all.
    owner_name: str = ""
    modules: list[str] | None = None
    #: config/atlas.yaml exists. Without it the install is fresh: Setup opens.
    config_found: bool = False
    # `demo: true` in atlas.yaml: Canvas and Google Health count as set up and
    # their syncs touch nothing, so rows from `python -m app.demo` show as if a
    # real account fed them. Never set on a real install.
    demo: bool = False

    # Open-Meteo, no API key.
    weather_lat: float | None = None
    weather_lon: float | None = None
    # Display only: Atlas stores Celsius and the front end converts.
    weather_units: Literal["fahrenheit", "celsius"] = "fahrenheit"
    #: The place those coordinates were picked as in Setup, e.g. "Lisbon, Portugal".
    weather_place: str = ""

    # Securo, reached over its compose network.
    securo_base_url: str = "http://backend:8000"
    securo_email: str = ""
    securo_password: str = ""
    # Optional. Blank means Securo picks the account's oldest workspace, which
    # is what its own frontend falls back to; set it to pin a specific one.
    securo_workspace_id: str = ""
    # Where the *browser* reaches Securo, for Money's "open Securo" nudge. Not
    # SECURO_BASE_URL, which is a docker network name. Blank renders no link.
    securo_public_url: str = ""

    # Audiobookshelf, reached over its compose network.
    abs_base_url: str = "http://audiobookshelf:80"
    abs_token: str = ""
    # Where the *browser* can reach ABS, which is not where atlas-api reaches
    # it: `audiobookshelf:80` is a docker-network name and means nothing to a
    # laptop. Only the "open in Audiobookshelf" link uses this, and a blank
    # value renders no link rather than a broken one.
    abs_public_url: str = ""

    # Canvas calendar feed (Calendar -> Calendar Feed). The URL *is*
    # the credential: its token grants read access to your calendar with no
    # other auth, so it lives in .env and is never echoed into sync_runs.
    canvas_ics_url: str = ""
    # Short names for Canvas's long course titles, as `fragment=Label` pairs
    # separated by `;`. A fragment matches anywhere in the full name, case-
    # insensitively, first match wins — so `CS101=Intro CS` survives the
    # term suffix changing. Unmatched courses keep their full Canvas name.
    canvas_course_labels: str = ""
    # The Study planner's rules (`study:` in canvas.yaml); absent is the defaults.
    canvas_study: StudyConfig = StudyConfig()

    # Work: reading a Week from a Schedule photo (ADR 0006). Off unless configured.
    work_photo: WorkPhoto | None = None

    # Fitbit, via the Google Health API (the legacy Fitbit Web API was
    # turned down September 2026). A Google Cloud OAuth client; the tokens it
    # mints live in the `oauth_tokens` table, never here.
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    # Must match a URI registered on the client exactly, port included. The
    # HTTPS address you open Atlas at lets Google redirect straight back; a `http://localhost:...`
    # one works too, and the Status screen then asks you to paste the address
    # the browser landed on.
    google_oauth_redirect_uri: str = ""
    # Overridable so the populated path can be exercised against a stub.
    google_oauth_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_oauth_revoke_url: str = "https://oauth2.googleapis.com/revoke"
    google_health_base_url: str = "https://health.googleapis.com"

    # Seals the secrets entered in the app and signs the Owner's unlock cookie
    # (ADR 0008). Required: the API refuses to start without one.
    atlas_secret_key: str = ""

    @property
    def course_labels(self) -> list[tuple[str, str]]:
        pairs = []
        for entry in self.canvas_course_labels.split(";"):
            fragment, sep, label = entry.partition("=")
            if sep and fragment.strip() and label.strip():
                pairs.append((fragment.strip().casefold(), label.strip()))
        return pairs

    @field_validator("work_photo", mode="before")
    @classmethod
    def _lenient_work_photo(cls, value: Any) -> Any:
        """A mistake in work.yaml's `photo:` turns the feature off with a
        warning instead of stopping the API at boot."""
        if value is None or isinstance(value, WorkPhoto):
            return value
        try:
            return WorkPhoto.model_validate(value)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in e['loc']) or 'photo'}: {e['msg']}"
                for e in exc.errors(include_input=False)
            )
            log.warning(
                "work.yaml: `photo:` is invalid, so reading a Schedule photo is off — %s",
                problems,
            )
            return None

    @field_validator("weather_lat", "weather_lon", mode="before")
    @classmethod
    def _blank_is_unset(cls, value: Any) -> Any:
        """compose passes `WEATHER_LAT=${WEATHER_LAT:-}` as an empty string when
        the key is absent from .env. For an optional number that means unset,
        not a parse error — a half-configured stack must still boot."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _build_database_url(self) -> "Settings":
        if not self.database_url:
            self.database_url = URL.create(
                "postgresql+asyncpg",
                username=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=5432,
                database=self.postgres_db,
            ).render_as_string(hide_password=False)
        return self

    @property
    def weather_configured(self) -> bool:
        return self.weather_lat is not None and self.weather_lon is not None

    @property
    def securo_configured(self) -> bool:
        return bool(self.securo_email and self.securo_password)

    @property
    def abs_configured(self) -> bool:
        return bool(self.abs_token)

    @property
    def canvas_configured(self) -> bool:
        return bool(self.canvas_ics_url) or self.demo

    @property
    def google_health_configured(self) -> bool:
        """The OAuth client exists. Whether an account is *connected* through it
        is a row in `oauth_tokens`, not a setting — see app/sources/google_health."""
        return self.demo or bool(
            self.google_oauth_client_id
            and self.google_oauth_client_secret
            and self.google_oauth_redirect_uri
        )


def env_has(field: str) -> bool:
    """Set to something in the environment. compose passes an unset .env line
    as `NAME=` — present, empty — which counts as not set."""
    return bool(os.environ.get(field.upper(), "").strip())


#: The secrets that can be entered in the app (app/setup): Settings field ->
#: the URL field whose host it is bound to, or None for one that goes to a
#: fixed place (Google) or is itself the URL (Canvas's feed).
APP_SECRETS: dict[str, str | None] = {
    "securo_password": "securo_base_url",
    "abs_token": "abs_base_url",
    "canvas_ics_url": None,
    "google_oauth_client_secret": None,
}


def url_host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def _settings(**values: Any) -> Settings:
    """`Settings(**values)`, with a bad YAML value reported as the file and key
    it was written in rather than the Settings field it lands on."""
    try:
        return Settings(**values)
    except ValidationError as exc:
        raise explain_invalid(exc, set(values)) from exc


def build_settings(stored: dict[str, tuple[str, str]] | None = None) -> Settings:
    """Settings from the environment, the YAML files and `stored` secrets
    (field -> (host it was entered for, value)).

    Init kwargs outrank the environment in pydantic-settings, so YAML wins over
    `.env`; a stored secret is passed only where `.env` doesn't set it, so
    `.env` wins over the store. A stored secret whose URL now points at another
    host is left out, so no edit can send it somewhere new (ADR 0008).
    Raises on broken YAML or an invalid value."""
    yaml_values = load_yaml_settings()
    if not stored:
        return _settings(**yaml_values)
    base = _settings(**yaml_values)
    kwargs = {}
    for field, (host, value) in stored.items():
        bound = APP_SECRETS.get(field)
        if env_has(field) or (bound and url_host(getattr(base, bound)) != host):
            continue
        kwargs[field] = value
    return _settings(**kwargs, **yaml_values)


def apply(new: Settings) -> None:
    """Make `settings` read as `new`, in place, for everyone holding it."""
    for name in Settings.model_fields:
        setattr(settings, name, getattr(new, name))


settings = build_settings()
