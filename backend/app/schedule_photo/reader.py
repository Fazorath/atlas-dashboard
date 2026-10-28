"""Read one Schedule photo into a Draft week, in the background (ADR 0006).

    upload -> grid.find_row (here, ~3 s) -> the model copies the strip (~2 min
    on CPU) -> parse -> a `ready` WorkDraft, or `failed` with the reason

It runs as a task inside the API, so nothing sits idle between the once-a-week
uses, and it asks Ollama to unload the model as soon as it answers. The photo
bytes live only in this task's memory.
"""

import asyncio
import base64
import importlib.util
import io
import logging
from datetime import UTC, date, datetime, timedelta

import httpx
from sqlalchemy import delete, select, update

from app.clock import local_today
from app.config import settings
from app.db import SessionLocal
from app.models import DraftStatus, WorkDraft
from app.models.board import OWNER_ID

log = logging.getLogger(__name__)

PROMPT = (
    "This is part of a handwritten staff schedule. The top band is the header: dates and "
    "weekdays (Lunes..Domingo or Monday..Sunday). The bottom band is one employee's row. "
    "Copy exactly what is written in that row under each weekday, left to right, as 7 lines "
    "`Lunes: <text>`, and give the header as a line `Dates:` with each column's weekday and date, "
    "left to right, like `Dates: Sun 10/25, Mon 10/26, ...`. Do not reformat."
)

#: Keeps a stuck model from holding a draft at "reading" forever.
MODEL_TIMEOUT = 600

#: A `reading` row older than this counts as failed (the model timeout is 10
#: min), in case the task died without recording why.
STALE_AFTER = timedelta(minutes=15)

FINISH_TRIES = 3
FINISH_RETRY_DELAY = 1.0

# Strong refs: asyncio only keeps weak ones to running tasks.
_tasks: set[asyncio.Task] = set()


def available() -> bool:
    """Configured in work.yaml and built with WITH_VISION=true."""
    return settings.work_photo is not None and importlib.util.find_spec("cv2") is not None


def start(draft_id: int, data: bytes, fallback_week: date) -> None:
    task = asyncio.create_task(_run(draft_id, data, fallback_week))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _ask_model(strip_jpeg: bytes) -> str:
    cfg = settings.work_photo
    async with httpx.AsyncClient(timeout=MODEL_TIMEOUT) as client:
        r = await client.post(
            f"{cfg.ollama_url.rstrip('/')}/api/generate",
            json={
                "model": cfg.model,
                "prompt": PROMPT,
                "images": [base64.b64encode(strip_jpeg).decode()],
                "stream": False,
                "options": {"temperature": 0},
                "keep_alive": 0,  # free the model's RAM straight away
            },
        )
        r.raise_for_status()
        return r.json().get("response", "")


async def _finish(draft_id: int, **values) -> None:
    async with SessionLocal() as session:
        await session.execute(
            update(WorkDraft)
            .where(WorkDraft.id == draft_id)
            .values(finished_at=datetime.now(UTC), **values)
        )
        await session.commit()


async def _finish_safely(draft_id: int, **values) -> None:
    """`_finish` that can't leave the row at `reading`: retried, and if the
    database stays down, logged rather than raised (the API treats a `reading`
    row older than STALE_AFTER as failed, so it can't block anything for long)."""
    for attempt in range(FINISH_TRIES):
        try:
            await _finish(draft_id, **values)
            return
        except Exception:
            log.exception("schedule photo %d: couldn't record the result", draft_id)
            if attempt + 1 < FINISH_TRIES:
                await asyncio.sleep(FINISH_RETRY_DELAY)


async def _run(draft_id: int, data: bytes, fallback_week: date) -> None:
    try:
        await _read(draft_id, data, fallback_week)
    except BaseException as exc:
        log.exception("schedule photo %d failed", draft_id)
        await _finish_safely(
            draft_id, status=DraftStatus.failed, error="Something went wrong reading the photo."
        )
        if not isinstance(exc, Exception):
            raise


async def _read(draft_id: int, data: bytes, fallback_week: date) -> None:
    # Imported here: without WITH_VISION the API never loads OpenCV. A missing
    # library is an error like any other, so it must be inside `_run`'s guard.
    # In a worker thread, since loading OpenCV and numpy blocks for a while.
    grid = await asyncio.to_thread(importlib.import_module, "app.schedule_photo.grid")
    PhotoError, find_row = grid.PhotoError, grid.find_row
    from app.schedule_photo.parse import parse_header, parse_row

    cfg = settings.work_photo
    try:
        strip = await asyncio.to_thread(find_row, data, cfg.name)
        del data
        rows, angle = strip.rows, strip.angle
        buf = io.BytesIO()
        strip.image.save(buf, format="JPEG", quality=92)
        try:
            text = await _ask_model(buf.getvalue())
        except httpx.HTTPStatusError as exc:
            log.warning(
                "schedule photo %d: model error: %s: %.300s", draft_id, exc, exc.response.text
            )
            code = exc.response.status_code
            if code == 404 and "model" in exc.response.text.lower():
                error = f'The vision model "{cfg.model}" isn\'t installed in Ollama. Pull it first.'
            elif code == 404:
                # Ollama's own 404 names the model; any other 404 is a wrong URL.
                error = "Nothing answered at photo.ollama_url (HTTP 404). Check the address."
            else:
                error = f"The vision model answered with an error (HTTP {code})."
            await _finish_safely(draft_id, status=DraftStatus.failed, error=error)
            return
        except httpx.HTTPError as exc:
            log.warning("schedule photo %d: model unreachable: %s", draft_id, exc)
            await _finish_safely(
                draft_id, status=DraftStatus.failed, error="Couldn't reach the vision model."
            )
            return
        log.info("schedule photo %d read (%d rows, %.1f°): %r", draft_id, rows, angle, text)

        header = parse_header(text, local_today(), cfg.date_format)
        week = header.week if header else fallback_week
        guessed = header is None
        days = parse_row(text, cfg.close_times(), cfg.morning_from)
        payload = [_day_payload(d, week, header) for d in days]
        async with SessionLocal() as session:
            # One Draft week per week: the newer photo wins.
            await session.execute(
                delete(WorkDraft).where(
                    WorkDraft.user_id == OWNER_ID,
                    WorkDraft.week_start == week,
                    WorkDraft.id != draft_id,
                )
            )
            await session.commit()
        await _finish(draft_id, status=DraftStatus.ready, week_start=week, week_guessed=guessed, days=payload)
    except PhotoError as exc:
        await _finish_safely(draft_id, status=DraftStatus.failed, error=str(exc))


def _day_payload(d, week: date, header) -> dict:
    """One column of the Draft. It is filed under its own written date; a day
    whose header weekday disagrees with that date, or whose date falls outside
    the week, is left unread (flagged) rather than filed silently."""
    own = header.dates.get(d.weekday) if header else None
    filed = week + timedelta(days=d.weekday)
    raw = d.raw
    if header and d.weekday in header.mismatched:
        raw = f"{d.raw} (header weekday and date disagree)".strip()
        return {"date": filed.isoformat(), "start": None, "end": None, "off": False, "raw": raw}
    if own is not None and not week <= own < week + timedelta(days=7):
        raw = f"{d.raw} (written {own.isoformat()}, a different week)".strip()
        return {"date": own.isoformat(), "start": None, "end": None, "off": False, "raw": raw}
    return {
        "date": (own or filed).isoformat(),
        "start": d.start.strftime("%H:%M") if d.start else None,
        "end": d.end.strftime("%H:%M") if d.end else None,
        "off": d.off,
        "raw": raw,
    }


async def fail_interrupted() -> None:
    """A restart mid-read leaves a draft at `reading`; nothing will finish it."""
    async with SessionLocal() as session:
        stuck = (
            await session.execute(select(WorkDraft.id).where(WorkDraft.status == DraftStatus.reading))
        ).scalars().all()
    for draft_id in stuck:
        await _finish_safely(draft_id, status=DraftStatus.failed, error="Interrupted by a restart. Try again.")
