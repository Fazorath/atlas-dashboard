"""Reads config/custom/*.yaml: one file is one Custom module (format `atlas: 1`).

A file that is broken in any way becomes a Problem on that module, naming the
file and the line or field. It never raises, so one typo cannot stop startup or
touch another module. Widgets of a type that is designed but not built yet are
skipped with a log line, and a module left with none adds no Area at all.
"""

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml

from app.modules import MODULE_BY_ID, MODULES

log = logging.getLogger(__name__)

ID = re.compile(r"\A[a-z0-9_]+\Z")
HEX = re.compile(r"\A#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\Z")
#: The accent names the dashboard has a palette for (frontend `Accent`).
ACCENTS = ("sleep", "habits", "due", "money", "weather", "work")
#: Designed, not built yet: skipped, not a Problem.
UNBUILT = ("stats", "meter", "links", "note")
BUILT = ("stat", "list")
SIZES = {"stat": ("S", "M"), "list": ("M", "L", "XL")}
LIST_DEFAULT_LIMIT = 10
LIST_MAX_LIMIT = 50
STATUSES = ("ok", "warn", "bad")
ROW_FIELDS = ("title", "detail", "value", "status")
AREA_KEYS = {m.area for m in MODULES}
#: `{{secrets.token}}`; the capture is the (possibly malformed) name.
TEMPLATE = re.compile(r"\{\{\s*secrets\.([^}\s]*)\s*\}\}")
SECRET_NAME = re.compile(r"\A[a-z0-9_]{1,32}\Z")
#: custom_secrets.module is 40 characters wide.
MAX_ID_WITH_SECRETS = 40


@dataclass(frozen=True)
class Source:
    url: str
    headers: dict[str, str]

    @property
    def host(self) -> str:
        return (urlsplit(self.url).hostname or "").lower()

    @property
    def secrets(self) -> tuple[str, ...]:
        """The secret names this source fills in, in order of first use."""
        texts = [self.url, *self.headers.values()]
        return tuple(dict.fromkeys(m for t in texts for m in TEMPLATE.findall(t)))


@dataclass(frozen=True)
class Widget:
    id: str
    type: str
    title: str
    source: Source
    sizes: tuple[str, ...]
    #: Type-specific fields (Stat: value, format, decimals, unit; List: items,
    #: where, limit, row, status_map).
    fields: dict[str, Any]

    @property
    def display(self) -> dict[str, Any]:
        """What the dashboard needs to draw the Widget: the fields that say how
        to show it, never the paths that say where the data sits."""
        if self.type == "stat":
            return {k: v for k, v in self.fields.items() if k != "value"}
        return {}


@dataclass(frozen=True)
class Area:
    #: The Area key the Widgets belong to: an existing first-party key, or the module id.
    key: str
    new: bool
    label: str | None = None
    icon: str | None = None
    accent: str | None = None


@dataclass
class Module:
    id: str
    file: str
    name: str = ""
    area: Area | None = None
    widgets: list[Widget] = field(default_factory=list)
    problem: str | None = None
    #: The secret names the file declares (`secrets: [token]`).
    secrets: tuple[str, ...] = ()
    #: The one host every source points at; a stored secret is bound to it.
    host: str | None = None

    @property
    def visible(self) -> bool:
        """A broken module shows (as a Problem); a healthy one only if it has Widgets."""
        return self.problem is not None or bool(self.widgets)


class Invalid(Exception):
    def __init__(self, where: str, message: str):
        super().__init__(message)
        self.where = where
        self.message = message


def custom_dir(config_dir: Path) -> Path:
    return config_dir / "custom"


def files(config_dir: Path) -> list[Path]:
    root = custom_dir(config_dir)
    return sorted(root.glob("*.yaml")) if root.is_dir() else []


def load_all(config_dir: Path) -> dict[str, Module]:
    """Every module file in config/custom/, by module id."""
    out: dict[str, Module] = {}
    for path in files(config_dir):
        module = load_file(path)
        if module.id in out:  # unreachable for plain `*.yaml` names; kept as the rule
            module = Module(module.id, path.name, problem=f"{path.name}: id {module.id!r} is already used")
        if module.visible:
            out[module.id] = module
    return out


def _node_line(node: yaml.Node | None, path: tuple[Any, ...]) -> int | None:
    """The 1-based line of the value at `path` in a composed YAML tree."""
    for step in path:
        if isinstance(node, yaml.MappingNode):
            found = next((v for k, v in node.value if k.value == step), None)
        elif isinstance(node, yaml.SequenceNode) and isinstance(step, int) and step < len(node.value):
            found = node.value[step]
        else:
            found = None
        if found is None:  # a missing key: point at the nearest thing that exists
            break
        node = found
    return node.start_mark.line + 1 if node is not None else None


def load_file(path: Path) -> Module:
    module_id = path.stem
    module = Module(id=module_id, file=path.name)
    try:
        text = path.read_text()
    except (OSError, UnicodeDecodeError) as exc:
        module.problem = f"{path.name}: can't be read — {exc}"
        return module
    try:
        tree = yaml.compose(text, Loader=yaml.SafeLoader)
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        where = f"{path.name}, line {mark.line + 1}" if mark else path.name
        reason = getattr(exc, "problem", None) or "not valid YAML"
        module.problem = f"{where}: not valid YAML — {reason}"
        return module
    try:
        _build(module, data)
    except Invalid as bad:
        line = _node_line(tree, _path(bad.where))
        at = f"{path.name}, line {line}" if line else path.name
        field_ = f"`{bad.where}` " if bad.where else ""
        module.problem = f"{at}: {field_}{bad.message}"
        module.widgets = []
        module.area = None
        module.secrets = ()
        module.host = None
    return module


def _path(where: str) -> tuple[Any, ...]:
    return tuple(int(p) if p.isdigit() else p for p in where.split(".")) if where else ()


def _build(module: Module, data: Any) -> None:
    if module.id in MODULE_BY_ID or module.id in AREA_KEYS or module.id == "today":
        raise Invalid("", f"the file name {module.id!r} is already a built-in Module or Area; rename the file")
    if not ID.match(module.id):
        raise Invalid("", "the file name may only use lowercase a-z, 0-9 and _")
    if not isinstance(data, dict):
        raise Invalid("", "expected `key: value` lines at the top level")
    raw_widgets = data.get("widgets")
    if isinstance(raw_widgets, list) and raw_widgets and all(
        isinstance(w, dict) and w.get("type") in UNBUILT for w in raw_widgets
    ):
        # Nothing here is built yet: no Area, no Problem, whatever else the file says.
        log.info("custom/%s: skipping every widget (types not built yet)", module.file)
        return
    if data.get("atlas") != 1:
        raise Invalid("atlas", "must be 1 (the format version)")
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise Invalid("name", "is required")
    module.name = name.strip()
    module.area = _area(module.id, data.get("area"))
    declared = _secrets(module.id, data.get("secrets"))
    _check_templates(data, declared)
    module_source = _source(data["source"], "source") if "source" in data else None

    widgets = data.get("widgets")
    if not isinstance(widgets, list) or not widgets:
        raise Invalid("widgets", "must be a list with at least one widget")
    seen: set[str] = set()
    built: list[Widget] = []
    sources: list[Source] = [module_source] if module_source else []
    for i, raw in enumerate(widgets):
        where = f"widgets.{i}"
        if not isinstance(raw, dict):
            raise Invalid(where, "must be a mapping")
        wid = raw.get("id")
        if not isinstance(wid, str) or not ID.match(wid):
            raise Invalid(f"{where}.id", "is required: lowercase a-z, 0-9 and _")
        if wid in seen:
            raise Invalid(f"{where}.id", f"{wid!r} is used twice in this file")
        seen.add(wid)
        wtype = raw.get("type")
        if wtype in UNBUILT:
            log.info("custom/%s: skipping widget %r: type %r isn't built yet", module.file, wid, wtype)
            continue
        if wtype not in BUILT:
            raise Invalid(f"{where}.type", f"unknown widget type {wtype!r} (known: {', '.join(BUILT + UNBUILT)})")
        title = raw.get("title")
        if not isinstance(title, str) or not title.strip():
            raise Invalid(f"{where}.title", "is required")
        own = _source(raw["source"], f"{where}.source") if "source" in raw else None
        source = own or module_source
        if source is None:
            raise Invalid(f"{where}.source", "this widget needs a `source` (or give the module one)")
        if own:
            sources.append(own)
        fields = _stat(raw, where) if wtype == "stat" else _list(raw, where)
        built.append(Widget(wid, wtype, title.strip(), source, SIZES[wtype], fields))

    hosts = {s.host for s in sources}
    if len(hosts) > 1:
        raise Invalid("source", f"all sources in one module must share a host, found {', '.join(sorted(hosts))}")
    module.widgets = built
    module.secrets = declared
    module.host = next(iter(hosts), None)


def _secrets(module_id: str, raw: Any) -> tuple[str, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list) or not all(isinstance(n, str) for n in raw):
        raise Invalid("secrets", "must be a list of names, like `[token]`")
    for i, name in enumerate(raw):
        if not SECRET_NAME.match(name):
            raise Invalid(f"secrets.{i}", "a secret name uses lowercase a-z, 0-9 and _, up to 32 characters")
    if len(set(raw)) != len(raw):
        raise Invalid("secrets", "names a secret twice")
    if raw and len(module_id) > MAX_ID_WITH_SECRETS:
        raise Invalid("secrets", f"a module with secrets needs a file name of {MAX_ID_WITH_SECRETS} characters or fewer")
    return tuple(raw)


def _allowed_template_place(path: tuple[str, ...]) -> str | None:
    """Where `{{secrets.x}}` may sit: 'value' (a header value) or 'query' (a source url)."""
    if path[:1] == ("widgets",) and len(path) > 2:
        path = (*path[2:],)  # widgets.<i>.source.… reads like the module's source.…
    if len(path) == 3 and path[:2] == ("source", "headers"):
        return "value"
    if path == ("source", "url"):
        return "query"
    return None


def _check_templates(node: Any, declared: tuple[str, ...], path: tuple[str, ...] = ()) -> None:
    """Every `{{secrets.x}}` in the file names a declared secret and sits in a
    header value or a URL query, nowhere else."""
    where = ".".join(path)
    if isinstance(node, dict):
        for key, value in node.items():
            if isinstance(key, str) and TEMPLATE.search(key):
                raise Invalid(where, "a secret can only be used in a header value or the URL query, not in a name")
            _check_templates(value, declared, (*path, str(key)))
        return
    if isinstance(node, list):
        for i, value in enumerate(node):
            _check_templates(value, declared, (*path, str(i)))
        return
    if not isinstance(node, str) or not TEMPLATE.search(node):
        return
    if path[:1] == ("secrets",):
        raise Invalid(where, "a secret's name can't itself use a secret")
    place = _allowed_template_place(path)
    if place is None:
        raise Invalid(where, "a secret can only be used in a header value or the URL query")
    if place == "query":
        before, _, after = node.partition("?")
        fragment = after.partition("#")[2]
        if TEMPLATE.search(before) or TEMPLATE.search(fragment):
            raise Invalid(where, "a secret can only be used in the URL query (after the `?`)")
    for name in TEMPLATE.findall(node):
        if name not in declared:
            raise Invalid(where, f"uses secret {name!r}, which the file doesn't declare under `secrets:`")


def _area(module_id: str, raw: Any) -> Area:
    if isinstance(raw, str):
        if raw not in AREA_KEYS:
            raise Invalid("area", f"{raw!r} isn't an Area (known: {', '.join(sorted(AREA_KEYS))})")
        return Area(key=raw, new=False)
    if not isinstance(raw, dict):
        raise Invalid("area", "is required: an Area key, or a mapping with label, icon and accent")
    label = raw.get("label")
    if not isinstance(label, str) or not label.strip():
        raise Invalid("area.label", "is required")
    icon = raw.get("icon")
    if icon is not None and not isinstance(icon, str):
        raise Invalid("area.icon", "must be a Lucide icon name")
    accent = raw.get("accent")
    if accent is not None and not (
        isinstance(accent, str) and (accent in ACCENTS or HEX.match(accent))
    ):
        raise Invalid("area.accent", f"must be a hex colour like \"#3aa0ff\" or one of {', '.join(ACCENTS)}")
    return Area(key=module_id, new=True, label=label.strip(), icon=icon, accent=accent)


def _source(raw: Any, where: str) -> Source:
    if not isinstance(raw, dict):
        raise Invalid(where, "must be a mapping with `url` and optional `headers`")
    url = raw.get("url")
    parts = urlsplit(url) if isinstance(url, str) else None
    if not parts or parts.scheme not in ("http", "https") or not parts.hostname:
        raise Invalid(f"{where}.url", "must be an http or https URL")
    headers = raw.get("headers") or {}
    if not isinstance(headers, dict) or not all(
        isinstance(k, str) and isinstance(v, (str, int, float)) for k, v in headers.items()
    ):
        raise Invalid(f"{where}.headers", "must be a mapping of header name to text")
    return Source(url=url, headers={k: str(v) for k, v in headers.items()})


def _stat(raw: dict[str, Any], where: str) -> dict[str, Any]:
    value = raw.get("value")
    if not isinstance(value, str):
        raise Invalid(f"{where}.value", "is required: a dot path into the JSON, like `state`")
    fmt = raw.get("format", "text")
    if fmt not in ("number", "text"):
        raise Invalid(f"{where}.format", "must be `number` or `text`")
    decimals = raw.get("decimals")
    if decimals is not None and (isinstance(decimals, bool) or not isinstance(decimals, int) or not 0 <= decimals <= 10):
        raise Invalid(f"{where}.decimals", "must be a whole number from 0 to 10")
    unit = raw.get("unit")
    if unit is not None and not isinstance(unit, str):
        raise Invalid(f"{where}.unit", "must be text")
    return {"value": value, "format": fmt, "decimals": decimals, "unit": unit}


def _text_map(raw: Any, where: str, what: str) -> dict[str, str]:
    if not isinstance(raw, dict) or not raw:
        raise Invalid(where, f"must be a mapping of {what}")
    for key, value in raw.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise Invalid(f"{where}.{key}", f"must be text, in quotes if YAML would read it as a number or true/false: {what}")
    return dict(raw)


def _status_values(raw: Any, where: str) -> list[str]:
    """`ok: up` or `ok: [up, running]`, kept as text to compare with a row's value as text."""
    values = raw if isinstance(raw, list) else [raw]
    out: list[str] = []
    for i, value in enumerate(values):
        at = f"{where}.{i}" if isinstance(raw, list) else where
        if isinstance(value, bool):
            raise Invalid(at, "YAML reads an unquoted on, off, yes or no as true or false; put the value in quotes")
        if not isinstance(value, (str, int, float)):
            raise Invalid(at, "must be text or a list of text")
        out.append(str(value))
    return out


def _list(raw: dict[str, Any], where: str) -> dict[str, Any]:
    items = raw.get("items")
    if not isinstance(items, str) or not items.strip():
        raise Invalid(f"{where}.items", "is required: a dot path to the array, like `.` or `data.items`")
    row = raw.get("row")
    if not isinstance(row, dict):
        raise Invalid(f"{where}.row", "is required: a mapping like `{title: attributes.friendly_name}`")
    for key, path in row.items():
        if key not in ROW_FIELDS:
            raise Invalid(f"{where}.row.{key}", f"isn't a row field (known: {', '.join(ROW_FIELDS)})")
        if not isinstance(path, str) or not path.strip():
            raise Invalid(f"{where}.row.{key}", "must be a dot path within one row")
    if "title" not in row:
        raise Invalid(f"{where}.row.title", "is required: a dot path to each row's title")
    limit = raw.get("limit", LIST_DEFAULT_LIMIT)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= LIST_MAX_LIMIT:
        raise Invalid(f"{where}.limit", f"must be a whole number from 1 to {LIST_MAX_LIMIT}")
    matches = _text_map(raw["where"], f"{where}.where", "dot path to pattern") if "where" in raw else {}
    status_map: dict[str, list[str]] = {}
    if "status_map" in raw:
        if "status" not in row:
            raise Invalid(f"{where}.row.status", "is required when `status_map` is set")
        given = raw["status_map"]
        if not isinstance(given, dict) or not given:
            raise Invalid(f"{where}.status_map", "must be a mapping like `{ok: up, bad: down}`")
        for key, value in given.items():
            if key not in STATUSES:
                raise Invalid(f"{where}.status_map.{key}", f"isn't a status (known: {', '.join(STATUSES)})")
            status_map[key] = _status_values(value, f"{where}.status_map.{key}")
    return {"items": items.strip(), "where": matches, "limit": limit, "row": dict(row), "status_map": status_map}
