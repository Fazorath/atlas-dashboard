/** The failed photo send to show on the Work screen, from the mutation cache's
 *  states for the send. Only the newest send counts, so a later success or a
 *  send in progress hides an older failure; `dismissedAt` is the `submittedAt`
 *  of a failure already waved off. */
export function latestSendFailure(
  sends: { status: string; submittedAt: number; error: Error | null }[],
  dismissedAt: number,
): Error | null {
  const newest = sends.reduce<(typeof sends)[number] | null>(
    (a, s) => (!a || s.submittedAt > a.submittedAt ? s : a),
    null,
  );
  if (!newest || newest.status !== "error" || newest.submittedAt === dismissedAt) return null;
  return newest.error;
}
