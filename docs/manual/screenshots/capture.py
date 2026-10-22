"""Take the manual's screenshots of a running, demo-seeded Atlas.

    python capture.py http://127.0.0.1:8298 ../src/assets/screens

Normally run by shoot.sh, inside the Playwright image, against the throwaway
stack it starts. Every picture is taken twice where it matters, at desktop and
phone size, in America/New_York so "today" matches the seeded week. Motion is
reduced so Edit mode's wiggle doesn't blur a frame.

Leak-check every image before committing it: these ship in a public site.
"""

import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

DESKTOP = {"viewport": {"width": 1200, "height": 820}, "device_scale_factor": 1}
PHONE = {
    "viewport": {"width": 390, "height": 844},
    "device_scale_factor": 2,
    "is_mobile": True,
    "has_touch": True,
}

#: file stem, route, sizes, whole page (desktop only; a phone shot is one screen).
SCREENS = (
    ("today", "/", ("desktop", "phone"), True),
    ("health", "/health", ("desktop", "phone"), True),
    ("school", "/school", ("desktop", "phone"), True),
    ("habits", "/habits", ("desktop", "phone"), True),
    ("weather", "/weather", ("desktop",), True),
    ("work", "/work", ("desktop",), False),
    ("money", "/money", ("desktop",), False),
    ("listening", "/listening", ("desktop",), False),
    ("status", "/status", ("desktop",), False),
)


def settle(page: Page) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)


def shot(page: Page, out: Path, name: str, full: bool = False) -> None:
    path = out / f"{name}.png"
    page.screenshot(path=str(path), full_page=full)
    print("wrote", path.name)


def main(base: str, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for size, opts in (("desktop", DESKTOP), ("phone", PHONE)):
            ctx = browser.new_context(
                **opts,
                timezone_id="America/New_York",
                locale="en-US",
                color_scheme="dark",
                reduced_motion="reduce",
            )
            page = ctx.new_page()
            for stem, route, sizes, full in SCREENS:
                if size not in sizes:
                    continue
                page.goto(base + route)
                settle(page)
                shot(page, out, f"{stem}-{size}", full=full and size == "desktop")

            # Edit mode (desktop) and the Widget gallery (both), on Today.
            page.goto(base + "/")
            settle(page)
            page.get_by_label("Edit this board").click()
            page.wait_for_timeout(600)
            if size == "desktop":
                shot(page, out, "today-edit-desktop")
            page.get_by_role("button", name="Add").click()
            page.wait_for_timeout(900)
            shot(page, out, f"gallery-{size}")

            # The Work week sheet, on a phone.
            if size == "phone":
                page.goto(base + "/work")
                settle(page)
                page.get_by_label("Edit week").click()
                page.wait_for_timeout(900)
                shot(page, out, "work-edit-week-phone")
            ctx.close()
        browser.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1].rstrip("/"), Path(sys.argv[2]))
