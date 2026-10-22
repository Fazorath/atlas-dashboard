/* Work — the seam for /api/work, and how a shift reads.

   Days are local YYYY-MM-DD and times local "HH:MM" on that day, as the schedule
   schedule has them; shifts never cross midnight. A week someone saved is
   *entered*: an empty day in it is a day off. A week nobody saved is unknown,
   and the widgets say "not entered" rather than "off". */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { localDate, parseLocalDate } from "@/lib/habits";

export interface Shift {
  date: string;
  start: string;
  end: string;
  minutes: number;
}

export interface Week {
  week_start: string;
  entered: boolean;
  saved_at: string | null;
  shifts: Shift[];
  total_minutes: number;
}

export interface WorkSummary {
  today: string;
  this_week: Week;
  next_week: Week;
  /** The first shift on a day after today, from any entered week. */
  next_shift: Shift | null;
}

export interface ShiftIn {
  date: string;
  start: string;
  end: string;
}

/** Every Work query key starts here, so one invalidate refreshes them all. */
export const WORK_KEY = ["work"] as const;
const weekKey = (start: string) => ["work", "week", start] as const;

export function useWork() {
  return useQuery({ queryKey: [...WORK_KEY, "summary"], queryFn: () => api<WorkSummary>("/work/") });
}

/** One week by its Monday — shared by the sheet and its "Copy last week". */
export const weekQuery = (start: string) => ({
  queryKey: weekKey(start),
  queryFn: () => api<Week>(`/work/weeks/${start}`),
});

export function useWeek(start: string) {
  return useQuery(weekQuery(start));
}

export function useSaveWeek() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ start, shifts }: { start: string; shifts: ShiftIn[] }) =>
      api<Week>(`/work/weeks/${start}`, { method: "PUT", body: JSON.stringify({ shifts }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: WORK_KEY }),
  });
}

export function useClearWeek() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (start: string) => api<void>(`/work/weeks/${start}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: WORK_KEY }),
  });
}

/** The current time, re-read every `ms` so a countdown moves on its own. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/* --- Days ---------------------------------------------------------------- */

export function addDays(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** The Monday on or before `iso`: a week runs Monday to Sunday. */
export function mondayOf(iso: string = localDate()): string {
  const d = parseLocalDate(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

/** The week's seven local dates, Monday first. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekdayShort(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(undefined, { weekday: "short" });
}

/** "Oct 12 – 18", or "Sep 28 – Oct 4" across a month. */
export function weekRange(start: string): string {
  const a = parseLocalDate(start);
  const b = parseLocalDate(addDays(start, 6));
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()} – ${b.getDate()}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

/* --- Times --------------------------------------------------------------- */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** A shift's start or end as an instant on its day. */
export function at(date: string, hhmm: string): Date {
  const d = parseLocalDate(date);
  d.setMinutes(toMinutes(hhmm));
  return d;
}

/** "9" / "8:30" plus its meridiem, "a" or "p". */
function clock(hhmm: string): { text: string; mer: "a" | "p" } {
  const total = toMinutes(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: m ? `${h12}:${String(m).padStart(2, "0")}` : String(h12), mer: h < 12 ? "a" : "p" };
}

/** "12p", "9a", "8:30p" — one time, compact. */
export function compactTime(hhmm: string): string {
  const c = clock(hhmm);
  return c.text + c.mer;
}

/** "12–6p", "9a–5p": the start drops its meridiem when the end shares it. */
export function compactRange(start: string, end: string): string {
  const a = clock(start);
  const b = clock(end);
  return `${a.text}${a.mer === b.mer ? "" : a.mer}–${b.text}${b.mer}`;
}

/** 510 → "8.5h", 1860 → "31h", 465 → "7.75h". */
export function hoursLabel(minutes: number): string {
  return `${Number((minutes / 60).toFixed(2))}h`;
}

/** 260 → ["4", "h", "20", "m"] for `Units`; under an hour, just minutes. */
export function durationParts(minutes: number): (string | number)[] {
  const h = Math.floor(minutes / 60);
  const m = Math.max(0, Math.round(minutes % 60));
  return h > 0 ? [h, "h", String(m).padStart(2, "0"), "m"] : [m, "m"];
}

/** "in 3h", "in 3h 10m", "in 25m", or across days "in 1d 3h". */
export function untilShort(target: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return m ? `in ${h}h ${m}m` : `in ${h}h`;
  return `in ${m}m`;
}

/* --- What today is ------------------------------------------------------- */

export type Today =
  /** The current week was never saved. */
  | { kind: "unknown" }
  | { kind: "before"; shift: Shift; startsIn: string }
  | { kind: "on"; shift: Shift; leftMinutes: number; progress: number }
  | { kind: "done"; shift: Shift; next: Shift | null }
  | { kind: "off"; next: Shift | null };

export function todayOf(work: WorkSummary, now: Date): Today {
  const today = localDate(now);
  if (!work.this_week.entered) return { kind: "unknown" };
  const shift = work.this_week.shifts.find((s) => s.date === today);
  if (!shift) return { kind: "off", next: work.next_shift };
  const start = at(shift.date, shift.start);
  const end = at(shift.date, shift.end);
  if (now < start) return { kind: "before", shift, startsIn: untilShort(start, now) };
  if (now < end) {
    const left = (end.getTime() - now.getTime()) / 60_000;
    return { kind: "on", shift, leftMinutes: left, progress: 1 - left / shift.minutes };
  }
  return { kind: "done", shift, next: work.next_shift };
}

/** "Wed 12–6p": the next shift, named by its weekday. */
export function nextLine(s: Shift): string {
  return `${weekdayShort(s.date)} ${compactRange(s.start, s.end)}`;
}

/** Where a "not entered" tap goes: the Work screen with that week's sheet open. */
export function editLink(weekStart: string): string {
  return `/work?edit=${weekStart}`;
}
