/* The pieces every Setup and Settings form is built from: a labelled field,
   the text input, and the error line under a Save — which, for a file
   written by hand, offers to rewrite it instead of just failing. */

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { isHandWritten } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full min-w-0 rounded-[16px] bg-surface-2 px-4 text-[15px] font-semibold text-fg " +
  "placeholder:text-fg-dim outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "disabled:opacity-60 [color-scheme:dark]";

export function FieldRow({
  label,
  help,
  htmlFor,
  children,
  className,
}: {
  label: string;
  help?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-fg">
        {label}
      </label>
      {children}
      {help ? <p className="text-[12px] leading-snug font-semibold text-fg-muted">{help}</p> : null}
    </div>
  );
}

/** A save's failure. A hand-written file gets a "Rewrite it" button that
 *  repeats the save with `take_over`. */
export function SaveError({
  error,
  onTakeOver,
}: {
  error: Error | null;
  onTakeOver?: () => void;
}) {
  if (!error) return null;
  if (isHandWritten(error) && onTakeOver) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-row bg-money-tint px-4 py-3">
        <p className="text-[13px] leading-snug font-semibold text-setup-text">
          {error.message} Your other settings in it are kept.
        </p>
        <Button size="md" variant="neutral" onClick={onTakeOver}>
          Rewrite it
        </Button>
      </div>
    );
  }
  return <p className="text-[13px] leading-snug font-semibold break-words text-due-soft">{error.message}</p>;
}

export function Saved({ show, children = "Saved" }: { show: boolean; children?: ReactNode }) {
  return show ? <span className="text-[13px] font-bold text-live-text">{children}</span> : null;
}
