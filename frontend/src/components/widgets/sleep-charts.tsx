/* The three sleep marks: a night's stage split, its hypnogram, and a row of
   nights.

   Stages are ordinal (awake at the surface, deep at the floor), so they share
   one violet ramp rather than four hues, and the hypnogram repeats the order
   by row — colour is never the only way to tell REM from light. Every mark
   has a readout line that names what is under the pointer or finger; there is
   no hover-only information a phone could never reach. */

import { useState } from "react";

import {
  clockTime,
  formatMinutes,
  STAGES,
  stageKind,
  stageMinutes,
  type Night,
} from "@/lib/sleep";
import { cn } from "@/lib/utils";

/** Horizontal split of the night by stage, with a legend that doubles as the
    direct labels: every segment's name, minutes and share, in the same order. */
export function StageBar({ night }: { night: Night }) {
  const minutes = stageMinutes(night);
  const total = STAGES.reduce((sum, s) => sum + (minutes[s.kind] ?? 0), 0);

  if (night.sleep_type !== "STAGES" || total === 0) {
    return (
      <p className="text-[13px] leading-snug font-semibold text-accent-soft">
        {night.processed
          ? "No stage breakdown for this night — it was too short or the watch sat loose."
          : "Stages are still being worked out. They'll appear after the next sync."}
      </p>
    );
  }

  // Deep first, reading left to right from the floor up to awake.
  const order = [...STAGES].reverse();

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={order
          .map((s) => `${s.label} ${formatMinutes(minutes[s.kind]) ?? "none"}`)
          .join(", ")}
      >
        {order.map((s) =>
          minutes[s.kind] ? (
            <div
              key={s.kind}
              className={cn("h-full first:rounded-l-full last:rounded-r-full", s.bg)}
              style={{ flexGrow: minutes[s.kind] ?? 0, flexBasis: 0 }}
            />
          ) : null,
        )}
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 lap:grid-cols-4">
        {order.map((s) => {
          const m = minutes[s.kind];
          return (
            <li key={s.kind} className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", s.bg)} />
              <span className="text-[13px] font-bold text-fg">{s.label}</span>
              <span className="tnum truncate text-[13px] font-semibold text-fg-muted">
                {formatMinutes(m) ?? "–"}
                {m ? ` · ${Math.round((m / total) * 100)}%` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The night as a staircase: time across, depth down. Tap or hover a block to
    read its stage and span on the line above. */
export function Hypnogram({ night }: { night: Night }) {
  const [active, setActive] = useState<number | null>(null);
  if (night.stages.length === 0) return null;

  const start = new Date(night.start_at).getTime();
  const end = new Date(night.end_at).getTime();
  const span = Math.max(1, end - start);

  const W = 1000;
  const ROW = 22;
  const GAP = 6;
  const H = STAGES.length * ROW + (STAGES.length - 1) * GAP;
  const rowOf = (stage: string) => STAGES.findIndex((s) => s.kind === stageKind(stage));

  const hovered = active !== null ? night.stages[active] : null;
  const readout = hovered
    ? `${STAGES[rowOf(hovered.stage)].label} · ${clockTime(hovered.start)} – ${clockTime(hovered.end)}`
    : "Tap the chart to read a stage";

  // Every whole hour between bed and waking, for the axis.
  const hours: number[] = [];
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  for (let t = first.getTime() + 3_600_000; t < end; t += 3_600_000) hours.push(t);

  return (
    <div className="flex flex-col gap-2">
      <p className="tnum text-[12px] font-semibold text-accent-soft" aria-live="polite">
        {readout}
      </p>
      <div className="flex gap-3">
        <ul
          aria-hidden
          className="flex shrink-0 flex-col justify-between py-[3px] text-[11px] font-bold text-fg-muted"
          style={{ height: H }}
        >
          {STAGES.map((s) => (
            <li key={s.kind} className="leading-none">
              {s.label}
            </li>
          ))}
        </ul>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height: H }}
            role="img"
            aria-label={`Sleep stages from ${clockTime(night.start_at)} to ${clockTime(night.end_at)}`}
            onMouseLeave={() => setActive(null)}
          >
            {STAGES.map((s, i) => (
              <rect
                key={s.kind}
                x={0}
                y={i * (ROW + GAP)}
                width={W}
                height={ROW}
                className="fill-accent-track"
                opacity={0.35}
              />
            ))}
            {night.stages.map((stage, i) => {
              const row = rowOf(stage.stage);
              const x = ((new Date(stage.start).getTime() - start) / span) * W;
              const w = ((new Date(stage.end).getTime() - new Date(stage.start).getTime()) / span) * W;
              return (
                <rect
                  key={i}
                  x={x}
                  y={row * (ROW + GAP)}
                  width={Math.max(w, 1.5)}
                  height={ROW}
                  className={cn(
                    STAGES[row].fill,
                    active !== null && active !== i && "opacity-45",
                    "cursor-pointer transition-opacity",
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(active === i ? null : i)}
                />
              );
            })}
          </svg>
          <div
            aria-hidden
            className="tnum relative mt-1.5 h-4 text-[11px] font-semibold text-fg-muted"
          >
            <span className="absolute left-0">{clockTime(night.start_at)}</span>
            {hours
              .filter((_, i) => i % 2 === 1)
              .map((t) => {
                const left = ((t - start) / span) * 100;
                // Clear of the bed and wake labels at either end, which are
                // wider than an hour label and would collide on a phone.
                return left > 22 && left < 78 ? (
                  <span key={t} className="absolute -translate-x-1/2" style={{ left: `${left}%` }}>
                    {new Date(t).toLocaleTimeString(undefined, { hour: "numeric" })}
                  </span>
                ) : null;
              })}
            <span className="absolute right-0">{clockTime(night.end_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface NightBar {
  key: string;
  label: string;
  isToday: boolean;
  minutes: number | null;
  /** Named in the readout, e.g. "Tuesday". */
  long: string;
}

/** A row of nights. The bars are asleep time on one shared scale; an empty
    slot keeps its place as a short track so the week never closes up. */
export function NightBars({
  days,
  goal,
  height = 120,
}: {
  days: NightBar[];
  /** Minutes the dotted goal line sits at. */
  goal: number;
  height?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const top = Math.max(goal * 1.15, ...days.map((d) => d.minutes ?? 0));
  const hovered = days.find((d) => d.key === active);
  const readout = hovered
    ? `${hovered.long} · ${formatMinutes(hovered.minutes) ?? "no night recorded"}`
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="tnum h-4 text-[12px] font-semibold text-accent-soft" aria-live="polite">
        {readout}
      </p>
      {/* Bars only in here, so the goal line's percentage is of the bars'
          own height and not of the labels under them. */}
      {/* A fixed height, not a minimum: the bars are percentages of it, and a
          percentage of an auto-height flex row resolves to nothing. */}
      <div className="relative flex shrink-0 items-end gap-2" style={{ height }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dotted border-accent-track"
          style={{ bottom: `${(goal / top) * 100}%` }}
        />
        {days.map((day) => {
          const pct = day.minutes ? Math.max(0.06, day.minutes / top) : 0;
          const lit = active === null || active === day.key;
          return (
            <button
              key={day.key}
              type="button"
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={() => setActive(day.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(day.key)}
              onBlur={() => setActive(null)}
              aria-label={`${day.long}: ${formatMinutes(day.minutes) ?? "no night recorded"}`}
            >
              {day.minutes ? (
                <div
                  className={cn(
                    "value-transition w-full rounded-[12px] transition-opacity",
                    day.isToday ? "bg-accent" : "bg-accent/70",
                    !lit && "opacity-50",
                  )}
                  style={{ height: `${pct * 100}%` }}
                />
              ) : (
                <div className="h-3 w-full rounded-[12px] bg-accent-track" />
              )}
            </button>
          );
        })}
      </div>
      <div aria-hidden className="flex gap-2">
        {days.map((day) => (
          <span
            key={day.key}
            className={cn(
              "min-w-0 flex-1 text-center text-[12px] leading-4",
              day.isToday ? "font-extrabold text-accent" : "font-bold text-fg-muted",
            )}
          >
            {day.label}
          </span>
        ))}
      </div>
    </div>
  );
}
