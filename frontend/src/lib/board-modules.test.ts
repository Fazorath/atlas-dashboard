// Run with: node --test src/lib/board-modules.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { catchUp } from "./board-modules.ts";

const t = (widget: string, size = "M") => ({ widget, size });
const defaults = [t("work.shift"), t("habits.today"), t("audiobookshelf.now_listening")];

test("a newly enabled Module's default Widgets go after the existing ones", () => {
  const r = catchUp([t("habits.today", "L")], ["habits"], ["habits", "work", "audiobookshelf"], defaults);
  assert.deepEqual(r.layout.map((x) => x.widget), ["habits.today", "work.shift", "audiobookshelf.now_listening"]);
  assert.equal(r.layout[0].size, "L", "saved tiles are untouched");
  assert.deepEqual(r.seen, ["habits", "work", "audiobookshelf"]);
  assert.equal(r.changed, true);
});

test("nothing changes when no Module is new", () => {
  const layout = [t("habits.today")];
  const r = catchUp(layout, ["habits", "work"], ["habits", "work"], defaults);
  assert.equal(r.changed, false);
  assert.deepEqual(r.layout, layout);
});

test("a Widget removed after the catch-up is not added again", () => {
  const first = catchUp([t("habits.today")], ["habits"], ["habits", "work"], defaults);
  const afterRemoval = first.layout.filter((x) => x.widget !== "work.shift");
  const again = catchUp(afterRemoval, first.seen, ["habits", "work"], defaults);
  assert.equal(again.changed, false);
  assert.deepEqual(again.layout.map((x) => x.widget), ["habits.today"]);
});

test("a Widget the user already placed is not duplicated", () => {
  const r = catchUp([t("work.shift", "S")], ["habits"], ["habits", "work"], defaults);
  assert.deepEqual(r.layout, [t("work.shift", "S")]);
  assert.deepEqual(r.seen, ["habits", "work"]);
});

test("a Board saved before Modules were remembered gets a missing Module's Widgets", () => {
  const r = catchUp([t("habits.today")], null, ["habits", "work"], defaults);
  assert.deepEqual(r.layout.map((x) => x.widget), ["habits.today", "work.shift"]);
  assert.deepEqual(r.seen, ["habits", "work"]);
  assert.equal(r.changed, true);
});

test("a Board saved before Modules were remembered keeps a Module that already has a Widget", () => {
  const r = catchUp([t("habits.today"), t("work.shift", "S")], null, ["habits", "work"], defaults);
  assert.deepEqual(r.layout, [t("habits.today"), t("work.shift", "S")]);
  assert.deepEqual(r.seen, ["habits", "work"]);
  assert.equal(r.changed, true);
});

test("a Module switched off and on again is not new", () => {
  // Off then on leaves it remembered, so a removed Widget stays removed.
  const r = catchUp([t("habits.today")], ["habits", "work"], ["habits", "work"], defaults);
  assert.equal(r.changed, false);
});
