/* Habits' Widgets — module habits.

   No Source and so no Problem state: you are the upstream. Measured habits
   tick themselves from Health; a manual tick always wins. */

import { Check, HeartPulse } from "lucide-react";
import { useState } from "react";

import { SegmentMeter } from "@/components/ui/segment-meter";
import { fitSlots } from "@/lib/habit-slots";
import {
  localDate,
  measuredLine,
  parseLocalDate,
  useHabitHistory,
  useHabits,
  useToggleHabit,
  type Habit,
} from "@/lib/habits";
import { cn } from "@/lib/utils";
import { calendarWeek, R, WidgetCard } from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const EMPTY = { title: "No habits yet", text: "Add one from Manage on the Habits screen." };

/** Slots per Size before the "+N" marker takes the last one, tuned so every
 *  name fits at two lines. A phone's M strip is narrower, so it has fewer. */
const M_SLOTS = { phone: 5, lap: 8 };
const L_ROWS = 7;
/** Checklist rows across both columns; the phone's M tile is the same height. */
const CHECKLIST_ROWS = 6;

/** Names wrap at spaces onto two lines, then end in "…". */
const TWO_LINES = "line-clamp-2 break-words";

function TodaysHabits({ size }: WidgetProps) {
  const habits = useHabits();
  const toggle = useToggleHabit();
  const today = localDate();
  const tick = (h: Habit) => toggle.mutate({ id: h.id, date: today });
  const state = habits.isPending ? "loading" : habits.isError ? "error" : "ready";
  const rows = fitSlots(habits.habits, L_ROWS);

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
        <HabitKeys habits={habits.habits} onTick={tick} />
      ) : (
        <>
          <ul className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
            {rows.shown.map((h) => (
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
                  <span className={cn("min-w-0 flex-1 text-[14px] leading-tight font-medium", TWO_LINES, h.done && "text-fg-muted")}>
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
            {rows.overflow > 0 ? (
              <li className="flex min-h-10 items-center pl-9 text-[13px] text-fg-muted">+{rows.overflow} more</li>
            ) : null}
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

/** M, as rows: a check square and the full name, two columns. An alternative
 *  to the boxes for people who'd rather tick from a list. No streaks. */
function HabitChecklist(_: WidgetProps) {
  const habits = useHabits();
  const toggle = useToggleHabit();
  const today = localDate();
  const state = habits.isPending ? "loading" : habits.isError ? "error" : "ready";
  const rows = fitSlots(habits.habits, CHECKLIST_ROWS);

  return (
    <WidgetCard
      title="Habit checklist"
      area="habits"
      state={state}
      problem={{ chip: "Unavailable", text: "The Atlas API didn't answer." }}
      empty={habits.configured && habits.total === 0 ? EMPTY : null}
      aside={`${habits.remaining} left`}
    >
      <ul className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.shown.map((h) => (
          <li key={h.id} className="min-w-0">
            <button
              type="button"
              onClick={() => toggle.mutate({ id: h.id, date: today })}
              aria-pressed={h.done}
              aria-label={`${h.done ? "Untick" : "Tick"} ${h.name}${h.metric ? " (auto)" : ""}`}
              className="pressable flex min-h-9 w-full items-center gap-2 rounded-row text-left"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors",
                  h.done ? "bg-accent text-bg" : "border-2 border-check-outline",
                )}
              >
                {h.done ? <Check strokeWidth={3} className="size-3" /> : null}
              </span>
              <span aria-hidden className={cn("min-w-0 flex-1 text-[12px] leading-tight font-medium", TWO_LINES, h.done && "text-fg-muted")}>
                {h.name}
              </span>
              {h.metric ? (
                <span aria-hidden className="flex shrink-0 items-center gap-0.5 text-[10px] text-fg-muted">
                  <HeartPulse strokeWidth={2.2} className="size-3" /> auto
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {rows.overflow > 0 ? (
          <li className="flex min-h-9 items-center pl-7 text-[12px] text-fg-muted">+{rows.overflow} more</li>
        ) : null}
      </ul>
    </WidgetCard>
  );
}

/** M: one key per Habit, its icon (or first letter) on the key, the full name
 *  and streak under it. A tick fills the key and keeps the icon, with a check
 *  in the corner, so the strip still reads at a glance once it's done. */
function HabitKeys({ habits, onTick }: { habits: Habit[]; onTick: (h: Habit) => void }) {
  // Both layouts are rendered and CSS picks one, so nothing is measured.
  const phone = fitSlots(habits, M_SLOTS.phone);
  const lap = fitSlots(habits, M_SLOTS.lap);
  const columns = (r: typeof lap) => Math.max(r.shown.length + (r.overflow > 0 ? 1 : 0), 1);

  return (
    <ul
      className="mt-auto grid grid-cols-[repeat(var(--cols-phone),minmax(0,1fr))] items-start gap-1.5 lap:grid-cols-[repeat(var(--cols-lap),minmax(0,1fr))] lap:gap-2"
      style={{ "--cols-phone": columns(phone), "--cols-lap": columns(lap) } as React.CSSProperties}
    >
      {lap.shown.map((h, i) => (
        <li key={h.id} className={cn("flex min-w-0 flex-col items-center gap-1.5", i >= phone.shown.length && "max-lap:hidden")}>
          <button
            type="button"
            onClick={() => onTick(h)}
            aria-pressed={h.done}
            aria-label={`${h.done ? "Untick" : "Tick"} ${h.name}`}
            className={cn(
              "pressable relative grid aspect-square w-full max-w-14 place-items-center rounded-row transition-colors",
              h.done ? "bg-accent text-bg" : "border border-border-subtle bg-surface-2 text-fg-muted",
            )}
          >
            <span aria-hidden className={h.icon ? "text-[20px] leading-none lap:text-[25px]" : "text-[16px] font-semibold"}>
              {h.icon ?? h.name.slice(0, 1)}
            </span>
            {h.done ? (
              <span
                aria-hidden
                className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-fg text-bg ring-2 ring-surface"
              >
                <Check strokeWidth={3.5} className="size-2.5" />
              </span>
            ) : null}
          </button>
          <span aria-hidden className={cn("min-h-[2lh] w-full text-center text-[12px] leading-tight", TWO_LINES, h.done ? "text-fg-muted" : "text-fg")}>
            {h.name}
          </span>
          <span aria-hidden className={cn(R.t, h.done ? "text-accent" : "text-fg-dim")}>
            {h.auto ? "auto" : `${h.current_streak}d`}
          </span>
        </li>
      ))}
      <MoreKey count={phone.overflow} className="lap:hidden" />
      <MoreKey count={lap.overflow} className="max-lap:hidden" />
    </ul>
  );
}

/** The "+N" key. Not a tick target: a tap falls through to the card, which
 *  opens the Habits Area like any tap on the Widget. */
function MoreKey({ count, className }: { count: number; className: string }) {
  if (count === 0) return null;
  return (
    <li className={cn("flex min-w-0 flex-col items-center", className)}>
      <span
        aria-label={`${count} more habits`}
        className="grid aspect-square w-full max-w-14 place-items-center rounded-row border border-dashed border-border-subtle text-[14px] font-semibold text-fg-muted"
      >
        +{count}
      </span>
    </li>
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
  const week = calendarWeek(parseLocalDate(localDate())).map((d) => ({ ...d, key: localDate(d.date) }));
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
  { id: "habits.checklist", title: "Habit checklist", area: "habits", sizes: ["M"], placement: "anywhere", galleryOnly: true, render: HabitChecklist },
  { id: "habits.week", title: "This week", area: "habits", sizes: ["L"], placement: "area", render: ThisWeek },
];
