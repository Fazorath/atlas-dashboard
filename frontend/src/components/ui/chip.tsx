/* A status pill: a dot plus a word. Colour is never the only signal — the word
   carries the same meaning on its own. */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ChipTone = "live" | "setup" | "idle" | "error";

const tone: Record<ChipTone, { wrap: string; dot: string }> = {
  live: { wrap: "bg-habits-tint text-live-text", dot: "bg-habits" },
  setup: { wrap: "bg-money-tint text-setup-text", dot: "bg-money" },
  idle: { wrap: "bg-surface-2 text-fg-muted", dot: "bg-idle-dot" },
  error: { wrap: "bg-due-tint text-due-soft", dot: "bg-due" },
};

export function Chip({
  tone: key = "idle",
  compact = false,
  children,
  className,
}: {
  tone?: ChipTone;
  /** The in-header badge sits tighter than a standalone chip. */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-bold whitespace-nowrap",
        compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-2 text-[13px]",
        tone[key].wrap,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone[key].dot)} />
      {children}
    </span>
  );
}

/** A plain rounded badge with no dot — the "Tomorrow" tag on a due row. */
export function Badge({
  accent = false,
  children,
  className,
}: {
  accent?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap",
        accent ? "bg-accent-track text-accent" : "bg-surface-2 text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
