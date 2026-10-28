"""A List Widget's rows: pick the array out of a pulled response, keep the rows
that match `where`, and read each one with its dot paths."""

from fnmatch import fnmatchcase
from typing import Any

from app.custom.pull import PullProblem, dig


def as_text(value: Any) -> str:
    """A value as it is compared in `where` and `status_map`: JSON's own spelling."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _read(row: Any, path: str) -> Any:
    try:
        return dig(row, path)
    except PullProblem:
        return None


def _scalar(value: Any) -> Any:
    return None if isinstance(value, (dict, list)) else value


def build(body: Any, fields: dict[str, Any]) -> list[dict[str, Any]]:
    """The rows to show, at most `limit`. A row missing a field gets None there;
    a row missing a `where` field is left out."""
    items = dig(body, fields["items"])
    if not isinstance(items, list):
        raise PullProblem("not_found", f"`{fields['items']}` isn't a list")
    out: list[dict[str, Any]] = []
    for item in items:
        if not all(
            (found := _read(item, path)) is not None
            and not isinstance(found, (dict, list))
            and fnmatchcase(as_text(found), pattern)
            for path, pattern in fields["where"].items()
        ):
            continue
        paths = fields["row"]
        title = _scalar(_read(item, paths["title"]))
        detail = _scalar(_read(item, paths["detail"])) if "detail" in paths else None
        out.append(
            {
                "title": "" if title is None else as_text(title),
                "detail": None if detail is None else as_text(detail),
                "value": _scalar(_read(item, paths["value"])) if "value" in paths else None,
                "status": _status(_read(item, paths["status"]), fields["status_map"]) if "status" in paths else None,
            }
        )
        if len(out) == fields["limit"]:
            break
    return out


def _status(raw: Any, status_map: dict[str, list[str]]) -> str | None:
    if raw is None or isinstance(raw, (dict, list)):
        return None
    text = as_text(raw)
    return next((status for status, values in status_map.items() if text in values), None)
