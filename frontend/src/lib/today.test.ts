// Run with: node --test src/lib/today.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDaysTo, dateInZone, entryForToday, formatDateInZone, hourInZone, mondayOnOrBefore } from "./today.ts";

// 00:30 in Berlin on 2026-10-23 is 18:30 on 2026-10-22 in New York (EDT).
const berlinJustAfterMidnight = new Date("2026-10-22T22:30:00Z");

test("uses the configured zone, not the device's", () => {
  assert.equal(dateInZone("America/New_York", berlinJustAfterMidnight), "2026-10-22");
  assert.equal(dateInZone("Europe/Berlin", berlinJustAfterMidnight), "2026-10-23");
});

test("falls back to the device date without a usable zone", () => {
  const d = new Date(2026, 9, 23, 0, 30);
  assert.equal(dateInZone(null, d), "2026-10-23");
  assert.equal(dateInZone("", d), "2026-10-23");
  assert.equal(dateInZone("Not/AZone", d), "2026-10-23");
});

test("Work's day pick follows the configured zone when the device zone differs", () => {
  // A phone still on New York time (Oct 22) while atlas.yaml says Berlin (Oct 23).
  const shifts = [
    { date: "2026-10-22", start: "09:00" },
    { date: "2026-10-23", start: "12:00" },
  ];
  assert.equal(entryForToday(shifts, "Europe/Berlin", berlinJustAfterMidnight)?.start, "12:00");
  assert.equal(entryForToday(shifts, "America/New_York", berlinJustAfterMidnight)?.start, "09:00");
  assert.equal(entryForToday(shifts, "Europe/Berlin", new Date("2026-10-24T10:00:00Z")), undefined);
});

test("hourInZone reads the hour in the configured zone", () => {
  // 22:30Z is 18:30 in New York (EDT) and 00:30 in Berlin (CEST).
  assert.equal(hourInZone("America/New_York", berlinJustAfterMidnight), 18);
  assert.equal(hourInZone("Europe/Berlin", berlinJustAfterMidnight), 0);
  assert.equal(hourInZone("Not/AZone", new Date(2026, 9, 23, 9, 5)), 9);
});

test("formatDateInZone names the day in the configured zone", () => {
  const opts = { weekday: "short", month: "short", day: "numeric" } as const;
  assert.match(formatDateInZone("America/New_York", berlinJustAfterMidnight, opts), /Thu.*Oct 22|Oct 22/);
  assert.match(formatDateInZone("Europe/Berlin", berlinJustAfterMidnight, opts), /Oct 23/);
});

test("mondayOnOrBefore and addDaysTo are calendar arithmetic", () => {
  assert.equal(mondayOnOrBefore("2026-10-22"), "2026-10-19"); // a Thursday
  assert.equal(mondayOnOrBefore("2026-10-19"), "2026-10-19");
  assert.equal(mondayOnOrBefore("2026-10-25"), "2026-10-19"); // a Sunday
  assert.equal(addDaysTo("2026-10-19", -7), "2026-10-12");
  assert.equal(addDaysTo("2026-10-30", 3), "2026-11-02");
});
