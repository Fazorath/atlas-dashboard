/* One summary reading: a ring, its number and what it counts.

   The same element serves both breakpoints. On a phone the number sits inside
   the ring with the label under it; from 900px the ring shrinks and the number
   and label move out to its right. */

import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import type { Accent } from "@/lib/sections";

export function StatRing({
  accent,
  label,
  value,
  short,
  progress = 0,
}: {
  accent: Accent;
  label: string;
  /** Null while the source behind it has nothing to say. */
  value: string | null;
  /** What fits inside the 72px phone ring when `value` doesn't ("6.5h" for
   *  "6h 31m"). The desktop layout always shows `value`. */
  short?: string | null;
  progress?: number;
}) {
  const hasValue = value != null;

  return (
    <div
      data-accent={accent}
      className="flex min-w-0 flex-col items-center gap-2 lap:flex-row lap:items-center lap:gap-3.5"
    >
      <ProgressRing
        size={72}
        stroke={8}
        value={progress}
        muted={!hasValue}
        boxClassName="size-[72px] lap:size-16"
        label={hasValue ? `${label}: ${value}` : `${label}: no data yet`}
      >
        {/* Nothing inside an empty ring — a short bar in there just reads as the
            bare em-dash the spec is trying to get rid of. */}
        {hasValue ? (
          <span className="tnum px-1 text-[16px] leading-none font-extrabold lap:hidden">
            {short ?? value}
          </span>
        ) : null}
      </ProgressRing>

      <div className="min-w-0 text-center lap:text-left">
        <div className="tnum hidden text-[22px] leading-tight font-extrabold lap:block">
          {hasValue ? value : <Skeleton width={48} height={10} />}
        </div>
        <div className="text-[12px] leading-tight font-semibold text-fg-muted lap:whitespace-nowrap lap:text-[13px]">
          {label}
        </div>
      </div>
    </div>
  );
}
