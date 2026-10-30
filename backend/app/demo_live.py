"""Made-up Money and Listening for demo mode.

Both are live proxies with nothing stored, so `python -m app.demo` has no rows
to write for them. With `demo: true` the Securo and Audiobookshelf readers
return these instead of calling upstream, which keeps every card on Today,
Money and Listening filled for a look around. Fictional throughout: Sam's
accounts, bills and books are not anyone's.

Plain dicts, so this module imports nothing from the sources it stands in for.
"""

import random
from datetime import date, datetime, timedelta
from html import escape

from app.clock import local_today

CURRENCY = "USD"

#: name, icon, colour, this month's spend.
CATEGORIES = (
    ("Rent", "home", "#6c8ebf", 1180.0),
    ("Groceries", "shopping-cart", "#7fb069", 412.5),
    ("Eating out", "utensils", "#e0a458", 236.8),
    ("Transport", "bus", "#5fa8d3", 118.0),
    ("Subscriptions", "repeat", "#b08ea2", 64.97),
    ("Fun", "ticket", "#d98880", 92.4),
    ("Health", "heart", "#76b7b2", 48.0),
)


def _first(day: date) -> date:
    return day.replace(day=1)


def snapshot(fetched_at: datetime) -> dict:
    spent = round(sum(c[3] for c in CATEGORIES), 2)
    return dict(
        currency=CURRENCY,
        balance=6842.17,
        projected_balance=6310.4,
        balance_date=local_today(),
        income_month=3150.0,
        expenses_month=spent,
        projected_income=3150.0,
        projected_expenses=round(spent + 190.0, 2),
        assets_value=11230.0,
        accounts_count=len(accounts()),
        pending_categorization=0,
        fetched_at=fetched_at,
    )


def categories() -> list[dict]:
    total = sum(c[3] for c in CATEGORIES)
    return [
        dict(name=n, icon=i, color=c, amount=a, share=a / total)
        for n, i, c, a in sorted(CATEGORIES, key=lambda c: -c[3])
    ]


def accounts() -> list[dict]:
    rows = (
        ("demo-checking", "Everyday Checking", "Harbor Credit Union", "checking", 2412.17),
        ("demo-savings", "Rainy Day Savings", "Harbor Credit Union", "savings", 4430.0),
        ("demo-card", "Travel Card", "Northwind Bank", "credit_card", -318.4),
    )
    return [
        dict(id=i, name=n, institution=inst, kind=k, balance=b, currency=CURRENCY)
        for i, n, inst, k, b in rows
    ]


def bills(start: date, end: date) -> list[dict]:
    #: description, day of month, amount, category, colour.
    monthly = (
        ("Rent", 1, 1180.0, "Rent", "#6c8ebf"),
        ("Internet", 6, 59.99, "Subscriptions", "#b08ea2"),
        ("Phone plan", 11, 35.0, "Subscriptions", "#b08ea2"),
        ("Streaming bundle", 15, 17.99, "Subscriptions", "#b08ea2"),
        ("Gym", 22, 24.0, "Health", "#76b7b2"),
    )
    out, day = [], start
    while day <= end:
        for name, dom, amount, cat, color in monthly:
            if day.day == dom:
                out.append(dict(date=day, description=name, amount=amount, currency=CURRENCY,
                                category=cat, color=color))
        day += timedelta(days=1)
    return out


def goals() -> list[dict]:
    today = local_today()
    return [
        dict(name="Emergency fund", target=6000.0, current=4430.0, currency=CURRENCY, share=0.738,
             target_date=today + timedelta(days=150), on_track="on_track",
             monthly_contribution=320.0, color="#7fb069"),
        dict(name="Trip to Lisbon", target=2400.0, current=860.0, currency=CURRENCY, share=0.358,
             target_date=today + timedelta(days=240), on_track="on_track",
             monthly_contribution=180.0, color="#5fa8d3"),
    ]


def trend(months: int) -> list[dict]:
    """Oldest first; the current month matches the snapshot."""
    rng = random.Random(11)
    out = []
    for back in range(months - 1, -1, -1):
        month = _first(local_today())
        for _ in range(back):
            month = _first(month - timedelta(days=1))
        income = 3150.0 + (rng.choice((0, 0, 120)) if back else 0)
        expenses = 2000.0 + rng.randint(-160, 220) if back else round(sum(c[3] for c in CATEGORIES), 2)
        out.append(dict(month=month.strftime("%Y-%m"), income=income, expenses=expenses))
    return out


def daily_out(start: date, end: date) -> list[dict]:
    out, day = [], start
    while day <= end:
        # Seeded per day, so a day reads the same whichever window asks for it.
        rent = 1180.0 if day.day == 1 else 0.0
        out.append(dict(date=day, amount=rent + random.Random(day.toordinal()).choice((0, 0, 12, 24, 38, 55, 71, 96))))
        day += timedelta(days=1)
    return out


# --- Listening --------------------------------------------------------------

#: id, title, subtitle, author, narrator, series, hours, progress, cover colour.
BOOKS = (
    ("demo-book-1", "The Lighthouse at Marrow Bay", None, "Elena Voss", "Tom Hale", None, 11.4, 0.62, "#3d5a80"),
    ("demo-book-2", "Small Systems", "How Tiny Habits Run Big Things", "Dara Okafor", "Dara Okafor", None, 7.8, 0.31, "#5f8a64"),
    ("demo-book-3", "Salt Roads", None, "Mikael Berg", "Ines Duarte", "The Tidewater Cycle", 14.2, 0.08, "#b5651d"),
)

#: id, title, author, days ago, cover colour.
FINISHED = (
    ("demo-book-4", "A Field Guide to Quiet", "Ruth Calloway", 3, "#8e7dbe"),
    ("demo-book-5", "The Cartographer's Apprentice", "Jon Whitlock", 9, "#c1666b"),
    ("demo-book-6", "Night Shift Radio", "Priya Raman", 17, "#4a8fa8"),
)


def books(now: datetime) -> list[dict]:
    out = []
    for n, (item, title, sub, author, narr, series, hours, progress, _) in enumerate(BOOKS):
        duration = hours * 3600
        out.append(dict(
            item_id=item, title=title, subtitle=sub, author=author, narrator=narr, series=series,
            kind="audiobook", duration_s=duration, current_time_s=duration * progress,
            progress=progress, last_listened_at=now - timedelta(hours=1 + n * 20),
        ))
    return out


def listening_days() -> dict[str, float]:
    """Seconds per local day, keyed by ISO date, as ABS reports them."""
    today = local_today()
    rng = random.Random(5)
    return {
        (today - timedelta(days=back)).isoformat():
            float(0 if back and rng.random() < 0.2 else rng.randint(15, 95) * 60)
        for back in range(90)
    }


def finished(now: datetime) -> list[dict]:
    return [
        dict(item_id=i, title=t, author=a, finished_at=now - timedelta(days=d))
        for i, t, a, d, _ in FINISHED
    ]


def cover(item_id: str) -> tuple[bytes, str]:
    """A flat typographic cover drawn on the spot, so there is no art to license."""
    spec = {b[0]: (b[1], b[8]) for b in BOOKS} | {f[0]: (f[1], f[4]) for f in FINISHED}
    title, color = spec.get(item_id, ("Demo", "#444444"))
    lines, line = [], ""
    for word in title.split():
        if line and len(line) + len(word) > 12:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    lines.append(line)
    text = "".join(
        f'<text x="24" y="{96 + i * 34}" font-family="Georgia,serif" font-size="28" '
        f'font-weight="700" fill="#fff">{escape(ln)}</text>'
        for i, ln in enumerate(lines[:5])
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360">'
        f'<rect width="240" height="360" fill="{color}"/>'
        '<rect x="24" y="40" width="48" height="4" fill="#fff" opacity=".8"/>'
        f"{text}</svg>"
    )
    return svg.encode(), "image/svg+xml"
