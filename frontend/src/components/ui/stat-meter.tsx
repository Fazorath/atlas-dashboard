/* One summary reading: what it counts, a segment meter and its number.

   The same element serves both breakpoints. On a phone the label and number
   share a line with the meter full width under them; from 900px the three sit
   in one row — label, meter, number — so stacked readings line up as columns. */

import { SegmentMeter } from "@/components/ui/segment-meter";
import { Skeleton } from "@/components/ui/skeleton";
import type { Accent } from "@/lib/sections";

export function StatMeter({
  accent,
  label,
  value,
  empty,
  progress = 0,
}: {
  accent: Accent;
  label: string;
  /** Null while the source behind it has nothing to say. */
  value: string | null;
  /** Said in place of the number once the Source has answered with nothing
   *  for today ("No night yet"). Absent, a missing value is still loading. */
  empty?: string | null;
  progress?: number;
}) {
  const hasValue = value != null;
  const isEmpty = !hasValue && empty != null;

  return (
    <div
      data-accent={accent}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lap:grid-cols-[136px_minmax(0,1fr)_96px] lap:gap-x-4"
    >
      <span className="label-caps truncate text-fg-muted">{label}</span>
      <span className="tnum flex justify-end text-[20px] leading-none font-semibold lap:order-last lap:text-[16px]">
        {hasValue ? (
          value
        ) : isEmpty ? (
          <span className="text-[12px] text-fg-muted">{empty}</span>
        ) : (
          <Skeleton width={48} height={10} />
        )}
      </span>
      <SegmentMeter
        value={progress}
        muted={!hasValue}
        label={hasValue ? `${label}: ${value}` : `${label}: ${empty ?? "no data yet"}`}
        className="col-span-2 lap:col-span-1"
      />
    </div>
  );
}
