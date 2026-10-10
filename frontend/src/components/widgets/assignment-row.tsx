/* One assignment: a tick, what it is, and when it's due.

   The whole left side is the tick target, like a habit row — the thumb lands on
   the title more often than on a 30px circle. The Canvas link is its own
   button on the right, so opening an assignment can never tick it.

   Overdue is said in words ("2 days late") on a coral badge, not by colour
   alone; done rows dim and strike through but stay in place until the next
   refetch, so the row you just hit doesn't jump out from under your finger. */

import { Check, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/chip";
import { daysFromToday, dueLine, lateLabel, timeLabel, type Assignment } from "@/lib/school";
import { cn } from "@/lib/utils";

export function AssignmentRow({
  assignment: a,
  onToggle,
  /** Under a day heading the day is already said; show only the time. */
  timeOnly = false,
  compact = false,
  disabled = false,
  /** False for history: an old row you never ticked was most likely handed
   *  in, so "8 days late" there reads as an alarm it hasn't earned. Lateness
   *  is the Overdue card's job. */
  showLate = true,
}: {
  assignment: Assignment;
  onToggle: () => void;
  timeOnly?: boolean;
  compact?: boolean;
  disabled?: boolean;
  showLate?: boolean;
}) {
  const when = timeOnly ? timeLabel(a) : dueLine(a);
  const late = showLate && a.overdue;
  const soon = !a.done && !a.overdue && daysFromToday(a.due_at) <= 1;
  const flag = late
    ? lateLabel(a.due_at)
    : soon
      ? daysFromToday(a.due_at) === 0
        ? "Today"
        : "Tomorrow"
      : null;
  // A narrow tile can't spare a badge's width beside the title, so compact rows
  // say the flag in coral at the head of the meta line instead — and a flagged
  // row's day is already in the flag, so only the time follows it.
  const meta = [a.course, compact && flag ? timeLabel(a) : when].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-row bg-surface-2",
        compact ? "pr-3" : "pr-1.5",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={a.done}
        aria-label={`${a.done ? "Mark not done" : "Mark done"}: ${a.title}`}
        className={cn(
          "pressable flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-row text-left",
          compact ? "py-2 pl-3" : "py-3 pl-3.5",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-full transition-colors duration-200 ease-out",
            compact ? "size-[24px]" : "size-[28px]",
            a.done ? "bg-accent text-bg" : "border-2 border-check-outline",
            late && "border-accent",
          )}
        >
          {a.done ? <Check strokeWidth={3} className={compact ? "size-3.5" : "size-4"} /> : null}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-bold",
              compact ? "text-[14px]" : "text-[15px]",
              a.done && "text-fg-muted line-through decoration-2",
            )}
          >
            {a.title}
          </span>
          <span
            title={a.course_full ?? undefined}
            className="tnum block truncate text-[12px] font-semibold text-fg-muted"
          >
            {compact && flag ? (
              <>
                <span className="font-bold text-accent">{flag}</span>
                {` · ${meta}`}
              </>
            ) : (
              meta
            )}
          </span>
        </span>

        {!compact && flag ? (
          <Badge accent className="shrink-0">
            {flag}
          </Badge>
        ) : null}
      </button>

      {/* Compact rows live in the Today tile, where the link's 44px would cost
          the title; the School screen carries it. */}
      {a.url && !compact ? (
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${a.title} in Canvas`}
          title="Open in Canvas"
          className="pressable grid size-11 shrink-0 place-items-center rounded-full text-fg-dim hover:text-accent"
        >
          <ExternalLink aria-hidden strokeWidth={2} className="size-[17px]" />
        </a>
      ) : null}
    </div>
  );
}
