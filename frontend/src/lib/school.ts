/* The school seam — Phase 6.

   Canvas is archived, like weather: the cards read Atlas's own `assignments`
   table, so a failed feed sync costs freshness and not the list. What Canvas
   can't say — whether you did it — is your tick, stored apart from anything the
   sync writes, so a resync never unticks you.

   Every key starts with "school", so one invalidate after a tick refreshes the
   Today card, the School screen and its past list together. All date wording
   lives here, so "Tomorrow, 11:59 PM" can't be phrased two ways. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { localDate, parseLocalDate } from "@/lib/habits";

export interface Assignment {
  ics_uid: string;
  title: string;
  /** Your short label (CANVAS_COURSE_LABELS), or Canvas's name if none matches. */
  course: string | null;
  /** Canvas's full course name — the tooltip on a short label. */
  course_full: string | null;
  /** UTC instant. For `all_day` it is 23:59 local — Canvas publishes a bare
   *  date for anything due at 11:59pm. */
  due_at: string;
  all_day: boolean;
  /** The assignment's own page in Canvas. */
  url: string | null;
  done: boolean;
  done_at: string | null;
  /** Past due and not ticked. */
  overdue: boolean;
}

export interface SchoolSummary {
  configured: boolean;
  detail: string | null;
  /** Unticked, due in the last week, oldest first. */
  overdue: Assignment[];
  /** Due from now to the end of the window, done or not, soonest first. */
  upcoming: Assignment[];
  /** Today plus the next six days, done or not — the Today ring. */
  week_total: number;
  week_done: number;
  fetched_at: string | null;
}

export const SCHOOL_KEY = ["school"] as const;

/* The feed syncs hourly, so polling any faster only re-reads the same rows.
   Ticks don't wait on this: they invalidate straight away. */
const REFETCH_MS = 5 * 60_000;

export function useSchool(days = 7) {
  const query = useQuery({
    queryKey: ["school", "summary", days],
    queryFn: () => api<SchoolSummary>(`/school/?days=${days}`),
    refetchInterval: REFETCH_MS,
  });
  return { isPending: query.isPending, isError: query.isError, data: query.data };
}

export function usePastAssignments(days = 30) {
  return useQuery({
    queryKey: ["school", "past", days],
    queryFn: () => api<Assignment[]>(`/school/past?days=${days}`),
  });
}

export function useToggleAssignment() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (uid: string) =>
      api<Assignment>(`/school/${encodeURIComponent(uid)}/toggle`, { method: "POST" }),

    // Optimistic across every cached school list: the check fills under your
    // finger on whichever screen you tapped, and the other one agrees.
    onMutate: async (uid) => {
      await client.cancelQueries({ queryKey: SCHOOL_KEY });
      const snapshot = client.getQueriesData({ queryKey: SCHOOL_KEY });
      const now = Date.now();

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

      client.setQueriesData<SchoolSummary | Assignment[]>({ queryKey: SCHOOL_KEY }, (data) => {
        if (!data) return data;
        if (Array.isArray(data)) return data.map(flip);

        const upcoming = data.upcoming.map(flip);
        const was = [...data.upcoming, ...data.overdue].find((a) => a.ics_uid === uid);
        const weekDelta = was && isThisWeek(was.due_at) ? (was.done ? -1 : 1) : 0;
        // Overdue rows stay put while ticked, so the row you just hit doesn't
        // jump out from under you; the refetch below tidies them away.
        return {
          ...data,
          overdue: data.overdue.map(flip),
          upcoming,
          week_done: data.week_done + weekDelta,
        };
      });

      return { snapshot };
    },

    onError: (_error, _uid, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
    },

    onSettled: () => client.invalidateQueries({ queryKey: SCHOOL_KEY }),
  });
}

function isThisWeek(iso: string): boolean {
  const start = parseLocalDate(localDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** Whole local days from today to the day `iso` falls on. 0 is today. */
export function daysFromToday(iso: string, now = new Date()): number {
  const day = parseLocalDate(localDate(new Date(iso)));
  const today = parseLocalDate(localDate(now));
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

/** "Today" / "Tomorrow" / "Thursday" / "Oct 4" — the day part of a due line. */
export function dayLabel(iso: string, now = new Date()): string {
  const diff = daysFromToday(iso, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = new Date(iso);
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "11:59 PM", or "End of day" when Canvas gave only a date. */
export function timeLabel(a: Pick<Assignment, "due_at" | "all_day">): string {
  if (a.all_day) return "End of day";
  return new Date(a.due_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Tomorrow, 11:59 PM" — both parts, for a row with no day heading above it. */
export function dueLine(a: Assignment, now = new Date()): string {
  return `${dayLabel(a.due_at, now)}, ${timeLabel(a)}`;
}

/** "2 days late" / "5 hours late" — how an overdue row reads. */
export function lateLabel(iso: string, now = new Date()): string {
  const hours = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${Math.floor(hours)}h late`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

/** Soonest-first rows grouped under their local day. */
export function groupByDay(items: Assignment[]): { key: string; label: string; items: Assignment[] }[] {
  const groups = new Map<string, Assignment[]>();
  for (const a of items) {
    const key = localDate(new Date(a.due_at));
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: dayLabel(rows[0].due_at),
    items: rows,
  }));
}
