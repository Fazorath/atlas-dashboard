"""Find your row on a Schedule photo — geometry only, no model (ADR 0006).

A phone photo of the staff schedule arrives sideways, slanted and shadowed. A
small vision model reads one clean row reliably but loses its place on the
whole sheet, so everything positional happens here:

    upright      the phone's EXIF turn, then landscape (the paper always is),
                 then whichever of the two landscape turns has a readable
                 weekday header
    straight     the median angle of the ruled lines, so rows run level, then the
                 table's outline squared up if the photo was taken at an angle
    grid         ruled lines found by morphology, cells between them
    your row     the printed name in the first column that matches
    strip        the header band (with the dates written above it) stacked on
                 your row — the only picture the model ever sees

Nothing here keeps the photo; EXIF (GPS included) is gone after `load`.
"""

from __future__ import annotations

import difflib
import io
import re
from dataclasses import dataclass

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageOps

from app.schedule_photo.parse import DAY_NAMES, _fold

LONG_SIDE = 2400  # enough for handwriting; the model downsizes anyway

# Every spelling the parser accepts for a weekday; the first two of each day are
# its full names (Spanish, English), the only ones fuzzy-matched.
WEEKDAY_WORDS = {w for names in DAY_NAMES.values() for w in names}
WEEKDAY_FULL_NAMES = [w for names in DAY_NAMES.values() for w in names[:2]]
FUZZY_MIN_LEN = 5  # shorter words must match a listed name exactly


class PhotoError(Exception):
    """A reason the photo can't be read, worded for the person holding it."""


@dataclass
class Strip:
    image: Image.Image  # header + your row, ready for the model
    rows: int  # rows found on the grid, for logs and tests
    angle: float  # degrees straightened by


def load(data: bytes) -> np.ndarray:
    """Bytes -> upright-by-EXIF, landscape-ish, downscaled BGR array, no EXIF."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception as exc:
        raise PhotoError("That file isn't a photo Atlas can open.") from exc
    img.thumbnail((LONG_SIDE, LONG_SIDE))
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def _binary(gray: np.ndarray) -> np.ndarray:
    # Adaptive, because a phone shadow across half the sheet is normal.
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12
    )


def _lines(binary: np.ndarray, horizontal: bool) -> np.ndarray:
    h, w = binary.shape
    size = (max(w // 30, 20), 1) if horizontal else (1, max(h // 30, 20))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, size)
    return cv2.dilate(cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel), kernel)


def _angle(gray: np.ndarray) -> float:
    """Median slant of the long near-horizontal rules, in degrees.

    Measured with Hough on Canny edges of a half-size copy, not the opened line mask:
    opening with a 1 px tall kernel erases any rule tilted past a few degrees.
    Handwriting makes short segments in every direction; the length floor and
    the +-15 degree window (a degree of slack for Hough's quantisation) leave
    it out.
    """
    small = cv2.resize(gray, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    edges = cv2.Canny(small, 50, 150)
    w = small.shape[1]
    segs = cv2.HoughLinesP(edges, 1, np.pi / 720, 200, minLineLength=w // 4, maxLineGap=20)
    if segs is None:
        return 0.0
    angles = [
        np.degrees(np.arctan2(y2 - y1, x2 - x1))
        for x1, y1, x2, y2 in segs.reshape(-1, 4)
        if abs(np.degrees(np.arctan2(y2 - y1, x2 - x1))) < 16
    ]
    return float(np.median(angles)) if angles else 0.0


def _rotate(img: np.ndarray, degrees: float) -> np.ndarray:
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), degrees, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))


def _quad(gray: np.ndarray) -> np.ndarray | None:
    """The table's outer outline as four corners (tl, tr, br, bl), or None.

    The ruled lines are joined into one blob and the biggest outline hull-ed
    down to four corners. It has to be a sizeable, roughly rectangular
    quadrilateral, or it is not trusted: no outline is better than a wrong one.
    """
    h, w = gray.shape
    blob = cv2.dilate(_binary(gray), np.ones((7, 7), np.uint8))
    found, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not found:
        return None
    hull = cv2.convexHull(max(found, key=cv2.contourArea))
    if cv2.contourArea(hull) < 0.25 * h * w:
        return None
    perimeter = cv2.arcLength(hull, True)
    corners = None
    for eps in (0.01, 0.02, 0.04):
        poly = cv2.approxPolyDP(hull, eps * perimeter, True)
        if len(poly) == 4:
            corners = poly.reshape(4, 2).astype(np.float32)
            break
    if corners is None:
        return None
    s, d = corners.sum(axis=1), np.diff(corners, axis=1).ravel()
    quad = np.float32([corners[s.argmin()], corners[d.argmin()], corners[s.argmax()], corners[d.argmax()]])
    if len({tuple(p) for p in quad.tolist()}) < 4:
        return None
    top, bottom = np.linalg.norm(quad[1] - quad[0]), np.linalg.norm(quad[2] - quad[3])
    left, right = np.linalg.norm(quad[3] - quad[0]), np.linalg.norm(quad[2] - quad[1])
    if min(top, bottom) < 0.6 * max(top, bottom) or min(left, right) < 0.6 * max(left, right):
        return None
    return quad


def _unkeystone(gray: np.ndarray, color: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Warp both copies so the table's outline becomes an upright rectangle."""
    quad = _quad(gray)
    if quad is None:
        return gray, color
    x0, x1 = (quad[0, 0] + quad[3, 0]) / 2, (quad[1, 0] + quad[2, 0]) / 2
    y0, y1 = (quad[0, 1] + quad[1, 1]) / 2, (quad[3, 1] + quad[2, 1]) / 2
    rect = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    if np.abs(rect - quad).max() < 3:
        return gray, color
    m = cv2.getPerspectiveTransform(quad, rect)
    size = (gray.shape[1], gray.shape[0])
    flat = cv2.warpPerspective(gray, m, size, flags=cv2.INTER_CUBIC, borderValue=255)
    # A wrong outline must never cost a read deskew alone would have managed.
    if len(_column_rules(flat)) < len(_column_rules(gray)):
        return gray, color
    return flat, cv2.warpPerspective(color, m, size, flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))


def _straighten(gray: np.ndarray, color: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Level the rules, then square up the table's outline: (gray, colour,
    degrees rotated by). The warp is not reported; nothing reads it."""
    angle = _angle(gray)
    gray, color = _rotate(gray, angle), _rotate(color, angle)
    gray, color = _unkeystone(gray, color)
    return gray, color, angle


def _peaks(profile: np.ndarray, min_fill: float) -> list[int]:
    """Centres of the rules in a line-mask projection: runs where it covers at
    least `min_fill` of the axis. Runs closer than about twice a rule's own
    thickness (the median run width) are one rule drawn double or split by the
    threshold. The distance comes from the rules, not the photo's size, so a
    dense sheet's neighbouring rules stay apart."""
    hits = np.where(profile >= min_fill)[0]
    runs: list[list[int]] = []
    for i in hits:
        if runs and i - runs[-1][1] <= 2:
            runs[-1][1] = int(i)
        else:
            runs.append([int(i), int(i)])
    if not runs:
        return []
    thickness = float(np.median([end - start + 1 for start, end in runs]))
    reach = max(2 * thickness, 4)
    rules = [runs[0]]
    for start, end in runs[1:]:
        if start - rules[-1][1] <= reach:
            rules[-1][1] = end
        else:
            rules.append([start, end])
    return [(start + end) // 2 for start, end in rules]


def _column_rules(gray: np.ndarray) -> list[int]:
    return _peaks(_lines(_binary(gray), False).sum(axis=0) / 255 / gray.shape[0], 0.1)


def _grid(gray: np.ndarray) -> tuple[list[list[int]], list[int]]:
    """Each column's row rules (top to bottom), and the column rules.

    A sheet that isn't flat bows, so one rule can drift a fifth of a row
    across the page even once the photo is straightened: a full-width
    projection smears it below any threshold. Within one column it stays
    level, so rules are found per column. The name column sets how many rows
    there are; every other column follows its left neighbour's rules, letting
    each sit wherever that column's own line actually is.
    """
    binary = _binary(gray)
    h = gray.shape[0]
    cols = _column_rules(gray)
    if len(cols) < 2:
        return [], cols
    mask = _lines(binary, True)

    def rules(c: int) -> list[int]:
        band = mask[:, cols[c] : cols[c + 1]]
        return _peaks(band.sum(axis=1) / 255 / band.shape[1], 0.5)

    by_col = [rules(0)]
    for c in range(1, len(cols) - 1):
        found = rules(c)
        mine = []
        left = by_col[-1]
        for i, y in enumerate(left):
            # Within a third of the row above or below; else keep the neighbour's.
            gaps = [abs(y - left[j]) for j in (i - 1, i + 1) if 0 <= j < len(left)]
            reach = min(gaps, default=h) // 3
            near = [f for f in found if abs(f - y) <= reach]
            mine.append(min(near, key=lambda f: abs(f - y)) if near else y)
        by_col.append(mine)
    return by_col, cols


def _cell(gray: np.ndarray, rows: list[list[int]], cols: list[int], r: int, c: int) -> np.ndarray:
    return gray[rows[c][r] : rows[c][r + 1], cols[c] : cols[c + 1]]


def _band(
    img: np.ndarray, rows: list[list[int]], cols: list[int], tops: list[int], r_end: int
) -> np.ndarray:
    """From each column's `tops[c]` down to its rule `r_end`, every column cut
    along its own rules and brought to the name column's height, so a bowed
    row comes out as one level band."""
    height = rows[0][r_end] - max(tops[0], 0)
    parts = []
    for c in range(len(cols) - 1):
        part = img[max(tops[c], 0) : rows[c][r_end], cols[c] : cols[c + 1]]
        parts.append(cv2.resize(part, (part.shape[1], height)))
    return np.hstack(parts)


def _ocr(cell: np.ndarray) -> str:
    """One cell's printed text. The ruled border is trimmed off and the rest
    enlarged and binarised: Tesseract reads faint grey print far better so."""
    h, w = cell.shape
    inner = cell[int(h * 0.12) : int(h * 0.88), int(w * 0.04) : int(w * 0.96)]
    if inner.size == 0:
        return ""
    big = cv2.resize(inner, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    _, clean = cv2.threshold(big, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    text = pytesseract.image_to_string(clean, config="--psm 7")
    return re.sub(r"[^a-z0-9#: ]", "", _fold(text))


def _name_key(name: str) -> str:
    """A printed or configured name reduced the way `_ocr` reduces text, minus
    the row-number marks, so 'J.P.', 'Lê' and 'Zoë' compare equal to what
    Tesseract reads."""
    return re.sub(r"[^a-z0-9 ]", "", _fold(name)).strip()


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def _is_weekday(word: str) -> bool:
    word = word.strip()
    if word in WEEKDAY_WORDS:
        return True
    return len(word) >= FUZZY_MIN_LEN and max(_similar(word, d) for d in WEEKDAY_FULL_NAMES) >= 0.7


def _header_row(gray: np.ndarray, rows: list[list[int]], cols: list[int]) -> int | None:
    """Index of the row band whose cells read as weekdays, or None."""
    for r in range(min(3, len(rows[0]) - 1)):
        hits = 0
        for c in range(1, len(cols) - 1):
            # Two hits settle the band, and too few cells left can't make two.
            if hits >= 2 or hits + (len(cols) - 1 - c) < 2:
                break
            word = _ocr(_cell(gray, rows, cols, r, c))
            if word and _is_weekday(word):
                hits += 1
        if hits >= 2:
            return r
    return None


def _orientations(img: np.ndarray):
    """Landscape candidates, likeliest first. A portrait photo of a landscape
    sheet is turned one way or the other; a landscape one may be upside down."""
    h, w = img.shape[:2]
    if h > w:
        yield cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        yield cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    else:
        yield img
        yield cv2.rotate(img, cv2.ROTATE_180)


def find_row(data: bytes, name: str) -> Strip:
    """The header-plus-your-row strip from a Schedule photo, or PhotoError."""
    target = _name_key(name)
    saw_grid = False
    for candidate in _orientations(load(data)):
        gray = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
        gray, color, angle = _straighten(gray, candidate)
        rows, cols = _grid(gray)
        if len(cols) < 4 or len(rows[0]) < 3:
            continue
        saw_grid = True

        # Your printed name is also the orientation test: upside down or
        # sideways it never reads back as itself.
        best, best_score = None, 0.0
        for r in range(len(rows[0]) - 1):
            score = _similar(_name_key(_ocr(_cell(gray, rows, cols, r, 0)).lstrip("#0123456789 :")), target)
            if score > best_score:
                best, best_score = r, score
            if score == 1.0:
                break  # nothing scores higher, and a tie keeps the first
        if best is None or best_score < 0.75:
            continue
        # Never guess another band as the weekday header: a Draft week built
        # from a coworker's row is worse than a failed read.
        header = _header_row(gray, rows, cols)
        if header is None or header >= best:
            raise PhotoError(
                "Couldn't find the weekday header above your row. "
                "Retake with the top of the sheet in frame."
            )

        # Dates are written just above the header's top rule.
        dates = [2 * rs[header] - rs[header + 1] for rs in rows]
        head = _band(color, rows, cols, dates, header + 1)
        mine = _band(color, rows, cols, [rs[best] for rs in rows], best + 1)
        strip = np.vstack([head, mine])
        rgb = Image.fromarray(cv2.cvtColor(strip, cv2.COLOR_BGR2RGB))
        return Strip(image=rgb, rows=len(rows[0]) - 1, angle=angle)

    if not saw_grid:
        raise PhotoError("Couldn't find the schedule's grid. Retake with the whole sheet in frame.")
    raise PhotoError(f"Couldn't find {name} in the name column. Retake it straight on, in good light.")
