// Run with: node --test src/lib/card-state.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardState } from "./card-state.ts";

const answered = { data: { configured: true }, isPending: false, isError: false };

test("an archive keeps showing its data when the last sync failed", () => {
  assert.equal(cardState("error", answered, "archive"), "ready");
});

test("an archive with nothing to read still reports the failure", () => {
  const none = { isPending: false, isError: false };
  assert.equal(cardState("error", none, "archive"), "error");
});

test("a failed read of Atlas's own API is an error", () => {
  const failed = { isPending: false, isError: true };
  assert.equal(cardState("ready", failed, "archive"), "error");
});

test("a live source with an answered read is ready despite a failed probe", () => {
  assert.equal(cardState("error", answered, "live"), "ready");
});

test("setup and idle win over everything", () => {
  assert.equal(cardState("setup", answered, "archive"), "setup");
  assert.equal(cardState("idle", answered, "archive"), "idle");
});
