// Run with: node --test src/lib/school-cache.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { tickCacheEntry } from "./school-cache.ts";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const row = (uid: string, done = false) => ({
  ics_uid: uid,
  title: uid,
  course: null,
  course_full: null,
  due_at: "2026-11-04T23:59:00Z",
  all_day: true,
  url: null,
  done,
  done_at: null,
  overdue: false,
});
const summary = () => ({
  configured: true,
  detail: null,
  overdue: [],
  upcoming: [row("a"), row("b")],
  week_total: 2,
  week_done: 0,
  next_class: null,
  classes: [],
  fetched_at: null,
});
const plan = { days: [{ date: "2026-11-04", items: [] }], total_minutes: 0 };
const tick = (key: unknown[], data: unknown) => tickCacheEntry(key, data, "a", NOW, () => true);

test("a study plan in the cache is left alone and doesn't throw", () => {
  assert.equal(tick(["school", "study", 7], plan), plan);
});

test("summary: the ticked row flips and the week count moves", () => {
  const out = tick(["school", "summary", 7], summary()) as ReturnType<typeof summary>;
  assert.equal(out.upcoming[0].done, true);
  assert.equal(out.upcoming[1].done, false);
  assert.equal(out.week_done, 1);
});

test("past: the ticked row flips", () => {
  const out = tick(["school", "past", 30], [row("a", true), row("b")]) as ReturnType<typeof row>[];
  assert.equal(out[0].done, false);
  assert.equal(out[0].done_at, null);
});

test("empty and unknown entries pass through", () => {
  assert.equal(tick(["school", "summary", 7], undefined), undefined);
  assert.equal(tick(["school", "other"], 5), 5);
});
