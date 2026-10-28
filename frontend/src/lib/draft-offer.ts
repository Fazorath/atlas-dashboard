/* Edit week fills its form once per week shown. A Draft week that finishes
   while the sheet is open (or a retake that replaces the one on screen) is
   offered rather than loaded, so rows you've typed are never overwritten. */

interface ReadLike {
  id: number;
  status: string;
  week_start: string | null;
}

/** The ready Draft week to offer for `weekStart`, or undefined. It is offered
    when it isn't the one the rows were based on (`basedOn`, null for none) and
    wasn't already dismissed. */
export function draftToOffer<T extends ReadLike>(
  reads: T[] | undefined,
  weekStart: string,
  basedOn: number | null,
  dismissed: number | null,
): T | undefined {
  const draft = reads?.find((r) => r.status === "ready" && r.week_start === weekStart);
  if (!draft || draft.id === basedOn || draft.id === dismissed) return undefined;
  return draft;
}
