/* Habits' Widgets — module habits.

   No Source and so no Problem state: you are the upstream. Measured habits
   tick themselves from Health; a manual tick always wins. */

import { Check, HeartPulse } from "lucide-react";
import { useState } from "react";

import { SegmentMeter } from "@/components/ui/segment-meter";
import {
  localDate,
  measuredLine,
  parseLocalDate,
  useHabitHistory,
  useHabits,
  useToggleHabit,
  type Habit,
  type HistoryDay,
} from "@/lib/habits";
import { cn } from "@/lib/utils";
import { calendarWeek, R, WidgetCard } from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const EMPTY = { title: "No habits yet", text: "Add one from Manage on the Habits screen." };

function TodaysHabits({ size }: WidgetProps) {
  const habits = useHabits();
  const toggle = useToggleHabit();
  const today = localDate();
  const tick = (h: Habit) => toggle.mutate({ id: h.id, date: today });
  const state = habits.isPending ? "loading" : habits.isError ? "error" : "ready";

  return (
    <WidgetCard
      title="Today's habits"
      area="habits"
      state={state}
      problem={{ chip: "Unavailable", text: "The Atlas API didn't answer." }}
      empty={habits.configured && habits.total === 0 ? EMPTY : null}
      aside={size === "M" ? `${habits.remaining} left` : size === "L" ? "streak" : null}
    >
      {size === "S" ? (
        <div className="mt-auto flex flex-col gap-2.5">
          <div>
            <p className={R.l}>
              {habits.done}
              <span className="text-[0.5em] text-fg-muted">/{habits.total}</span>
            </p>
            <p className="mt-1 text-[12px] text-fg-muted lap:text-[13px]">done today</p>
          </div>
          <SegmentMeter value={habits.total ? habits.done / habits.total : 0} label={`${habits.done} of ${habits.total} done today`} />
        </div>
      ) : size === "M" ? (
        <>
          <p className="flex items-baseline gap-2">
            <span className={R.s}>
              {habits.done}/{habits.total}
            </span>
            <span className="truncate text-[12px] text-fg-muted">
              today{habits.habits.some((h) => h.metric) ? " · auto ones tick from Health" : ""}
            </span>
          </p>
          <ul className="mt-auto grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${Math.max(habits.total, 1)}, minmax(0, 1fr))` }}>
            {habits.habits.slice(0, 8).map((h) => (
              <li key={h.id} className="flex min-w-0 flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => tick(h)}
                  aria-pressed={h.done}
                  aria-label={`${h.done ? "Untick" : "Tick"} ${h.name}`}
                  className={cn(
                    "pressable grid size-11 place-items-center rounded-row transition-colors",
                    h.done ? "bg-accent text-bg" : "border border-border-subtle bg-surface-2 text-fg-muted",
                  )}
                >
                  {h.done ? <Check strokeWidth={3} className="size-4" /> : <span className="text-[13px]">{h.icon ?? h.name.slice(0, 1)}</span>}
                </button>
                <span className="w-full truncate text-center text-[10px] text-fg-muted">{h.name.split(" ")[0]}</span>
                <span className={cn(R.t, "text-[10px]", h.done ? "text-accent" : "text-fg-dim")}>
                  {h.auto ? "auto" : `${h.current_streak}d`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <ul className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
            {habits.habits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => tick(h)}
                  aria-pressed={h.done}
                  className="pressable flex min-h-10 w-full items-center gap-3 rounded-row text-left"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-[5px] transition-colors",
                      h.done ? "bg-accent text-bg" : "border-2 border-check-outline",
                    )}
                  >
                    {h.done ? <Check strokeWidth={3} className="size-3.5" /> : null}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", h.done && "text-fg-muted")}>
                    {h.name}
                  </span>
                  {h.metric ? (
                    <span className="tnum flex items-center gap-1 text-[11px] text-fg-muted">
                      <HeartPulse aria-hidden strokeWidth={2.2} className="size-3" /> auto
                    </span>
                  ) : null}
                  <span className={cn(R.t, "w-8 shrink-0 text-right", h.current_streak > 0 ? "text-fg" : "text-fg-dim")}>
                    {h.current_streak}d
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <SegmentMeter value={habits.total ? habits.done / habits.total : 0} label={`${habits.done} of ${habits.total} done today`} className="flex-1" />
            <span className={cn(R.t, "text-fg-muted")}>
              {habits.done}/{habits.total}
            </span>
          </div>
        </>
      )}
    </WidgetCard>
  );
}

/* --- Heatmap ------------------------------------------------------------- */

const FILL = [
  "var(--surface-2)",
  "color-mix(in oklab, var(--habits) 15%, var(--surface-2))",
  "color-mix(in oklab, var(--habits) 40%, var(--surface-2))",
  "color-mix(in oklab, var(--habits) 70%, var(--surface-2))",
  "var(--habits)",
];

function level(day: HistoryDay): number {
  if (day.total === 0 || day.done === 0) return 0;
  const r = day.done / day.total;
  return r >= 1 ? 4 : r >= 0.66 ? 3 : r >= 0.33 ? 2 : 1;
}

function Heatmap({ size }: WidgetProps) {
  const weeks = size === "XL" ? 17 : 8;
  const habits = useHabits();
  // Whole weeks back to a Monday, plus this week so far.
  const lead = (new Date().getDay() + 6) % 7;
  const history = useHabitHistory((weeks - 1) * 7 + lead + 1);
  const days = history.data ?? [];
  const counted = days.filter((d) => d.total > 0);
  const share = counted.length
    ? counted.reduce((a, d) => a + d.done, 0) / counted.reduce((a, d) => a + d.total, 0)
    : null;
  const perfect = counted.filter((d) => d.done >= d.total).length;
  const best = habits.habits.reduce<Habit | null>((b, h) => (!b || h.longest_streak > b.longest_streak ? h : b), null);
  const state = history.isPending ? "loading" : history.isError ? "error" : "ready";

  const range =
    days.length > 0
      ? `${parseLocalDate(days[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${parseLocalDate(
          days[days.length - 1].date,
        ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "";

  return (
    <WidgetCard
      title="Heatmap"
      area="habits"
      state={state}
      problem={{ chip: "Unavailable", text: "The Atlas API didn't answer." }}
      empty={habits.configured && habits.total === 0 ? { ...EMPTY, text: "The heatmap fills in from the first day you tick a habit." } : null}
      aside={`${weeks} weeks`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 lap:flex-row lap:gap-6">
        <Grid days={days} weeks={weeks} portrait={size === "XL"} />
        <div className="flex shrink-0 flex-row flex-wrap gap-x-6 gap-y-2.5 lap:w-[150px] lap:flex-col lap:justify-center">
          <Stat value={share != null ? `${Math.round(share * 100)}%` : "—"} label="of ticks done" />
          <Stat value={String(perfect)} label="perfect days" />
          {best && best.longest_streak > 0 ? <Stat value={`${best.longest_streak}d`} label={`best · ${best.name}`} /> : null}
        </div>
        {size === "XL" ? (
          <ul className="hidden min-w-0 flex-1 flex-col justify-center gap-2 border-l border-divider pl-6 lap:flex">
            {[...habits.habits]
              .sort((a, b) => b.completion_30d - a.completion_30d)
              .slice(0, 7)
              .map((h) => (
                <li key={h.id} className="grid grid-cols-[minmax(0,1fr)_64px_36px] items-center gap-3">
                  <span className="truncate text-[13px]">{h.name}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${h.completion_30d * 100}%` }} />
                  </span>
                  <span className={cn(R.t, "text-right text-fg-muted")}>{Math.round(h.completion_30d * 100)}%</span>
                </li>
              ))}
          </ul>
        ) : null}
      </div>
      <p className={cn(R.t, "flex items-center justify-between gap-3 text-fg-muted")}>
        <span>{range}</span>
        <span aria-hidden className="flex items-center gap-[3px]">
          Less
          {FILL.map((f, i) => (
            <span key={i} className="size-[9px] rounded-[2px]" style={{ background: f }} />
          ))}
          More
        </span>
      </p>
    </WidgetCard>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className={R.s}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-fg-muted lap:text-[12px]">{label}</p>
    </div>
  );
}

/** Columns are weeks, Monday on top. `portrait` (phone XL) turns the weeks
 *  into rows running downward. Sized against its own box so every cell stays
 *  square whatever the tile's shape. */
function Grid({ days, weeks, portrait }: { days: HistoryDay[]; weeks: number; portrait: boolean }) {
  const lead = days.length ? (parseLocalDate(days[0].date).getDay() + 6) % 7 : 0;
  const cells: (HistoryDay | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length < weeks * 7) cells.push(null);
  const today = localDate();
  const label = (d: HistoryDay) =>
    `${parseLocalDate(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${
      d.total === 0 ? "no habits yet" : `${d.done} of ${d.total}`
    }`;

  const grid = (orientation: "landscape" | "portrait") => {
    const cols = orientation === "landscape" ? weeks : 7;
    const rows = orientation === "landscape" ? 7 : weeks;
    return (
      <div
        role="img"
        aria-label={`Habit completion, last ${weeks} weeks`}
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoFlow: orientation === "landscape" ? "column" : "row",
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          aspectRatio: `${cols} / ${rows}`,
          width: `min(100%, calc(100cqh * ${cols / rows}))`,
        }}
      >
        {cells.map((d, i) =>
          d ? (
            <span
              key={d.date}
              title={label(d)}
              className={cn("rounded-[3px]", d.date === today && "outline outline-1 outline-fg-muted")}
              style={{ background: d.total === 0 ? "transparent" : FILL[level(d)], boxShadow: d.total === 0 ? "inset 0 0 0 1px var(--habits-track)" : undefined }}
            />
          ) : (
            <span key={`pad-${i}`} aria-hidden />
          ),
        )}
      </div>
    );
  };

  // On a phone the tile hugs its content, so the box takes its height from
  // the grid's own shape instead of from the tile.
  const phoneRatio = portrait ? `7 / ${weeks}` : `${weeks} / 7`;
  return (
    <div
      className="min-h-0 min-w-0 flex-1 [container-type:size] max-lap:flex-none max-lap:[aspect-ratio:var(--phone-ratio)]"
      style={{ "--phone-ratio": phoneRatio } as React.CSSProperties}
    >
      {portrait ? (
        <>
          <div className="hidden h-full lap:block">{grid("landscape")}</div>
          <div className="h-full lap:hidden">{grid("portrait")}</div>
        </>
      ) : (
        grid("landscape")
      )}
    </div>
  );
}

/* --- This week (Area-only) ----------------------------------------------- */

/** The backfill: pick a day this week and the rows tick that day. Streaks
 *  always answer for today, whichever day is picked. */
function ThisWeek(_: WidgetProps) {
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const habits = useHabits(selected);
  const toggle = useToggleHabit();
  const history = useHabitHistory(7);
  const byDate = new Map((history.data ?? []).map((d) => [d.date, d]));
  const state = habits.isPending ? "loading" : habits.isError ? "error" : "ready";
  const week = calendarWeek().map((d) => ({ ...d, key: localDate(d.date) }));
  const picked = week.find((d) => d.key === selected);

  return (
    <WidgetCard
      title="This week"
      area="habits"
      state={state}
      problem={{ chip: "Unavailable", text: "The Atlas API didn't answer." }}
      empty={habits.configured && habits.total === 0 ? EMPTY : null}
      aside={`${habits.done}/${habits.total} ${selected === today ? "today" : (picked?.label ?? "")}`}
    >
      <ol className="grid grid-cols-7 gap-1">
        {week.map((d) => {
          const stats = byDate.get(d.key);
          const ratio = stats && stats.total > 0 ? stats.done / stats.total : 0;
          const future = d.key > today;
          const on = d.key === selected;
          return (
            <li key={d.key}>
              <button
                type="button"
                disabled={future}
                onClick={() => setSelected(d.key)}
                aria-pressed={on}
                aria-current={d.isToday ? "date" : undefined}
                aria-label={d.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                className={cn(
                  "pressable flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-row disabled:pointer-events-none",
                  on ? "bg-accent text-bg" : future ? "bg-surface-2 text-fg-dim" : "bg-surface-2 text-fg",
                  d.isToday && !on && "ring-1 ring-accent ring-inset",
                )}
              >
                <span className="text-[10px] opacity-80">{d.label.slice(0, 1)}</span>
                <span className={R.xs}>{d.date.getDate()}</span>
                <span
                  aria-hidden
                  className={cn("size-1 rounded-full", on ? "bg-bg" : "bg-accent")}
                  style={{ opacity: future || !stats?.total ? 0 : 0.25 + 0.75 * ratio }}
                />
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {habits.habits.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => toggle.mutate({ id: h.id, date: selected })}
              aria-pressed={h.done}
              className="pressable flex min-h-10 w-full items-center gap-3 rounded-row text-left"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-[5px] transition-colors",
                  h.done ? "bg-accent text-bg" : "border-2 border-check-outline",
                )}
              >
                {h.done ? <Check strokeWidth={3} className="size-3.5" /> : null}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", h.done && "text-fg-muted")}>
                {h.name}
              </span>
              <span className={cn(R.t, "shrink-0 truncate text-fg-muted")}>{measuredLine(h) ?? `${h.current_streak}d`}</span>
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

export const HABITS_WIDGETS: WidgetDef[] = [
  { id: "habits.today", title: "Today's habits", area: "habits", sizes: ["S", "M", "L"], placement: "anywhere", render: TodaysHabits },
  { id: "habits.heatmap", title: "Heatmap", area: "habits", sizes: ["L", "XL"], placement: "anywhere", render: Heatmap },
  { id: "habits.week", title: "This week", area: "habits", sizes: ["L"], placement: "area", render: ThisWeek },
];
