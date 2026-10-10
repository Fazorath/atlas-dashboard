/* The sleep seam — Phase 7. Fitbit, through the Google Health API.

   Archived, like weather and school: the screens read Atlas's own tables, so an
   expired Google sign-in costs freshness and not the card. What is new here is
   the connection itself — Google's Testing-status apps hand out sign-ins that
   die seven days after consent — so `connection` is part of every read, and
   the reconnect prompt is driven from it rather than from a failed sync alone.

   Every key starts with "sleep", so one invalidate after connecting refreshes
   the Today cards and the Sleep screen together. All duration wording lives
   here, so "7h 12m" can't be phrased two ways. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { localDate, parseLocalDate } from "@/lib/habits";

export type ConnectionState = "setup" | "disconnected" | "connected" | "expired";

export interface Connection {
  state: ConnectionState;
  connected_at: string | null;
  /** When Google stops honouring the sign-in — 7 days after consent while the
   *  OAuth app is in Testing. Null if Google never said. */
  reconnect_by: string | null;
  reason: string | null;
  /** The redirect URI is a localhost one: the address the browser lands on
   *  after consent has to be pasted back in. */
  paste_back: boolean;
}

export type StageKind = "DEEP" | "LIGHT" | "REM" | "AWAKE" | "ASLEEP" | "RESTLESS";

export interface Stage {
  start: string;
  end: string;
  stage: StageKind | string;
}

export interface Night {
  id: string;
  /** Local date you woke up — Fitbit files a night under the morning. */
  date: string;
  start_at: string;
  end_at: string;
  sleep_type: "STAGES" | "CLASSIC" | string;
  processed: boolean;
  minutes_asleep: number | null;
  minutes_awake: number | null;
  minutes_in_period: number | null;
  /** 0–1. */
  efficiency: number | null;
  deep_minutes: number | null;
  light_minutes: number | null;
  rem_minutes: number | null;
  wake_minutes: number | null;
  device: string | null;
  stages: Stage[];
}

export interface Activity {
  date: string;
  steps: number | null;
  resting_hr: number | null;
  active_minutes: number | null;
  light_minutes: number | null;
  calories_kcal: number | null;
}

export interface SleepSummary {
  configured: boolean;
  connection: Connection;
  detail: string | null;
  last_night: Night | null;
  nights: Night[];
  avg_minutes_asleep: number | null;
  avg_efficiency: number | null;
  activity: Activity | null;
  activity_days: Activity[];
  fetched_at: string | null;
}

export const SLEEP_KEY = ["sleep"] as const;

/** The ring's full circle. Eight hours is the usual adult target; a night over
 *  it fills the ring rather than lapping it. */
export const SLEEP_GOAL_MIN = 8 * 60;

/* The archive syncs hourly, so polling faster only re-reads the same rows. */
const REFETCH_MS = 5 * 60_000;

export function useSleep(days = 7) {
  const query = useQuery({
    queryKey: ["sleep", "summary", days],
    queryFn: () => api<SleepSummary>(`/sleep/?days=${days}`),
    refetchInterval: REFETCH_MS,
  });
  return { isPending: query.isPending, isError: query.isError, data: query.data };
}

/* --- Connecting -------------------------------------------------------- */

/** Ask the API for Google's consent URL. A localhost redirect can't come back
    to this page, so that flow opens Google in a new tab and leaves this one
    waiting for the pasted address; the tailnet redirect just navigates. */
export async function startConnect(pasteBack: boolean): Promise<void> {
  const { url } = await api<{ url: string }>("/sleep/connect");
  if (pasteBack) window.open(url, "_blank", "noopener");
  else window.location.assign(url);
}

export function useCompleteConnect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      api<Connection>("/sleep/oauth/complete", { method: "POST", body: JSON.stringify({ url }) }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: SLEEP_KEY });
      client.invalidateQueries({ queryKey: ["sync"] });
    },
  });
}

export function useDisconnect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<Connection>("/sleep/disconnect", { method: "POST" }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: SLEEP_KEY });
      client.invalidateQueries({ queryKey: ["sync"] });
    },
  });
}

/** Days until Google stops honouring the sign-in, or null if it never said. */
export function daysLeft(conn: Connection, now = new Date()): number | null {
  if (!conn.reconnect_by) return null;
  return (new Date(conn.reconnect_by).getTime() - now.getTime()) / 86_400_000;
}

/** Whether the dashboard should be asking for a click. Expired always; a live
    sign-in once it is inside its last two days, so the weekly reconnect can
    happen on your schedule rather than the morning the card goes stale. */
export function needsReconnect(conn: Connection | undefined): "expired" | "soon" | null {
  if (!conn) return null;
  if (conn.state === "expired") return "expired";
  const left = conn.state === "connected" ? daysLeft(conn) : null;
  return left !== null && left < 2 ? "soon" : null;
}

/** "Friday" / "tomorrow" / "today at 3:25 PM" — when the sign-in lapses. */
export function reconnectByLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const days = Math.round(
    (parseLocalDate(localDate(at)).getTime() - parseLocalDate(localDate(now)).getTime()) /
      86_400_000,
  );
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return at.toLocaleDateString(undefined, { weekday: "long" });
}

/* --- Wording ----------------------------------------------------------- */

/** "7h 12m" / "48m". A no-break space, so a duration never wraps in half
    beside a ring. */
export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h\u00a0${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** "10:48 PM" in local time. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatPercent(fraction: number | null | undefined): string | null {
  return fraction == null ? null : `${Math.round(fraction * 100)}%`;
}

/** "Last night" / "Yesterday" / "Thursday" — which night the hero shows. */
export function nightLabel(wakeDate: string, now = new Date()): string {
  const today = parseLocalDate(localDate(now));
  const diff = Math.round((today.getTime() - parseLocalDate(wakeDate).getTime()) / 86_400_000);
  if (diff <= 0) return "Last night";
  if (diff === 1) return "The night before";
  return `Night of ${parseLocalDate(wakeDate).toLocaleDateString(undefined, { weekday: "long" })}`;
}

export function formatCount(n: number | null | undefined): string | null {
  return n == null ? null : n.toLocaleString();
}

/* --- Stages ------------------------------------------------------------ */

export interface StageSpec {
  kind: "AWAKE" | "REM" | "LIGHT" | "DEEP";
  label: string;
  /** Tailwind fill / background classes, from the ordinal violet ramp. */
  fill: string;
  bg: string;
}

/** Top to bottom, as Fitbit draws its hypnogram: awake at the surface, deep at
    the floor. Colour steps with depth and so does the row. */
export const STAGES: StageSpec[] = [
  { kind: "AWAKE", label: "Awake", fill: "fill-stage-awake", bg: "bg-stage-awake" },
  { kind: "REM", label: "REM", fill: "fill-stage-rem", bg: "bg-stage-rem" },
  { kind: "LIGHT", label: "Light", fill: "fill-stage-light", bg: "bg-stage-light" },
  { kind: "DEEP", label: "Deep", fill: "fill-stage-deep", bg: "bg-stage-deep" },
];

/** A classic night (short or loosely worn) has no depth split: asleep draws as
    light, restless as awake, so it still reads on the same four rows. */
export function stageKind(stage: string): StageSpec["kind"] {
  if (stage === "ASLEEP") return "LIGHT";
  if (stage === "RESTLESS") return "AWAKE";
  return (["AWAKE", "REM", "LIGHT", "DEEP"] as const).find((k) => k === stage) ?? "LIGHT";
}

export function stageMinutes(night: Night): Record<StageSpec["kind"], number | null> {
  return {
    AWAKE: night.wake_minutes,
    REM: night.rem_minutes,
    LIGHT: night.light_minutes,
    DEEP: night.deep_minutes,
  };
}
