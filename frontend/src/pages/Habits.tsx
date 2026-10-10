/* Habits is the one screen built for the thumb: a week strip you can read at a
   glance, one ring for the day, and a stack of rows big enough to hit without
   looking. The desktop version is the same column, centred — there is nothing
   here that a second column would improve.

   The week strip is also the backfill: tap yesterday and the rows tick
   yesterday. Streaks always answer for today whichever day is selected. */

import { useQuery } from "@tanstack/react-query";
import { Archive, Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { HabitHeatmap } from "@/components/widgets/habit-heatmap";
import { SourceChip } from "@/components/widgets/source-card";
import { api } from "@/lib/api";
import {
  localDate,
  parseLocalDate,
  useCreateHabit,
  useHabitHistory,
  useHabits,
  useToggleHabit,
  useUpdateHabit,
  type Habit,
  type HabitDefinition,
  type HistoryDay,
} from "@/lib/habits";
import { habitAccent } from "@/lib/sections";
import { cn } from "@/lib/utils";

/** Sixteen whole weeks plus this one so far. */
const HEATMAP_WEEKS = 17;

export function Habits() {
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const habits = useHabits(selected);
  const toggle = useToggleHabit();
  const mondayIndex = (new Date().getDay() + 6) % 7;
  const history = useHabitHistory((HEATMAP_WEEKS - 1) * 7 + mondayIndex + 1);

  const state = habits.isPending ? "loading" : habits.isError ? "error" : "ready";

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-[14px]">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
          Habits
        </h1>
        <div className="flex gap-2" data-accent="habits">
          <Button
            variant={editing ? "solid" : "neutral"}
            size="icon"
            aria-label={editing ? "Done editing" : "Edit habits"}
            aria-pressed={editing}
            disabled={!habits.configured}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? (
              <Check aria-hidden strokeWidth={2.5} className="size-5" />
            ) : (
              <Pencil aria-hidden strokeWidth={2} className="size-[18px]" />
            )}
          </Button>
          <Button
            variant={adding ? "soft" : "neutral"}
            size="icon"
            aria-label="Add habit"
            aria-expanded={adding}
            disabled={!habits.configured}
            onClick={() => setAdding((a) => !a)}
          >
            <Plus aria-hidden strokeWidth={2} className="size-5" />
          </Button>
        </div>
      </header>

      <WeekStrip
        today={today}
        selected={selected}
        onSelect={setSelected}
        history={history.data ?? []}
      />

      <TodayCard
        date={selected}
        today={today}
        configured={habits.configured}
        loading={habits.isPending}
        done={habits.done}
        total={habits.total}
        remaining={habits.remaining}
        bestStreak={habits.bestStreak}
        state={state}
      />

      {adding ? <AddHabit onClose={() => setAdding(false)} /> : null}

      {habits.configured && habits.habits.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {habits.habits.map((habit, i) => (
            <li key={habit.id}>
              {editing ? (
                <EditRow habit={habit} index={i} />
              ) : (
                <HabitRow
                  habit={habit}
                  index={i}
                  onToggle={() => toggle.mutate({ id: habit.id, date: selected })}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Card title="Your habits" accent="habits" tinted={false}>
          <div className="flex flex-col gap-2.5 pt-3">
            {habits.isPending ? (
              <Skeleton width={48} height={10} pulse />
            ) : habits.isError ? (
              <p className="text-[13px] leading-snug font-semibold text-habits-soft">
                Couldn't reach the habits API. Your ticks are safe in Atlas's database — this
                is a connection problem, not lost data.
              </p>
            ) : (
              <>
                <p className="text-[13px] leading-snug font-semibold text-habits-soft">
                  No habits yet. Add one — it's a single tick a day, and streaks count from
                  the first.
                </p>
                {adding ? null : (
                  <Button
                    variant="soft"
                    className="self-start"
                    onClick={() => setAdding(true)}
                  >
                    <Plus aria-hidden strokeWidth={2} className="size-4" />
                    Add a habit
                  </Button>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {editing ? <ArchivedHabits /> : null}

      {history.data && history.data.some((d) => d.total > 0) ? (
        <Card title="Last 17 weeks" accent="habits" tinted={false} bodyClassName="pt-4">
          <HabitHeatmap days={history.data} />
        </Card>
      ) : null}
    </div>
  );
}

/** Monday-first. Past days and today are buttons that pick the day the rows
 *  tick; a dot under each date shows how much of that day got done. */
function WeekStrip({
  today,
  selected,
  onSelect,
  history,
}: {
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  history: HistoryDay[];
}) {
  const now = parseLocalDate(today);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const byDate = new Map(history.map((d) => [d.date, d]));

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = localDate(day);
    return {
      key,
      letter: day.toLocaleDateString(undefined, { weekday: "narrow" }),
      date: day.getDate(),
      isToday: key === today,
      isFuture: key > today,
      isSelected: key === selected,
      stats: byDate.get(key),
      label: day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    };
  });

  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const ratio = day.stats && day.stats.total > 0 ? day.stats.done / day.stats.total : 0;
        return (
          <li key={day.key}>
            <button
              type="button"
              disabled={day.isFuture}
              onClick={() => onSelect(day.key)}
              aria-label={day.label}
              aria-pressed={day.isSelected}
              aria-current={day.isToday ? "date" : undefined}
              className={cn(
                "pressable flex h-[60px] w-full flex-col items-center justify-center gap-0.5 rounded-[20px] disabled:pointer-events-none",
                day.isSelected
                  ? "bg-habits text-bg"
                  : day.isFuture
                    ? "bg-surface text-fg-dim"
                    : "bg-surface text-fg",
                day.isToday && !day.isSelected && "ring-2 ring-habits ring-inset",
              )}
            >
              <span className="text-[11px] font-bold opacity-80">{day.letter}</span>
              <span className="tnum text-[17px] leading-none font-extrabold">{day.date}</span>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 size-[5px] rounded-full",
                  day.isSelected ? "bg-bg" : "bg-habits",
                )}
                style={{ opacity: day.isFuture || !day.stats?.total ? 0 : 0.25 + 0.75 * ratio }}
              />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function dayName(date: string, today: string): string {
  if (date === today) return "Today";
  const yesterday = parseLocalDate(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === localDate(yesterday)) return "Yesterday";
  return parseLocalDate(date).toLocaleDateString(undefined, { weekday: "long" });
}

function TodayCard({
  date,
  today,
  configured,
  loading,
  done,
  total,
  remaining,
  bestStreak,
  state,
}: {
  date: string;
  today: string;
  configured: boolean;
  loading: boolean;
  done: number;
  total: number;
  remaining: number;
  bestStreak: number;
  state: "loading" | "ready" | "error";
}) {
  const isToday = date === today;
  const headline = !configured || total === 0
    ? "Nothing to tick yet"
    : remaining === 0
      ? "All done. Nice."
      : isToday
        ? `${remaining} left for today`
        : `${done} of ${total} done`;

  return (
    <Card
      title={dayName(date, today)}
      titleHidden
      accent="habits"
      aside={state === "ready" ? null : <SourceChip state={state} source="habits" />}
      bodyClassName="pt-4"
    >
      <div className="flex items-center gap-5">
        <ProgressRing
          size={88}
          stroke={10}
          value={total > 0 ? done / total : 0}
          muted={!configured || total === 0}
          label={configured ? `${done} of ${total} habits done` : "No habits yet"}
        >
          {configured && total > 0 ? (
            <span className="tnum text-[20px] leading-none font-extrabold">{`${done}/${total}`}</span>
          ) : loading ? (
            <Skeleton width={26} height={8} pulse />
          ) : null}
        </ProgressRing>

        <div className="min-w-0">
          <p className="eyebrow">{dayName(date, today)}</p>
          <p className="mt-1.5 text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
            {headline}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-habits-soft">
            {configured && total > 0
              ? `Best streak: ${bestStreak} ${bestStreak === 1 ? "day" : "days"}`
              : "Streaks start counting from your first tick."}
          </p>
        </div>
      </div>
    </Card>
  );
}

function streakLine(habit: Habit): string {
  const pct = `${Math.round(habit.completion_30d * 100)}% this month`;
  if (habit.current_streak === 0) return `No streak yet · ${pct}`;
  return `${habit.current_streak} day streak · ${pct}`;
}

function HabitRow({
  habit,
  index,
  onToggle,
}: {
  habit: Habit;
  index: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={habit.done}
      data-accent={habitAccent(index)}
      className="pressable flex w-full min-h-11 items-center gap-3.5 rounded-[22px] bg-surface px-3.5 py-3 text-left"
    >
      <IconTile size={44} variant="soft" letter={habit.icon ?? habit.name.slice(0, 1).toUpperCase()} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{habit.name}</span>
        <span className="block truncate text-[13px] font-semibold text-fg-muted">
          {streakLine(habit)}
        </span>
      </span>

      <span
        aria-hidden
        className={cn(
          "grid size-[30px] shrink-0 place-items-center rounded-full transition-colors duration-200 ease-out",
          habit.done ? "bg-accent text-bg" : "border-2 border-check-outline bg-transparent",
        )}
      >
        {habit.done ? <Check strokeWidth={3} className="size-4" /> : null}
      </span>
    </button>
  );
}

const inputClass =
  "h-11 min-w-0 flex-1 rounded-[16px] bg-surface-2 px-4 text-[15px] font-semibold text-fg " +
  "placeholder:text-fg-dim outline-none focus-visible:ring-2 focus-visible:ring-accent";

function AddHabit({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const create = useCreateHabit();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed }, { onSuccess: () => setName("") });
  };

  return (
    <Card title="New habit" accent="habits" bodyClassName="pt-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Read 20 pages"
          aria-label="Habit name"
          className={inputClass}
        />
        <Button type="submit" variant="solid" disabled={!name.trim() || create.isPending}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X aria-hidden strokeWidth={2} className="size-5" />
        </Button>
      </form>
      {create.isError ? (
        <p className="mt-2 text-[13px] font-semibold text-habits-soft">
          Couldn't add that — {create.error.message}
        </p>
      ) : null}
    </Card>
  );
}

/** Rename saves on Enter or blur; archive hides the habit but keeps its ticks. */
function EditRow({ habit, index }: { habit: Habit; index: number }) {
  const [name, setName] = useState(habit.name);
  const update = useUpdateHabit();

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setName(habit.name);
    if (trimmed !== habit.name) update.mutate({ id: habit.id, name: trimmed });
  };

  return (
    <div
      data-accent={habitAccent(index)}
      className="flex w-full items-center gap-2 rounded-[22px] bg-surface px-3.5 py-3"
    >
      <input
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`Rename ${habit.name}`}
        className={inputClass}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Archive ${habit.name}`}
        title="Archive — hides it, keeps its history"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: habit.id, archived: true })}
      >
        <Archive aria-hidden strokeWidth={2} className="size-5" />
      </Button>
    </div>
  );
}

function ArchivedHabits() {
  const archived = useQuery({
    queryKey: ["habits", "archived"],
    queryFn: () => api<HabitDefinition[]>("/habits/?archived=true"),
  });
  const update = useUpdateHabit();

  if (!archived.data?.length) return null;

  return (
    <Card title="Archived" accent="habits" tinted={false} bodyClassName="pt-3">
      <ul className="flex flex-col gap-1">
        {archived.data.map((habit) => (
          <li key={habit.id} className="flex items-center justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-fg-muted">{habit.name}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Restore ${habit.name}`}
              disabled={update.isPending}
              onClick={() => update.mutate({ id: habit.id, archived: false })}
            >
              <RotateCcw aria-hidden strokeWidth={2} className="size-[18px]" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
