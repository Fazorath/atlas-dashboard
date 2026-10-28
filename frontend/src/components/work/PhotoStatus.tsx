/* Where a Schedule photo read (ADR 0006) tells you how it went: under the
   Work header. Reading → "Reading schedule…"; done → "Schedule for Mar 2 –
   8 is ready to check" (and says so when the paper's dates weren't read and
   it took the week you had open), which opens Edit week on that week; failed
   → the reason, with a dismiss. Your own to-do, so never Today's Problem chip. */

import { Camera, X } from "lucide-react";
import { Link } from "react-router-dom";

import { editLink, useDiscardRead, usePhotoReads, useSendFailure, weekRange } from "@/lib/work";

export function PhotoStatus() {
  const reads = usePhotoReads();
  const discard = useDiscardRead();
  const sendFailure = useSendFailure();
  const list = reads.data ?? [];
  const reading = list.find((r) => r.status === "reading");
  const failed = list.find((r) => r.status === "failed");
  const ready = list.filter((r) => r.status === "ready" && r.week_start);

  if (!reading && !failed && !ready.length && !sendFailure.error) return null;
  const line = "flex items-center gap-2 rounded-row bg-surface-2 px-3 py-2 text-[13px]";

  return (
    <div data-accent="work" className="flex flex-col gap-1.5" aria-live="polite">
      {reading ? (
        <p className={line}>
          <Camera aria-hidden strokeWidth={2.2} className="size-4 shrink-0 animate-pulse text-accent" />
          Reading schedule… it takes a couple of minutes, no need to wait here.
        </p>
      ) : null}
      {ready.map((r) => (
        <Link key={r.id} to={editLink(r.week_start!)} className={`${line} pressable`}>
          <Camera aria-hidden strokeWidth={2.2} className="size-4 shrink-0 text-accent" />
          <span>
            Schedule for <span className="font-semibold">{weekRange(r.week_start!)}</span> is ready to check
            {r.week_guessed ? (
              <span className="text-fg-muted"> — its dates couldn&rsquo;t be read, so check the week</span>
            ) : null}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-accent">Check →</span>
        </Link>
      ))}
      {sendFailure.error ? (
        <p className={line}>
          <Camera aria-hidden strokeWidth={2.2} className="size-4 shrink-0 text-due" />
          <span>
            Couldn&rsquo;t send the photo. <span className="text-fg-muted">{sendFailure.error.message}</span>
          </span>
          <button
            type="button"
            onClick={sendFailure.dismiss}
            aria-label="Dismiss"
            className="pressable ml-auto rounded-row p-1 text-fg-muted"
          >
            <X aria-hidden strokeWidth={2.2} className="size-4" />
          </button>
        </p>
      ) : null}
      {failed ? (
        <p className={line}>
          <Camera aria-hidden strokeWidth={2.2} className="size-4 shrink-0 text-due" />
          <span>
            Couldn&rsquo;t read the schedule. <span className="text-fg-muted">{failed.error}</span>
          </span>
          <button
            type="button"
            onClick={() => discard.mutate(failed.id)}
            aria-label="Dismiss"
            className="pressable ml-auto rounded-row p-1 text-fg-muted"
          >
            <X aria-hidden strokeWidth={2.2} className="size-4" />
          </button>
        </p>
      ) : null}
      {discard.isError ? (
        <p className={`${line} text-due`} role="alert">
          Couldn&rsquo;t dismiss it — {discard.error.message}
        </p>
      ) : null}
    </div>
  );
}
