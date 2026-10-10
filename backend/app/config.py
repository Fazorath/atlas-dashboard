"""Settings, read once from the environment at import time.

Every phase adds its credentials here with a safe default of empty string, so a
half-configured stack still boots and each source can report itself as "not
configured" rather than crashing the API.
"""

from functools import lru_cache
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+asyncpg://atlas:atlas@atlas-db:5432/atlas"
    log_level: str = "info"
    tz: str = "America/New_York"

    # Phase 2 — Open-Meteo, no API key.
    weather_lat: float | None = None
    weather_lon: float | None = None

    # Phase 3 — Securo, reached over securo_default.
    securo_base_url: str = "http://backend:8000"
    securo_email: str = ""
    securo_password: str = ""
    # Optional. Blank means Securo picks the account's oldest workspace, which
    # is what its own frontend falls back to; set it to pin a specific one.
    securo_workspace_id: str = ""

    # Phase 4 — Audiobookshelf, reached over nas_default.
    abs_base_url: str = "http://audiobookshelf:80"
    abs_token: str = ""
    # Where the *browser* can reach ABS, which is not where atlas-api reaches
    # it: `audiobookshelf:80` is a docker-network name and means nothing to a
    # laptop. Only the "open in Audiobookshelf" link uses this, and a blank
    # value renders no link rather than a broken one.
    abs_public_url: str = ""

    # Phase 6 — Canvas calendar feed (Calendar -> Calendar Feed). The URL *is*
    # the credential: its token grants read access to your calendar with no
    # other auth, so it lives in .env and is never echoed into sync_runs.
    canvas_ics_url: str = ""
    # Short names for Canvas's long course titles, as `fragment=Label` pairs
    # separated by `;`. A fragment matches anywhere in the full name, case-
    # insensitively, first match wins — so `CS101=Intro CS` survives the
    # term suffix changing. Unmatched courses keep their full Canvas name.
    canvas_course_labels: str = ""

    # Phase 7 — Fitbit, via the Google Health API (the legacy Fitbit Web API was
    # turned down September 2026). A Google Cloud OAuth client; the tokens it
    # mints live in the `oauth_tokens` table, never here.
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    # Must match a URI registered on the client exactly, port included. The
    # tailnet URL lets Google redirect straight back; a `http://localhost:...`
    # one works too, and the Sleep screen then asks you to paste the address
    # the browser landed on.
    google_oauth_redirect_uri: str = ""
    # Overridable so the populated path can be exercised against a stub.
    google_oauth_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_oauth_revoke_url: str = "https://oauth2.googleapis.com/revoke"
    google_health_base_url: str = "https://health.googleapis.com"

    @property
    def course_labels(self) -> list[tuple[str, str]]:
        pairs = []
        for entry in self.canvas_course_labels.split(";"):
            fragment, sep, label = entry.partition("=")
            if sep and fragment.strip() and label.strip():
                pairs.append((fragment.strip().casefold(), label.strip()))
        return pairs

    @field_validator("weather_lat", "weather_lon", mode="before")
    @classmethod
    def _blank_is_unset(cls, value: Any) -> Any:
        """compose passes `WEATHER_LAT=${WEATHER_LAT:-}` as an empty string when
        the key is absent from .env. For an optional number that means unset,
        not a parse error — a half-configured stack must still boot."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

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
        return bool(self.canvas_ics_url)

    @property
    def google_health_configured(self) -> bool:
        """The OAuth client exists. Whether an account is *connected* through it
        is a row in `oauth_tokens`, not a setting — see app/sources/google_health."""
        return bool(
            self.google_oauth_client_id
            and self.google_oauth_client_secret
            and self.google_oauth_redirect_uri
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
