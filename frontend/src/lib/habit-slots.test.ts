// Run with: node --test src/lib/habit-slots.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitSlots } from "./habit-slots.ts";

const habits = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const ids = (r: { shown: { id: number }[] }) => r.shown.map((h) => h.id);

test("fewer Habits than slots: all shown, no overflow", () => {
  const r = fitSlots(habits(4), 8);
  assert.deepEqual(ids(r), [1, 2, 3, 4]);
  assert.equal(r.overflow, 0);
});

test("exactly as many Habits as slots: all shown, no overflow", () => {
  const r = fitSlots(habits(8), 8);
  assert.equal(r.shown.length, 8);
  assert.equal(r.overflow, 0);
});

test("one too many: the last slot becomes the marker", () => {
  const r = fitSlots(habits(9), 8);
  assert.deepEqual(ids(r), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.overflow, 2);
});

test("order is kept", () => {
  const r = fitSlots([{ id: 3 }, { id: 1 }, { id: 2 }], 2);
  assert.deepEqual(ids(r), [3]);
  assert.equal(r.overflow, 2);
});

test("no Habits: nothing shown, no overflow", () => {
  assert.deepEqual(fitSlots([], 8), { shown: [], overflow: 0 });
});
