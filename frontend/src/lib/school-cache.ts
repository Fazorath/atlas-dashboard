/* The optimistic tick, as a pure function over one cached ["school", …] entry.

   The School cache holds more than assignment lists: the study plan lives under
   ["school", "study", days] and is a different shape. The updater therefore
   picks by key and hands back anything it doesn't know untouched — the study
   plan is just refetched by the invalidate after the tick. */

import type { Assignment, SchoolSummary } from "./school.ts";

export function tickCacheEntry(
  key: readonly unknown[],
  data: unknown,
  uid: string,
  now: number,
  inWeek: (iso: string) => boolean,
): unknown {
  if (!data) return data;

  const flip = (a: Assignment): Assignment => {
    if (a.ics_uid !== uid) return a;
    const done = !a.done;
    return {
      ...a,
      done,
      done_at: done ? new Date(now).toISOString() : null,
      overdue: !done && new Date(a.due_at).getTime() < now,
    };
  };

  if (key[1] === "past") return Array.isArray(data) ? data.map(flip) : data;

  if (key[1] === "summary") {
    const s = data as SchoolSummary;
    if (!Array.isArray(s.upcoming) || !Array.isArray(s.overdue)) return data;
    const was = [...s.upcoming, ...s.overdue].find((a) => a.ics_uid === uid);
    const weekDelta = was && inWeek(was.due_at) ? (was.done ? -1 : 1) : 0;
    // Overdue rows stay put while ticked, so the row you just hit doesn't
    // jump out from under you; the refetch tidies them away.
    return {
      ...s,
      overdue: s.overdue.map(flip),
      upcoming: s.upcoming.map(flip),
      week_done: s.week_done + weekDelta,
    };
  }

  return data;
}
