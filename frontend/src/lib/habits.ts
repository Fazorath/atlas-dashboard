/* The habits seam.

   Every key starts with "habits", so one invalidate after any write refreshes
   the day lists and the week's history together. Today's ring and the Habits screen
   read the same ["habits", "day", today] entry, so a tick on either moves both
   without either knowing about the other.

   Dates are calendar days as YYYY-MM-DD. "Today" is the day in atlas.yaml's
   timezone (the server's rule), falling back to the device's until the config
   is loaded. Never build one with toISOString(): that is the UTC date, which
   in US Eastern flips to tomorrow at 8pm and would file an evening's tick
   under the wrong day. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { currentTimezone } from "@/lib/config";
import { dateInZone } from "@/lib/today";

export interface Habit {
  id: number;
  name: string;
  icon: string | null;
  /** The day this row describes — whatever `date` was asked for. */
  date: string;
  done: boolean;
  /** Streak figures always answer for today, whichever day is on screen. A
   *  streak ending yesterday still counts until today is over. */
  current_streak: number;
  longest_streak: number;
  /** 0–1, over the last 30 days or since the habit began if that's sooner. */
  completion_30d: number;
  /** Measured habits only (ADR 0001): the linked Health figure, its target,
   *  and the figure on `date` — null when the Source has nothing yet. */
  metric: string | null;
  target: number | null;
  value: number | null;
  /** The tick came from the data rather than your hand. */
  auto: boolean;
}

export interface Metric {
  key: string;
  label: string;
  unit: string;
  default_target: number;
}

export interface HabitDefinition {
  id: number;
  name: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
  archived_at: string | null;
  metric: string | null;
  target: number | null;
}

export interface HistoryDay {
  date: string;
  done: number;
  /** Habits that existed and weren't archived on that day. */
  total: number;
}

export const HABITS_KEY = ["habits"] as const;
const dayKey = (date: string) => ["habits", "day", date] as const;

/** YYYY-MM-DD for a Date's local fields. With no argument: today in the
 *  configured timezone. */
export function localDate(d?: Date): string {
  if (!d) return dateInZone(currentTimezone());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD of the instant `at` in the configured timezone. Use this for
 *  "what day is it now" and "what day does this timestamp fall on". Plain
 *  `localDate(d)` reads the device's fields, which is right only for a Date
 *  built from a calendar day (parseLocalDate, addDays). */
export function zonedDate(at: Date = new Date()): string {
  return dateInZone(currentTimezone(), at);
}

/** Local midnight of today's date in the configured timezone, for code that
 *  does calendar arithmetic with Date fields (week starts, ranges). */
export function todayStart(at: Date = new Date()): Date {
  return parseLocalDate(zonedDate(at));
}

/** Parse YYYY-MM-DD as local midnight (Date("2026-09-22") would be UTC). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function useHabits(date: string = localDate()) {
  const query = useQuery({
    queryKey: dayKey(date),
    queryFn: () => api<Habit[]>(`/habits/today?date=${date}`),
  });

  const habits = query.data ?? [];
  const done = habits.filter((h) => h.done).length;

  return {
    isPending: query.isPending,
    isError: query.isError,
    /** The API answered. An empty list is still configured — it means "add one". */
    configured: query.isSuccess,
    habits,
    done,
    total: habits.length,
    remaining: habits.length - done,
    bestStreak: habits.reduce((best, h) => Math.max(best, h.longest_streak), 0),
  };
}

export function useHabitHistory(days: number) {
  return useQuery({
    queryKey: ["habits", "history", days],
    queryFn: () => api<HistoryDay[]>(`/habits/history?days=${days}`),
  });
}

export function useToggleHabit() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      api<Habit>(`/habits/${id}/toggle?date=${date}`, { method: "POST" }),

    // Optimistic: the check fills under your finger. For today the streak is
    // predictable (it grows or shrinks by one) so that moves too; for a past
    // day it depends on the neighbours, so it waits for the server's answer.
    onMutate: async ({ id, date }) => {
      const key = dayKey(date);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Habit[]>(key);
      const isToday = date === localDate();

      client.setQueryData<Habit[]>(key, (current) =>
        current?.map((h) => {
          if (h.id !== id) return h;
          const done = !h.done;
          if (!isToday) return { ...h, done };
          const current_streak = done ? h.current_streak + 1 : Math.max(0, h.current_streak - 1);
          return {
            ...h,
            done,
            current_streak,
            longest_streak: Math.max(h.longest_streak, current_streak),
          };
        }),
      );

      return { key, previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous);
    },

    onSettled: () => client.invalidateQueries({ queryKey: HABITS_KEY }),
  });
}

function useHabitWrite<Vars>(fn: (vars: Vars) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: HABITS_KEY }),
  });
}

export function useCreateHabit() {
  return useHabitWrite((body: { name: string; icon?: string }) =>
    api<HabitDefinition>("/habits/", { method: "POST", body: JSON.stringify(body) }),
  );
}

export function useUpdateHabit() {
  return useHabitWrite(
    ({
      id,
      ...patch
    }: {
      id: number;
      name?: string;
      icon?: string | null;
      archived?: boolean;
      sort_order?: number;
      metric?: string | null;
      target?: number;
    }) => api<HabitDefinition>(`/habits/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  );
}

/** The Health figures a habit can be linked to. They never change at runtime. */
export function useMetrics() {
  return useQuery({
    queryKey: ["habits", "metrics"],
    queryFn: () => api<Metric[]>("/habits/metrics"),
    staleTime: Infinity,
  });
}

/** "6h 30m of 8h" / "7,412 of 10,000 steps" — a Measured habit's figure. */
export function measuredLine(habit: Pick<Habit, "metric" | "target" | "value">): string | null {
  if (!habit.metric || habit.target == null) return null;
  const fmt = (v: number) => {
    if (habit.metric === "sleep_hours") {
      const m = Math.round(v * 60);
      return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
    }
    return Math.round(v).toLocaleString();
  };
  const target =
    habit.metric === "sleep_hours"
      ? `${habit.target}h`
      : `${habit.target.toLocaleString()}${habit.metric === "steps" ? " steps" : " min"}`;
  return habit.value == null ? `No data yet · goal ${target}` : `${fmt(habit.value)} of ${target}`;
}
