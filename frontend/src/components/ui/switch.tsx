/* An on/off switch with a 44px target. Notifications' Alerts and Setup's
   Modules checklist both use it. */

import { cn } from "@/lib/utils";

export function Switch({
  on,
  label,
  onChange,
  disabled = false,
  className,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "pressable flex h-11 w-[52px] shrink-0 items-center justify-center disabled:opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "relative h-[26px] w-[44px] rounded-full transition-colors",
          on ? "bg-accent" : "bg-surface",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-5 rounded-full transition-[left]",
            on ? "left-[21px] bg-bg" : "left-[3px] bg-fg-muted",
          )}
        />
      </span>
    </button>
  );
}
