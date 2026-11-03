// Run with: node --test src/lib/habit-icon.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { firstGrapheme } from "./habit-icon.ts";

test("blank input is no icon", () => {
  assert.equal(firstGrapheme(""), "");
  assert.equal(firstGrapheme("   "), "");
});

test("a single emoji comes back whole, multi-code-point ones included", () => {
  for (const icon of ["📖", "🇵🇷", "👍🏽", "👨‍👩‍👧‍👦", "R"]) assert.equal(firstGrapheme(icon), icon);
});

test("more than one symbol keeps only the first", () => {
  assert.equal(firstGrapheme("📖🏃"), "📖");
  assert.equal(firstGrapheme("abc"), "a");
  assert.equal(firstGrapheme("🇵🇷🇺🇸"), "🇵🇷");
});

test("leading spaces are ignored", () => {
  assert.equal(firstGrapheme("  💧"), "💧");
});
