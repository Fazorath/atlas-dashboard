import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  /** 0–1, clamped. */
  value: number;
  height?: number;
  muted?: boolean;
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  height = 8,
  muted = false,
  label,
  className,
}: ProgressBarProps) {
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-accent-track", className)}
      style={{ height }}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(pct * 100) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      {muted ? null : (
        <div
          className="value-transition h-full rounded-full bg-accent"
          style={{ width: `${pct * 100}%` }}
        />
      )}
    </div>
  );
}
