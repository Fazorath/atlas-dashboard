"""Each Module's form, declared once (ADR 0008). The frontend renders these
as they are — in Setup's Modules step and in the Settings sections on Status —
so a new Module's form is a new entry here, not new screens.

A field is either a YAML key in config/modules/<id>.yaml or a secret, which
goes to the encrypted store (app/setup/secrets) and is never sent back: the
form only learns whether it is set, set in `.env`, or not set.
"""

from dataclasses import dataclass
from typing import Any, Literal

from app.config import env_has, settings
from app.modules import MODULE_BY_ID
from app.setup.secrets import FIELDS as SECRET_FIELDS
from app.yaml_config import MODULE_KEYS

Kind = Literal["text", "url", "email", "number", "select", "secret", "pairs"]


@dataclass(frozen=True)
class Field:
    #: The YAML key, or the secret's name.
    key: str
    label: str
    kind: Kind
    help: str = ""
    placeholder: str = ""
    required: bool = False
    options: tuple[str, ...] = ()
    #: A secret bound to this url field's host: changing the host clears it.
    bound_to: str | None = None

    @property
    def secret(self) -> bool:
        return self.kind == "secret"


@dataclass(frozen=True)
class Form:
    id: str
    label: str
    blurb: str
    fields: tuple[Field, ...] = ()
    #: Has a Test (app/setup/probes).
    testable: bool = True
    #: Its settings come from Setup's Place step, not fields of its own.
    uses_place: bool = False
    #: Shown under the form: what Setup doesn't do for this Module.
    note: str = ""
    #: The Atlas Manual page for this Module.
    docs: str = ""


_MANUAL = "https://fazorath.github.io/atlas-dashboard/modules"

FORMS: tuple[Form, ...] = (
    Form(
        "open_meteo",
        "Weather",
        "Forecast and history from Open-Meteo. No account needed.",
        uses_place=True,
        docs=f"{_MANUAL}/weather/",
    ),
    Form(
        "habits",
        "Habits",
        "Daily ticks and streaks. You are its only source.",
        testable=False,
        docs=f"{_MANUAL}/habits/",
    ),
    Form(
        "work",
        "Work",
        "Your weekly shifts, typed in each week.",
        testable=False,
        note=(
            "Reading a week from a photo of the schedule is set in "
            "config/modules/work.yaml and needs WITH_VISION=true (or 1, yes, on) in .env."
        ),
        docs=f"{_MANUAL}/work/",
    ),
    Form(
        "securo",
        "Money",
        "A live view of your self-hosted Securo. Nothing financial is stored.",
        (
            Field(
                "base_url",
                "Securo address",
                "url",
                help="Where Atlas reaches Securo's backend, e.g. http://backend:8000.",
                placeholder="http://backend:8000",
                required=True,
            ),
            Field("email", "Email", "email", required=True),
            Field(
                "password",
                "Password",
                "secret",
                help="The account must not have two-factor sign-in on.",
                required=True,
                bound_to="base_url",
            ),
            Field(
                "workspace_id",
                "Workspace id",
                "text",
                help="Optional. Blank uses the account's oldest workspace.",
            ),
            Field(
                "public_url",
                "Address in your browser",
                "url",
                help="Optional, for the “open Securo” link.",
                placeholder="https://securo.example.com",
            ),
        ),
        docs=f"{_MANUAL}/money/",
    ),
    Form(
        "audiobookshelf",
        "Listening",
        "What you're listening to, read live from Audiobookshelf. Never writes to it.",
        (
            Field(
                "base_url",
                "Audiobookshelf address",
                "url",
                help="Where Atlas reaches Audiobookshelf, e.g. http://audiobookshelf:80.",
                placeholder="http://audiobookshelf:80",
                required=True,
            ),
            Field(
                "token",
                "API key",
                "secret",
                help="In Audiobookshelf: Settings → API Keys.",
                required=True,
                bound_to="base_url",
            ),
            Field(
                "public_url",
                "Address in your browser",
                "url",
                help="Optional, for the “open in Audiobookshelf” link.",
            ),
        ),
        docs=f"{_MANUAL}/listening/",
    ),
    Form(
        "canvas",
        "School",
        "Assignments and class sessions from your Canvas calendar feed.",
        (
            Field(
                "ics_url",
                "Calendar feed URL",
                "secret",
                help="In Canvas: Calendar → Calendar Feed. The URL is the key, so it stays secret.",
                required=True,
            ),
            Field(
                "course_labels",
                "Short course names",
                "pairs",
                help="Optional. One per line: part of the course name = short name.",
                placeholder="CS101 = Intro CS",
            ),
        ),
        docs=f"{_MANUAL}/school/",
    ),
    Form(
        "google_health",
        "Health",
        "Sleep and activity from Fitbit or Pixel Watch, via the Google Health API.",
        (
            Field("client_id", "OAuth client id", "text", required=True),
            Field("client_secret", "OAuth client secret", "secret", required=True),
            Field(
                "redirect_uri",
                "Redirect URI",
                "url",
                help="Register exactly this on the OAuth client in Google Cloud.",
                required=True,
            ),
        ),
        docs=f"{_MANUAL}/health/",
    ),
)

FORM_BY_ID = {f.id: f for f in FORMS}
assert set(FORM_BY_ID) == set(MODULE_BY_ID)


def setting_of(module: str, key: str) -> str:
    """The Settings field behind one form field."""
    if (module, key) in SECRET_FIELDS:
        return SECRET_FIELDS[(module, key)]
    return MODULE_KEYS[module][key]


def _pairs(raw: str) -> dict[str, str]:
    out = {}
    for entry in raw.split(";"):
        fragment, sep, label = entry.partition("=")
        if sep and fragment.strip() and label.strip():
            out[fragment.strip()] = label.strip()
    return out


def current(form: Form, f: Field) -> dict[str, Any]:
    """What the form shows for one field now. Never a secret's value."""
    name = setting_of(form.id, f.key)
    if f.secret:
        state = "env" if env_has(name) else "set" if getattr(settings, name) else "unset"
        return {"state": state}
    value = getattr(settings, name)
    if f.kind == "pairs":
        return {"value": _pairs(value or "")}
    return {"value": "" if value is None else value}


def describe(form: Form) -> dict[str, Any]:
    return {
        "id": form.id,
        "label": form.label,
        "area": MODULE_BY_ID[form.id].area,
        "blurb": form.blurb,
        "testable": form.testable,
        "uses_place": form.uses_place,
        "note": form.note,
        "docs": form.docs,
        "fields": [
            {
                "key": f.key,
                "label": f.label,
                "kind": f.kind,
                "help": f.help,
                "placeholder": f.placeholder,
                "required": f.required,
                "options": list(f.options),
                "bound_to": f.bound_to,
                **current(form, f),
            }
            for f in form.fields
        ],
    }
