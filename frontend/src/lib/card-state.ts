import type { SourceState } from "./sources.ts";

/** What a card shows, given the Sources strip's view and the card's own read.

    The card's response body is current and the strip's last run may be an
    hour old, so the body wins wherever they disagree:

    - `archive` (weather, school, sleep): a failed *sync* keeps the last good
      data on screen — the strip carries the failure as Freshness. Only a card
      with no response to show falls back to the strip's error.
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
  if (sourceState === "loading") return "ready";
  if (sourceState === "error" && query.data) return "ready";
  return sourceState;
}
