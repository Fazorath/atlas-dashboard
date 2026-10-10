/* The streak calendar: one column per week, Monday at the top, today in the
   last column. A cell's fill is the share of that day's habits you ticked, so
   a perfect day is solid mint and a day before any habit existed is a faint
   outline rather than a failure. Days after today are left empty. */

import type { HistoryDay } from "@/lib/habits";
import { parseLocalDate } from "@/lib/habits";
import { cn } from "@/lib/utils";

/** Four steps plus "nothing ticked". Steps, not a continuous ramp: with three
 *  or four habits the ratios are coarse anyway, and discrete shades read
 *  faster at 12px. */
function level(day: HistoryDay): 0 | 1 | 2 | 3 | 4 {
  if (day.total === 0 || day.done === 0) return 0;
  const ratio = day.done / day.total;
  if (ratio >= 1) return 4;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

const FILL: Record<number, string> = {
  1: "color-mix(in oklab, var(--habits) 30%, var(--habits-track))",
  2: "color-mix(in oklab, var(--habits) 55%, var(--habits-track))",
  3: "color-mix(in oklab, var(--habits) 78%, var(--habits-track))",
  4: "var(--habits)",
};

export function HabitHeatmap({ days }: { days: HistoryDay[] }) {
  if (days.length === 0) return null;

  // Pad the front so the first column starts on a Monday, and the back so the
  // last column is a whole week (the future cells render as blanks).
  const first = parseLocalDate(days[0].date);
  const lead = (first.getDay() + 6) % 7;
  const cells: (HistoryDay | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = cells.length / 7;
  const perfect = days.filter((d) => d.total > 0 && d.done >= d.total).length;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="grid"
        aria-label={`Habit completion, last ${weeks} weeks`}
        className="grid grid-flow-col grid-rows-7 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {cells.map((day, i) =>
          day === null ? (
            <span key={`pad-${i}`} aria-hidden className="aspect-square" />
          ) : (
            <span
              key={day.date}
              role="gridcell"
              title={label(day)}
              aria-label={label(day)}
              className={cn(
                "aspect-square rounded-[4px]",
                day.total === 0 && "border border-habits-track",
              )}
              style={{
                background:
                  day.total === 0 ? "transparent" : (FILL[level(day)] ?? "var(--habits-track)"),
              }}
            />
          ),
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-fg-muted">
        <span className="tnum">
          {perfect} perfect {perfect === 1 ? "day" : "days"}
        </span>
        <span aria-hidden className="flex items-center gap-[3px]">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="ml-[2px] size-[10px] rounded-[3px]"
              style={{ background: FILL[l] ?? "var(--habits-track)" }}
            />
          ))}
          <span className="ml-1">More</span>
        </span>
      </div>
    </div>
  );
}

function label(day: HistoryDay): string {
  const when = parseLocalDate(day.date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return day.total === 0 ? `${when}: no habits yet` : `${when}: ${day.done} of ${day.total}`;
}
