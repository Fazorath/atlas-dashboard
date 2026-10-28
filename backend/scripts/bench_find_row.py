"""Time `find_row` by stage on synthetic Schedule photos with real printed text.

    cd backend && python scripts/bench_find_row.py [--runs 5]

Needs Tesseract (the API image has it). Each input is run several times; the
table shows the median per stage in milliseconds. The sheets match the
geometry of tests/test_schedule_grid.py, with the weekday header and the name
column actually drawn so real OCR has something to read.
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np

from app.schedule_photo import grid

W, H = 2000, 1500
COLS = [20, 400, 630, 860, 1090, 1300, 1520, 1735, 1960]
RULES = [280 + 92 * i for i in range(13)]
DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"]
PEOPLE = ["Ana", "Luis", "Pedro", "Sofia", "Carlos", "Maria", "Elena", "Jorge", "Rosa", "Diego", "Lucia"]
TARGET = "Maria"


def text_sheet(people: list[str]) -> np.ndarray:
    img = np.full((H, W), 255, np.uint8)
    for x in COLS:
        cv2.line(img, (x, RULES[0]), (x, RULES[-1]), 0, 3)
    for y in RULES:
        cv2.line(img, (COLS[0], y), (COLS[-1], y), 0, 3)
    font = cv2.FONT_HERSHEY_SIMPLEX
    for c, day in enumerate(DAYS, start=1):
        cv2.putText(img, day, (COLS[c] + 40, RULES[1] - 28), font, 1.6, 0, 3)
    for r, name in enumerate(people):
        cv2.putText(img, name, (COLS[0] + 30, RULES[r + 2] - 28), font, 1.6, 0, 3)
    return img


def on_canvas(sheet: np.ndarray) -> np.ndarray:
    canvas = np.full((1800, 2400), 255, np.uint8)
    canvas[150 : 150 + H, 200 : 200 + W] = sheet
    return canvas


def tilted(img: np.ndarray, degrees: float) -> np.ndarray:
    m = cv2.getRotationMatrix2D((1200, 900), degrees, 1.0)
    return cv2.warpAffine(img, m, (2400, 1800), borderValue=255)


def keystoned_top(img: np.ndarray, pct: float) -> np.ndarray:
    src = np.float32([[220, 150], [2220, 150], [2220, 1650], [220, 1650]])
    dst = src.copy()
    dst[0, 0] += (COLS[-1] - COLS[0]) * pct / 100
    dst[1, 0] -= (COLS[-1] - COLS[0]) * pct / 100
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (2400, 1800), borderValue=255)


def png(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def inputs() -> dict[str, tuple[bytes, str]]:
    flat = on_canvas(text_sheet(PEOPLE))
    early = on_canvas(text_sheet(["Maria"] + [p for p in PEOPLE if p != "Maria"]))
    return {
        "upright, name in row 4": (png(flat), TARGET),
        "upright, name in row 1": (png(early), TARGET),
        "tilted 6 deg": (png(tilted(flat, 6)), TARGET),
        "keystone top 8%": (png(keystoned_top(flat, 8)), TARGET),
        "keystone 8% + tilt 6": (png(tilted(keystoned_top(flat, 8), 6)), TARGET),
        "upside down (180 deg)": (png(cv2.rotate(flat, cv2.ROTATE_180)), TARGET),
        "portrait, turned": (png(cv2.rotate(flat, cv2.ROTATE_90_CLOCKWISE)), TARGET),
    }


STAGES = ["load", "straighten: angle (Hough)", "straighten: keystone", "grid", "header OCR", "name-column OCR", "other"]
_acc: dict[str, float] = defaultdict(float)
_counts: dict[str, int] = defaultdict(int)
_state = {"in_header": False}


def timed(name: str, fn):
    def wrapper(*args, **kwargs):
        t = time.perf_counter()
        try:
            return fn(*args, **kwargs)
        finally:
            _acc[name] += time.perf_counter() - t

    return wrapper


def instrument() -> None:
    grid.load = timed("load", grid.load)
    grid._angle = timed("straighten: angle (Hough)", grid._angle)
    grid._unkeystone = timed("straighten: keystone", grid._unkeystone)
    grid._grid = timed("grid", grid._grid)
    real_ocr, real_header = grid._ocr, grid._header_row

    def ocr(cell):
        _counts["tesseract calls"] += 1
        key = "header OCR" if _state["in_header"] else "name-column OCR"
        t = time.perf_counter()
        try:
            return real_ocr(cell)
        finally:
            _acc[key] += time.perf_counter() - t

    def header(*args, **kwargs):
        _state["in_header"] = True
        try:
            return real_header(*args, **kwargs)
        finally:
            _state["in_header"] = False

    grid._ocr, grid._header_row = ocr, header


def run_once(data: bytes, name: str) -> tuple[dict[str, float], int, str]:
    _acc.clear()
    _counts.clear()
    t = time.perf_counter()
    try:
        s = grid.find_row(data, name)
        outcome = f"rows={s.rows} angle={s.angle:.1f} strip={s.image.size}"
    except grid.PhotoError as exc:
        outcome = f"PhotoError: {exc}"
    total = time.perf_counter() - t
    out = {k: _acc.get(k, 0.0) for k in STAGES if k != "other"}
    out["other"] = total - sum(out.values())
    out["total"] = total
    return out, _counts["tesseract calls"], outcome


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()
    instrument()
    cases = inputs()
    for data, name in cases.values():  # warm up imports, Tesseract's model load
        run_once(data, name)
    print(f"median of {args.runs} runs, milliseconds")
    header = f"{'input':<26}" + "".join(f"{s.split(': ')[-1][:11]:>12}" for s in STAGES) + f"{'total':>9}{'calls':>7}  outcome"
    print(header)
    grand = defaultdict(list)
    for label, (data, name) in cases.items():
        runs = [run_once(data, name) for _ in range(args.runs)]
        med = {k: statistics.median(r[0][k] for r in runs) * 1000 for k in runs[0][0]}
        for k, v in med.items():
            grand[k].append(v)
        calls = runs[0][1]
        row = f"{label:<26}" + "".join(f"{med[s]:>12.0f}" for s in STAGES) + f"{med['total']:>9.0f}{calls:>7}  {runs[0][2]}"
        print(row)
    print(f"{'SUM of medians':<26}" + "".join(f"{sum(grand[s]):>12.0f}" for s in STAGES) + f"{sum(grand['total']):>9.0f}")


if __name__ == "__main__":
    main()
