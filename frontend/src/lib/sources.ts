/* One reading of "is this card's upstream actually working", shared by every
   card so the Today grid and the Sources strip can never disagree.

   A source that no phase has registered yet is `idle`, not broken — the card
   keeps its shape and colour and says what would switch it on. */

import { useQuery } from "@tanstack/react-query";

import { getSyncStatus, type SourceStatus } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export type SourceState = "loading" | "ready" | "setup" | "error" | "idle";

/** Registry keys, matching the API routers each phase fills in. */
export const SOURCE = {
  weather: "weather",
  finance: "finance",
  listening: "listening",
  habits: "habits",
  school: "school",
  sleep: "sleep",
} as const;

export type SourceName = (typeof SOURCE)[keyof typeof SOURCE];

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
    // The API answered and never mentioned this source: no phase owns it yet.
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

export function freshnessTone(status: SourceStatus): "live" | "setup" | "error" | "idle" {
  if (!status.configured) return "setup";
  if (status.last_run?.status === "failed") return "error";
  // Configured and not known-broken. For a live proxy that is the whole story;
  // an archive still has to have run at least once to count as live.
  if (status.live) return "live";
  if (!status.last_run) return "idle";
  return "live";
}

/** What a card shows, given the Sources strip's view and the card's own read.

    The card's response body is current and the strip's last run may be an
    hour old, so the body wins wherever they disagree. The two kinds of source
    differ only once everything has answered:

    - `archive` (weather, school, sleep): a failed *sync* keeps the last good
      data on screen under the strip's error, so the strip's state passes
      through. Only a failed read of Atlas's own API has nothing to show.
    - `live` (finance, listening): the last reachability probe can be fifteen
      minutes old, and a probe that failed while the upstream restarted must
      not hold a working card in the error state — an answered read is ready. */
export function cardState(
  sourceState: SourceState,
  query: { data?: { configured: boolean }; isPending: boolean; isError: boolean },
  kind: "archive" | "live",
): SourceState {
  if (query.data && !query.data.configured) return "setup";
  if (sourceState === "setup" || sourceState === "idle") return sourceState;
  if (query.isPending) return "loading";
  if (query.isError) return "error";
  if (kind === "live") return "ready";
  return sourceState === "loading" ? "ready" : sourceState;
}
