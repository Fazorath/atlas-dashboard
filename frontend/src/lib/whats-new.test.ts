import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  cleanVersion,
  markSeen,
  parseChangelog,
  sheetToShow,
  type Entry,
  type KeyValueStore,
} from "./whats-new.ts";

const SAMPLE = `# Changelog

Intro text.

## [Unreleased]

## [0.2.0] - 2026-12-01

Second release.

### Added
- Dark mode, **finally**.
- See [the manual](https://example.com/m) for \`atlas.yaml\` details.

### Fixed
- Habit ticks survive a refresh.

## [0.1.0] - 2026-11-03

### Added
- First public release.
`;

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
  };
}

test("parses versions newest first with date and plain-text bullets", () => {
  const entries = parseChangelog(SAMPLE);
  assert.deepEqual(
    entries.map((e) => [e.version, e.date]),
    [
      ["0.2.0", "2026-12-01"],
      ["0.1.0", "2026-11-03"],
    ],
  );
  assert.deepEqual(entries[0].bullets, [
    "Dark mode, finally.",
    "See the manual for atlas.yaml details.",
    "Habit ticks survive a refresh.",
  ]);
});

test("skips Unreleased and sections with no bullets", () => {
  const text = "## [Unreleased]\n- not yet\n\n## [0.3.0] - 2027-01-01\n\nJust prose.\n";
  assert.deepEqual(parseChangelog(text), []);
});

test("empty or missing text gives no entries", () => {
  assert.deepEqual(parseChangelog(""), []);
  assert.deepEqual(parseChangelog("no headings here"), []);
});

test("a heading without a date still parses", () => {
  const [e] = parseChangelog("## [1.0.0]\n- Hello\n");
  assert.equal(e.version, "1.0.0");
  assert.equal(e.date, null);
});

test("cleanVersion drops a leading v and blanks", () => {
  assert.equal(cleanVersion("v0.1.0"), "0.1.0");
  assert.equal(cleanVersion(" 0.1.0 "), "0.1.0");
  assert.equal(cleanVersion(""), "");
  assert.equal(cleanVersion(undefined), "");
});

const entries: Entry[] = parseChangelog(SAMPLE);

test("fresh install: first open records the version silently", () => {
  const store = memory();
  assert.equal(sheetToShow(store, "0.1.0", entries), null);
  assert.equal(sheetToShow(store, "0.1.0", entries), null);
  assert.deepEqual(Object.values(store.data), ["0.1.0"]);
});

test("after an update the first open shows that version's sheet, once", () => {
  const store = memory();
  sheetToShow(store, "0.1.0", entries);
  const shown = sheetToShow(store, "0.2.0", entries);
  assert.equal(shown?.version, "0.2.0");
  // Not dismissed yet: it keeps showing on reload.
  assert.equal(sheetToShow(store, "0.2.0", entries)?.version, "0.2.0");
  markSeen(store, "0.2.0");
  assert.equal(sheetToShow(store, "0.2.0", entries), null);
});

test("dev build (no version) never shows and never records", () => {
  const store = memory();
  assert.equal(sheetToShow(store, "", entries), null);
  assert.deepEqual(store.data, {});
});

test("an updated version with no changelog entry shows nothing", () => {
  const store = memory();
  sheetToShow(store, "0.1.0", entries);
  assert.equal(sheetToShow(store, "9.9.9", entries), null);
  assert.deepEqual(Object.values(store.data), ["9.9.9"]);
});

test("a blocked localStorage degrades to no sheet", () => {
  const broken: KeyValueStore = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(sheetToShow(broken, "0.1.0", entries), null);
  assert.doesNotThrow(() => markSeen(broken, "0.1.0"));
});

test("the real CHANGELOG.md has a parseable entry for its latest release", () => {
  const text = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");
  const [latest] = parseChangelog(text);
  assert.ok(latest, "no released version found");
  assert.ok(latest.bullets.length >= 1);
});
