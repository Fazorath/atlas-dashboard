/* One reading of "is this card's upstream actually working", shared by every
   card so the Today grid and the Sources strip can never disagree.

   A source that isn't registered yet is `idle`, not broken — the card
   keeps its shape and colour and says what would switch it on. */

import { useQuery } from "@tanstack/react-query";

import { getSyncStatus, type SourceStatus } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export type SourceState = "loading" | "ready" | "setup" | "error" | "idle";

/** Registry keys, matching the API routers that fill them. */
export const SOURCE = {
  weather: "weather",
  finance: "finance",
  listening: "listening",
  habits: "habits",
  school: "school",
  sleep: "sleep",
} as const;

export type SourceName = (typeof SOURCE)[keyof typeof SOURCE];

/** What each Source is called on screen — the upstream, not the registry key. */
export const SOURCE_LABEL: Record<string, string> = {
  weather: "Open-Meteo",
  finance: "Securo",
  listening: "Audiobookshelf",
  school: "Canvas",
  sleep: "Google Health",
};

/** Custom modules' names, by Status entry (`custom:<id>`); lib/custom fills it. */
export const CUSTOM_LABEL: Record<string, string> = {};

export function sourceLabel(name: string): string {
  return SOURCE_LABEL[name] ?? CUSTOM_LABEL[name] ?? name;
}

export interface Sources {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  all: SourceStatus[];
  stateOf: (name: string) => SourceState;
  statusOf: (name: string) => SourceStatus | undefined;
}

export function useSources(): Sources {
  const query = useQuery({
    queryKey: ["sync", "status"],
    queryFn: getSyncStatus,
    refetchInterval: 60_000,
  });

  const all = query.data ?? [];
  const bySource = new Map(all.map((s) => [s.source, s]));

  const stateOf = (name: string): SourceState => {
    if (query.isPending) return "loading";
    // The API answered and never mentioned this source: nothing owns it yet.
    if (query.isError) return "idle";

    const status = bySource.get(name);
    if (!status) return "idle";
    if (!status.configured) return "setup";
    if (status.last_run?.status === "failed") return "error";
    return "ready";
  };

  return {
    isPending: query.isPending,
    isError: query.isError,
    isFetching: query.isFetching,
    all,
    stateOf,
    statusOf: (name) => bySource.get(name),
  };
}

/** The words next to a source's name in the Sources strip.

    A live proxy is never "synced 4h ago": its runs store nothing, so quoting
    their age would describe a reachability probe as though it were data. Those
    sources say "live" while Securo answers and "unreachable" once a probe
    fails, which is the only thing their run history actually knows. */
export function freshnessLabel(status: SourceStatus): string {
  if (!status.configured) return "needs setup";
  const run = status.last_run;
  if (run?.status === "failed") return status.live ? "unreachable" : "sync failed";
  if (status.live) return "live";
  if (!run) return "never synced";
  if (run.status === "running") return "syncing";
  return timeAgo(run.finished_at ?? run.started_at) ?? "synced";
}

/** An Area header's Freshness: "checked 29m ago", or "live" for a Source read
    on every request. A failure or a missing setup says so instead. */
export function areaFreshness(status: SourceStatus): string {
  if (!status.configured) return "needs setup";
  const run = status.last_run;
  if (run?.status === "failed") return status.live ? "unreachable" : "sync failed";
  if (status.live) return "live";
  if (!run) return "not checked yet";
  if (run.status === "running") return "checking now";
  const ago = timeAgo(run.finished_at ?? run.started_at);
  return ago ? `checked ${ago}` : "checked";
}

export interface Problem {
  source: string;
  /** "Canvas sync failed" — short enough for Today's chip. */
  title: string;
  /** What went wrong, as the Source reported it. */
  detail: string | null;
}

/** Sources that need you to act: signed out, unreachable, misconfigured. The
    only plumbing fact Today ever shows. */
export function problemsOf(all: SourceStatus[]): Problem[] {
  return all.flatMap((status): Problem[] => {
    const label = sourceLabel(status.source);
    if (!status.configured) {
      return [{ source: status.source, title: `${label} needs setup`, detail: null }];
    }
    if (status.last_run?.status === "failed") {
      return [
        {
          source: status.source,
          title: status.live ? `${label} unreachable` : `${label} sync failed`,
          detail: status.last_run.error,
        },
      ];
    }
    return [];
  });
}

export function freshnessTone(status: SourceStatus): "live" | "setup" | "error" | "idle" {
  if (!status.configured) return "setup";
  if (status.last_run?.status === "failed") return "error";
  // Configured and not known-broken. For a live proxy that is the whole story;
  // an archive still has to have run at least once to count as live.
  if (status.live) return "live";
  if (!status.last_run) return "idle";
  return "live";
}

export { cardState } from "@/lib/card-state";
