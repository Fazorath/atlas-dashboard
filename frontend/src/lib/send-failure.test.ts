// Run with: node --test src/lib/send-failure.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { latestSendFailure } from "./send-failure.ts";

const m = (status: string, submittedAt: number, message = "boom") => ({
  status,
  submittedAt,
  error: status === "error" ? new Error(message) : null,
});

test("nothing sent, nothing to show", () => {
  assert.equal(latestSendFailure([], 0), null);
});

test("shows the newest send when it failed", () => {
  assert.equal(latestSendFailure([m("error", 1, "old"), m("error", 5, "new")], 0)?.message, "new");
});

test("a later success or pending send hides an older failure", () => {
  assert.equal(latestSendFailure([m("error", 1), m("success", 2)], 0), null);
  assert.equal(latestSendFailure([m("error", 1), m("pending", 2)], 0), null);
});

test("a dismissed failure stays hidden", () => {
  assert.equal(latestSendFailure([m("error", 3)], 3), null);
  assert.equal(latestSendFailure([m("error", 3), m("error", 4)], 3)?.message, "boom");
});
