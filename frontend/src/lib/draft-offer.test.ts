// Run with: node --test src/lib/draft-offer.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { draftToOffer } from "./draft-offer.ts";

const wk = "2026-10-19";
const read = (id: number, over: Partial<{ status: string; week_start: string | null }> = {}) => ({
  id,
  status: "ready",
  week_start: wk,
  ...over,
});

test("offers a ready draft that arrived after the form loaded without one", () => {
  assert.equal(draftToOffer([read(2)], wk, null, null)?.id, 2);
});

test("offers a retake that replaced the draft on screen", () => {
  assert.equal(draftToOffer([read(5)], wk, 2, null)?.id, 5);
});

test("does not offer the draft the rows are based on", () => {
  assert.equal(draftToOffer([read(2)], wk, 2, null), undefined);
});

test("does not offer one that was dismissed", () => {
  assert.equal(draftToOffer([read(5)], wk, 2, 5), undefined);
});

test("ignores drafts still reading, failed, or for another week", () => {
  const reads = [read(1, { status: "reading" }), read(2, { status: "failed" }), read(3, { week_start: "2026-10-26" })];
  assert.equal(draftToOffer(reads, wk, null, null), undefined);
  assert.equal(draftToOffer(undefined, wk, null, null), undefined);
});
