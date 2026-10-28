"""Record the README demo of a running, demo-seeded Atlas: a Custom module
arriving from a short YAML file, then the board being rearranged.

    python record_gif.py http://127.0.0.1:8298 /out /custom homelab.yaml

Normally run by shoot.sh's `gif` mode, inside the Playwright image, against the
throwaway stack it starts. It writes demo.webm to the first folder; shoot.sh
turns that into the GIF. The second folder is the stack's config/custom/, where
the module file is dropped on camera. Refuses anything but the Sam demo.
"""

from __future__ import annotations

import html
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING

from capture import assert_demo, check_demo  # noqa: F401 — check_demo is the guard

if TYPE_CHECKING:
    from playwright.sync_api import Page

#: Wider than the manual's shots so the whole board, with the new widget, fits one frame.
VIEWPORT = {"width": 1440, "height": 900}
MODULE = "homelab"
WIDGET = f"custom.{MODULE}.services"

CURSOR_JS = """
(() => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-3px 0 0 -3px;'
    + 'border-radius:50%;background:rgba(255,255,255,.9);border:2px solid #111;pointer-events:none;'
    + 'left:-50px;top:-50px;box-shadow:0 2px 8px rgba(0,0,0,.5)';
  const add = () => document.documentElement.appendChild(dot);
  document.documentElement ? add() : document.addEventListener('DOMContentLoaded', add);
  const css = document.createElement('style');
  css.textContent = '*{user-select:none !important}';  // a drag must not select text
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
  document.addEventListener('pointermove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
})();
"""


def card(yaml_text: str) -> str:
    """The file, as a code card in Atlas's dark theme. Built from the real file."""
    return f"""<!doctype html><meta charset=utf-8>
<body style="margin:0;height:100vh;background:#0b0c0e;display:grid;place-items:center;color:#e7e9ee">
<div style="width:760px;border:1px solid #2a2d34;border-radius:16px;background:#14161a;overflow:hidden">
  <div style="padding:14px 22px;border-bottom:1px solid #2a2d34;color:#9aa0ac;
    font:15px 'JetBrains Mono','DejaVu Sans Mono',monospace">config/custom/homelab.yaml</div>
  <pre style="margin:0;padding:22px;font:19px/1.5 'JetBrains Mono','DejaVu Sans Mono',monospace">{html.escape(yaml_text)}</pre>
</div>"""


def wait_for_module(base: str) -> None:
    deadline = time.time() + 60
    while time.time() < deadline:
        with urllib.request.urlopen(base + "/api/custom", timeout=15) as resp:
            mods = {m["id"]: m for m in json.load(resp)}
        if MODULE in mods:
            if mods[MODULE]["problem"]:
                raise SystemExit(f"the demo module has a Problem: {mods[MODULE]['problem']}")
            return
        time.sleep(1)
    raise SystemExit("timed out waiting for Atlas to pick up the demo module")


def centre(page: Page, selector: str) -> tuple[float, float]:
    box = page.locator(selector).bounding_box()
    assert box, f"{selector} is not on screen"
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def drag(page: Page, start: tuple[float, float], end: tuple[float, float]) -> None:
    page.mouse.move(*start, steps=12)
    page.mouse.down()
    page.mouse.move(start[0] + 6, start[1] + 6, steps=3)  # past the drag threshold
    page.mouse.move(*end, steps=30)
    page.wait_for_timeout(250)
    page.mouse.up()


def main(base: str, out: Path, custom: Path, module_file: Path) -> None:
    assert_demo(base)
    yaml_text = module_file.read_text()
    from playwright.sync_api import sync_playwright

    tmp = out / "video"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=1,
            timezone_id="America/New_York",
            locale="en-US",
            color_scheme="dark",
            reduced_motion="reduce",
            record_video_dir=str(tmp),
            record_video_size=VIEWPORT,
        )
        ctx.add_init_script(CURSOR_JS)
        page = ctx.new_page()

        # Beat 1: the file.
        page.set_content(card(yaml_text))
        page.wait_for_timeout(2800)

        # Beat 2: it appears.
        (custom / module_file.name).write_bytes(module_file.read_bytes())
        wait_for_module(base)
        page.goto(base + "/")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(700)
        page.get_by_label("Edit this board").click()
        page.wait_for_timeout(700)
        page.get_by_role("button", name="Add").click()
        page.wait_for_timeout(600)
        page.get_by_role("tab", name="Homelab").click()
        page.wait_for_timeout(1100)
        page.get_by_role("button", name="Add", exact=True).last.click()
        page.wait_for_timeout(1000)

        # Beat 3: make it yours.
        tile = f'[data-tile="{WIDGET}"]'
        first = page.locator("[data-tile]").first
        page.locator(tile).scroll_into_view_if_needed()
        start = centre(page, tile)
        end = centre(page, f'[data-tile="{first.get_attribute("data-tile")}"]')
        if first.get_attribute("data-tile") != WIDGET:
            drag(page, start, end)
            page.wait_for_timeout(500)
        page.get_by_role("radiogroup", name="Services size").get_by_label("Size L").click()
        page.wait_for_timeout(1100)
        page.get_by_role("button", name="Done", exact=True).click()
        page.wait_for_timeout(1200)

        video = page.video
        ctx.close()
        shutil.move(video.path(), out / "demo.webm")
        browser.close()
    shutil.rmtree(tmp, ignore_errors=True)
    print("wrote demo.webm")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(sys.argv[1].rstrip("/"), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]))
