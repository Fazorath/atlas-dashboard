"""Turn the model's copy of your row into Shifts (ADR 0006).

The model only transcribes, and loosely: "2 TO C" comes back as `270 C`,
"8 TO 3" as `870 3`. Nothing it says is trusted as a time. Each cell is
matched against the few shapes a handwritten schedule uses, the paper's
missing am/pm is resolved by business hours, "C" becomes that weekday's
Close, and anything that doesn't fit is flagged for you rather than guessed.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, time, timedelta

DAY_NAMES = {
    0: ("lunes", "monday", "mon", "lun"),
    1: ("martes", "tuesday", "tue", "tues", "mar"),
    2: ("miercoles", "wednesday", "wed", "weds", "mie"),
    3: ("jueves", "thursday", "thu", "thur", "thurs", "jue"),
    4: ("viernes", "friday", "fri", "vie"),
    5: ("sabado", "saturday", "sat", "sab"),
    6: ("domingo", "sunday", "sun", "dom"),
}

# What "TO" turns into in a transcription: T or 7, then O or 0; or a dash.
_SEP = r"(?:T[O0]|7[O0]|T|-|–|A)"
_TIME = r"(\d{1,2})(?::?([0-5]\d))?"
_END = r"(C|CL|CLOSE|\(|" + _TIME + r")"
_CELL = re.compile(rf"^{_TIME}{_SEP}{_END}$")
_OFF = re.compile(r"^[O0Q]?F{1,2}E?$|^[O0]FF.*|^OF+$|^DAYOFF$|^LIBRE$")
# The decoration a model puts before a line: bullet / quote / heading / "1."
# numbering / backticks / bold.
_LEAD = re.compile(r"^[\s\-*•>#`_]*(?:\d+[.)]\s*)?[\s`*_]*")
# A row: a weekday word, an optional ".", an optional separator (`:` or a
# spaced `- – =`), then the cell. No colon needed ("Lunes 9:10 TO 5").
_ROW = re.compile(r"^([^\W\d_]+)[\s`*_]*\.?[\s`*_]*(?::|[-–=](?=\s))?(.*)$")
_DATE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})")


@dataclass(frozen=True)
class Day:
    """One weekday read from the strip: a Shift, a day off, or flagged."""

    weekday: int  # 0 = Monday
    raw: str
    start: time | None = None
    end: time | None = None
    off: bool = False

    @property
    def flagged(self) -> bool:
        return not self.off and self.start is None


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()


def _clean_line(line: str) -> str:
    """A reply line without its markdown decoration, shared by every reader of
    the reply so `**Dates:** 10/26 - 11/1` and `- Lunes: OFF` both match."""
    return _LEAD.sub("", line, count=1)


def _hm(hour: str, minute: str | None) -> tuple[int, int]:
    return int(hour), int(minute or 0)


def _clock(h: int, m: int, *, after: tuple[int, int] | None, morning_from: int) -> tuple[int, int] | None:
    """A paper hour (1-12, no am/pm) on the 24h clock."""
    if not 1 <= h <= 12 or m > 59:
        return None
    if after is None:  # a start: business hours decide
        return (h if morning_from <= h <= 12 else h + 12, m) if h != 12 else (12, m)
    for cand in ((h, m), (h + 12 if h != 12 else 12, m)):
        if cand > after and cand[0] < 24:
            return cand
    return None


def parse_cell(raw: str, weekday: int, close: dict[int, time], morning_from: int = 7) -> Day:
    text = re.sub(r"[\s.,'`\"*]", "", raw.upper())
    if not text or _OFF.match(text):
        return Day(weekday, raw, off=bool(text))
    m = _CELL.match(text)
    if not m:
        return Day(weekday, raw)
    start = _clock(*_hm(m.group(1), m.group(2)), after=None, morning_from=morning_from)
    if start is None:
        return Day(weekday, raw)
    if m.group(4) is not None:  # an hour, not "C"
        end = _clock(*_hm(m.group(4), m.group(5)), after=start, morning_from=morning_from)
        if end is None:
            return Day(weekday, raw)
        end_t = time(*end)
    else:
        end_t = close.get(weekday)
        if end_t is None:
            return Day(weekday, raw)
    start_t = time(*start)
    if end_t <= start_t:
        return Day(weekday, raw)
    return Day(weekday, raw, start=start_t, end=end_t)


def _weekday_of(label: str) -> int | None:
    word = _fold(label)
    for day, names in DAY_NAMES.items():
        if word in names:
            return day
    return None


def parse_row(text: str, close: dict[int, time], morning_from: int = 7) -> list[Day]:
    """Seven Days from the model's `Lunes: <cell>` lines. A weekday the reply
    never mentions comes back flagged with empty text."""
    found: dict[int, str] = {}
    for line in text.splitlines():
        m = _ROW.match(_clean_line(line))
        if not m:
            continue
        day = _weekday_of(m.group(1))
        if day is not None and day not in found:
            found[day] = m.group(2).strip().strip("`*").strip()
    return [
        parse_cell(found[d], d, close, morning_from) if d in found else Day(d, "")
        for d in range(7)
    ]


@dataclass(frozen=True)
class Header:
    """What the paper's header says about its dates."""

    week: date  # the Monday of the week the Monday column belongs to
    #: weekday -> the date written over that column (labelled columns only)
    dates: dict[int, date]
    #: weekdays whose label and written date disagree
    mismatched: frozenset[int]


def _nearest_year(month: int, day: int, today: date) -> date | None:
    options = []
    for year in (today.year - 1, today.year, today.year + 1):
        try:
            options.append(date(year, month, day))
        except ValueError:
            pass
    return min(options, key=lambda d: abs((d - today).days)) if options else None


def parse_header(text: str, today: date, date_format: str = "md") -> Header | None:
    """The week and per-column dates from the model's `Dates:` line. Dates
    carrying a weekday label ("Sun 10/25") give each column its own date; the
    paper has no year, so each is whichever puts it nearest today. Unlabelled
    dates ("10/26 - 11/1") fall back to the Monday on or before the first."""
    for line in text.splitlines():
        if not _fold(_clean_line(line)).startswith(("dates", "fechas")):
            continue
        pairs: list[tuple[int | None, date]] = []
        for m in _DATE.finditer(line):
            a, b = int(m.group(1)), int(m.group(2))
            d = _nearest_year(*((b, a) if date_format == "dm" else (a, b)), today)
            if d is None:
                continue
            label = re.search(r"([^\W\d_]+)[\s.,:]*$", line[: m.start()])
            pairs.append((_weekday_of(label.group(1)) if label else None, d))
        if not pairs:
            return None
        labelled = [(w, d) for w, d in pairs if w is not None]
        if labelled and pairs[0][0] is not None:
            first_wd = pairs[0][0]
            dates = {w: d for w, d in labelled}
            mismatched = frozenset(w for w, d in labelled if d.weekday() != w)
            ok = [(w, d) for w, d in labelled if w not in mismatched]
            if ok:
                w, d = ok[0]
                first = d - timedelta(days=(w - first_wd) % 7)
                # A Sunday-first paper's week is the Monday after its first column;
                # any other start sits in the Monday-week on or before it.
                monday = first + timedelta(days=1) if first_wd == 6 else first - timedelta(days=first_wd)
                return Header(monday, dates, mismatched)
            d = pairs[0][1]
            return Header(d - timedelta(days=d.weekday()), dates, mismatched)
        first = pairs[0][1]
        return Header(first - timedelta(days=first.weekday()), {}, frozenset())
    return None


def week_from_dates(text: str, today: date, date_format: str = "md") -> date | None:
    """The Monday of the paper's week (see `parse_header`)."""
    header = parse_header(text, today, date_format)
    return header.week if header else None
