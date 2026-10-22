/* The app's main "how far through" mark: a row of neutral segments with the
   leading ones lit in the area's accent. It replaced the ring
   when Atlas took on its instrument-panel look; a run of discrete cells reads
   as a gauge, and it lines up with the mono numerals beside it. */

import { cn } from "@/lib/utils";

export function SegmentMeter({
  value,
  segments = 20,
  muted = false,
  label,
  className,
}: {
  /** 0–1. Clamped, so a value over budget lights every segment. */
  value: number;
  segments?: number;
  /** Lights nothing, for a source with no data yet. */
  muted?: boolean;
  label?: string;
  /** Sets the height (default 14px) and grid placement. */
  className?: string;
}) {
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const lit = muted ? 0 : Math.round(pct * segments);

  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("grid h-3.5 min-w-0 gap-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "rounded-[3px] transition-colors duration-300",
            i < lit ? "bg-accent" : "bg-surface-2",
          )}
        />
      ))}
    </div>
  );
}
