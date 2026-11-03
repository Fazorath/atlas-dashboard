// Run with: node --test src/lib/custom-modules.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { accentCss, buildCustom, formatStat, rowValue, statusDot, visibleRows, type CustomPayloadModule } from "./custom-modules.ts";

const widget = { id: "custom.home.temp", widget: "temp", type: "stat", title: "Living room", sizes: ["S", "M"], display: { format: "number" } };

function module(over: Partial<CustomPayloadModule> = {}): CustomPayloadModule {
  return {
    id: "home",
    name: "Home",
    area: { key: "home", new: true, label: "Home", icon: "house", accent: "money" },
    widgets: [widget],
    secrets: [],
    problem: null,
    ...over,
  };
}

test("a module with a new Area builds that Area and its Widgets", () => {
  const { areas, widgets } = buildCustom([module()]);
  assert.deepEqual(areas, [
    { key: "home", to: "/c/home", label: "Home", icon: "house", accent: "money", hex: null, source: "custom:home" },
  ]);
  assert.deepEqual(widgets, [
    { id: "custom.home.temp", module: "home", widget: "temp", type: "stat", title: "Living room", area: "home", sizes: ["S", "M"], display: { format: "number" } },
  ]);
});

test("a module joining an existing Area builds Widgets only, on that Area", () => {
  const { areas, widgets } = buildCustom([module({ area: { key: "weather", new: false, label: null, icon: null, accent: null } })]);
  assert.deepEqual(areas, []);
  assert.equal(widgets[0].area, "weather");
});

test("a hex accent gets its own data-accent value and a CSS block", () => {
  const { areas } = buildCustom([module({ area: { key: "home", new: true, label: "Home", icon: null, accent: "#3aa0ff" } })]);
  assert.equal(areas[0].accent, "custom-home");
  assert.equal(areas[0].hex, "#3aa0ff");
  const css = accentCss(areas);
  assert.match(css, /^\[data-accent="custom-home"\]\{--accent:#3aa0ff;/);
});

test("a palette name is used as is; no accent or an unknown one falls back to violet", () => {
  const accentOf = (accent: string | null) =>
    buildCustom([module({ area: { key: "home", new: true, label: "Home", icon: null, accent } })]).areas[0].accent;
  assert.equal(accentOf("weather"), "weather");
  assert.equal(accentOf(null), "sleep");
  assert.equal(accentOf("chartreuse"), "sleep");
});

test("a value that is not a safe hex colour never reaches the CSS", () => {
  const { areas } = buildCustom([module({ area: { key: "home", new: true, label: "Home", icon: null, accent: "#fff;}body{display:none" } })]);
  assert.equal(areas[0].hex, null);
  assert.equal(accentCss(areas), "");
});

test("an unset icon stays null so the caller can fall back", () => {
  const { areas } = buildCustom([module({ area: { key: "home", new: true, label: "Home", icon: null, accent: null } })]);
  assert.equal(areas[0].icon, null);
});

test("a module with a Problem builds nothing", () => {
  assert.deepEqual(buildCustom([module({ problem: "home.yaml: bad" })]), { areas: [], widgets: [] });
});

test("Stat and List widgets are built, any other type is left out", () => {
  const list = { ...widget, id: "custom.home.l", widget: "l", type: "list", sizes: ["M", "L", "XL"] };
  const other = { ...widget, id: "custom.home.x", widget: "x", type: "gauge" };
  const { widgets } = buildCustom([module({ widgets: [widget, list, other] })]);
  assert.deepEqual(widgets.map((w) => [w.widget, w.type]), [["temp", "stat"], ["l", "list"]]);
});

test("a List shows as many rows as its Size has room for, and counts the rest", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ title: `r${i}`, detail: null, value: null, status: null }));
  assert.equal(visibleRows("M", rows).shown.length, 2);
  assert.equal(visibleRows("L", rows).shown.length, 5);
  assert.equal(visibleRows("XL", rows).shown.length, 10);
  assert.equal(visibleRows("L", rows).more, 7);
  assert.deepEqual(visibleRows("XL", rows.slice(0, 3)), { shown: rows.slice(0, 3), more: 0 });
});

test("a status maps to a dot colour in the palette, and no status to no dot", () => {
  assert.equal(statusDot("ok"), "bg-habits");
  assert.equal(statusDot("warn"), "bg-money");
  assert.equal(statusDot("bad"), "bg-due");
  assert.equal(statusDot(null), null);
  assert.equal(statusDot("fine"), null);
});

test("a row value shows as text, and nothing shows as empty", () => {
  assert.equal(rowValue(3), "3");
  assert.equal(rowValue("on"), "on");
  assert.equal(rowValue(true), "true");
  assert.equal(rowValue(null), "");
});

test("number format rounds to the decimals asked for", () => {
  assert.equal(formatStat(21.44, { format: "number", decimals: 1 }, "en-US"), "21.4");
  assert.equal(formatStat(21, { format: "number", decimals: 1 }, "en-US"), "21.0");
  assert.equal(formatStat(1234.5, { format: "number", decimals: 0 }, "en-US"), "1,235");
});

test("number format without decimals keeps what the source sent", () => {
  assert.equal(formatStat(21.456, { format: "number" }, "en-US"), "21.456");
});

test("number format reads numeric text, as Home Assistant sends it", () => {
  assert.equal(formatStat("21.4", { format: "number", decimals: 2 }, "en-US"), "21.40");
});

test("number format on text that isn't a number shows the text", () => {
  assert.equal(formatStat("unavailable", { format: "number", decimals: 1 }), "unavailable");
});

test("text format shows the value as written", () => {
  assert.equal(formatStat("on", { format: "text" }), "on");
  assert.equal(formatStat("21.40", { format: "text", decimals: 0 }), "21.40");
  assert.equal(formatStat(true, {}), "true");
});

test("nothing to show is a dash", () => {
  assert.equal(formatStat(null, { format: "number" }), "—");
  assert.equal(formatStat("", { format: "text" }), "—");
});
