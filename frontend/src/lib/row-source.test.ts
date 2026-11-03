// Run with: node --test src/lib/row-source.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { bannerDraft, copied, fromDraft, saveDraftId, SAVED } from "./row-source.ts";

test("saved rows: no banner, nothing to delete on Save", () => {
  assert.equal(bannerDraft(SAVED), null);
  assert.equal(saveDraftId(SAVED), null);
});

test("draft rows: banner shows and Save deletes that draft", () => {
  const s = fromDraft({ id: 4, week_guessed: true });
  assert.deepEqual(bannerDraft(s), { id: 4, week_guessed: true });
  assert.equal(saveDraftId(s), 4);
});

test("copy over a draft: no banner, Save still deletes the replaced draft", () => {
  const s = copied(fromDraft({ id: 4, week_guessed: false }));
  assert.equal(bannerDraft(s), null);
  assert.equal(saveDraftId(s), 4);
});

test("copy over saved rows replaces nothing", () => {
  assert.equal(saveDraftId(copied(SAVED)), null);
});

test("copying twice keeps remembering the first replaced draft", () => {
  assert.equal(saveDraftId(copied(copied(fromDraft({ id: 4, week_guessed: false })))), 4);
});

test("copy while a draft is offered but not loaded replaces the offered one", () => {
  assert.equal(saveDraftId(copied(SAVED, 6)), 6);
  assert.equal(saveDraftId(copied(fromDraft({ id: 4, week_guessed: false }), 6)), 4);
});

test("loading a draft after a copy takes over", () => {
  const s = fromDraft({ id: 9, week_guessed: false });
  assert.equal(saveDraftId(s), 9);
  assert.equal(bannerDraft(s)?.id, 9);
});
