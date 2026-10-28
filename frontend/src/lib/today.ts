/* "Today" in the zone atlas.yaml names, not the device's. The server caps habit
   days at its own today, so a phone ahead of that zone must not send tomorrow. */

/** The entry whose `date` is today in `timeZone` at instant `now`. */
export function entryForToday<T extends { date: string }>(
  entries: T[],
  timeZone: string | null | undefined,
  now: Date = new Date(),
): T | undefined {
  const today = dateInZone(timeZone, now);
  return entries.find((e) => e.date === today);
}

/** YYYY-MM-DD for the instant `now` in IANA zone `timeZone`. Falls back to the
 *  device's own date when the zone is missing or not a real one. */
export function dateInZone(timeZone: string | null | undefined, now: Date = new Date()): string {
  if (timeZone) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      /* unknown zone: use the device date */
    }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The hour (0-23) of the instant `at` in `timeZone`; the device's hour when
 *  the zone is missing or not a real one. */
export function hourInZone(timeZone: string | null | undefined, at: Date = new Date()): number {
  if (timeZone) {
    try {
      const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
        .formatToParts(at)
        .find((p) => p.type === "hour");
      if (h) return Number(h.value) % 24;
    } catch {
      /* unknown zone: use the device hour */
    }
  }
  return at.getHours();
}

/** toLocaleDateString for the instant `at` as read in `timeZone`; the device
 *  zone when it is missing or not a real one. */
export function formatDateInZone(
  timeZone: string | null | undefined,
  at: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  if (timeZone) {
    try {
      return at.toLocaleDateString(undefined, { ...options, timeZone });
    } catch {
      /* unknown zone: use the device zone */
    }
  }
  return at.toLocaleDateString(undefined, options);
}

/** The Monday (YYYY-MM-DD) on or before the calendar day `date`. Pure
 *  calendar arithmetic, so no zone is involved. */
export function mondayOnOrBefore(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/** `date` (YYYY-MM-DD) moved by `days` calendar days. */
export function addDaysTo(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
