"""Take the manual's screenshots of a running, demo-seeded Atlas.

    python capture.py http://127.0.0.1:8298 ../src/assets/screens

Normally run by shoot.sh, inside the Playwright image, against the throwaway
stack it starts. Every picture is taken twice where it matters, at desktop and
phone size, in America/New_York so "today" matches the seeded week. Motion is
reduced so Edit mode's wiggle doesn't blur a frame.

Leak-check every image before committing it: these ship in a public site.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page

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


def check_demo(config: dict) -> None:
    """Refuse anything but the seeded demo. These pictures ship in a public
    site, so a real install (someone else's name) must never be shot."""
    name = str(config.get("name", "")).strip()
    if name != "Sam":
        raise SystemExit(
            f"refusing to shoot: /api/config says the owner is {name!r}, not the "
            "'Sam' demo. Is this your real install?"
        )


def assert_demo(base: str) -> None:
    try:
        with urllib.request.urlopen(base + "/api/config", timeout=15) as resp:
            config = json.load(resp)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"refusing to shoot: cannot read {base}/api/config ({exc})")
    check_demo(config if isinstance(config, dict) else {})


def settle(page: Page) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)


def shot(page: Page, out: Path, name: str, full: bool = False) -> None:
    path = out / f"{name}.png"
    page.screenshot(path=str(path), full_page=full)
    print("wrote", path.name)


def put_services_on_today(page: Page, base: str) -> None:
    """Add the demo Homelab module's Services list to Today, as a reader would."""
    page.goto(base + "/")
    settle(page)
    if page.locator('[data-tile="custom.homelab.services"]').count():
        return
    page.get_by_label("Edit this board").click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Add").click()
    page.wait_for_timeout(600)
    page.get_by_role("tab", name="Homelab").click()
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Add", exact=True).last.click()
    page.wait_for_timeout(900)
    # Size L shows all five rows, so the card has no "+N more" line.
    page.get_by_role("radiogroup", name="Services size").get_by_label("Size L").click()
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(900)


def main(base: str, out: Path) -> None:
    assert_demo(base)
    out.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright

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
            if size == "desktop":
                put_services_on_today(page, base)
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
