/* The ring is the app's main "how far through" mark: a track circle in the
   area's -track colour with the accent drawn over it.
   Rotated -90deg so progress starts at twelve o'clock. */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ProgressRingProps {
  /** 0–1. Clamped, so a value over budget fills the ring rather than overdrawing. */
  value: number;
  size?: number;
  stroke?: number;
  /** Centred content — the phone rings carry their value inside. */
  children?: ReactNode;
  /** Dims the track and hides the progress arc for a source with no data yet. */
  muted?: boolean;
  label?: string;
  /** Overrides the rendered box so one ring can be 72px on a phone and 64px on
   *  a desktop. `size` stays the viewBox unit, so the geometry just scales. */
  boxClassName?: string;
  className?: string;
}

export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  children,
  muted = false,
  label,
  boxClassName,
  className,
}: ProgressRingProps) {
  // Keeps the round cap from clipping on the viewBox edge; reproduces the
  // spec's r=30/26/37 for the 72/64/88 sizes.
  const r = (size - stroke) / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={cn("relative shrink-0", boxClassName, className)}
      style={boxClassName ? undefined : { width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-accent-track"
        />
        {muted ? null : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * pct} ${circumference}`}
            className="value-transition stroke-accent"
          />
        )}
      </svg>
      {children ? (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      ) : null}
    </div>
  );
}
