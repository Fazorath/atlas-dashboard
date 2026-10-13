/* Manage habits: the sheet behind the Habits header's Manage button. Adding,
   renaming, archiving and restoring live here, and so does the Measured
   link (ADR 0001): a Habit tied to a Health figure and a target, which Atlas
   ticks when that day's data arrives. Ticking stays on the Board's Widgets. */

import { useQuery } from "@tanstack/react-query";
import { Archive, HeartPulse, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import {
  useCreateHabit,
  useHabits,
  useMetrics,
  useUpdateHabit,
  type Habit,
  type HabitDefinition,
} from "@/lib/habits";
import { habitAccent } from "@/lib/sections";

const inputClass =
  "h-11 min-w-0 flex-1 rounded-[16px] bg-surface-2 px-4 text-[15px] font-semibold text-fg " +
  "placeholder:text-fg-dim outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function ManageHabits({ onClose }: { onClose: () => void }) {
  const habits = useHabits();

  return (
    <Sheet eyebrow="Habits" title="Manage habits" onClose={onClose} className="max-w-[600px]">
      <div data-accent="habits" className="flex flex-col gap-6 overflow-y-auto px-4 py-5 lap:px-6">
        <AddHabit />

        <section className="flex flex-col gap-2.5" aria-label="Your habits">
          <h3 className="label-caps text-fg-muted">Your habits</h3>
          {habits.isError ? (
            <p className="text-[13px] text-fg-muted">Couldn&rsquo;t reach the habits API.</p>
          ) : habits.habits.length === 0 && !habits.isPending ? (
            <p className="text-[13px] text-fg-muted">
              No habits yet. Add one — it&rsquo;s a single tick a day, and streaks count from the first.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {habits.habits.map((habit, i) => (
                <li key={habit.id}>
                  <EditRow habit={habit} index={i} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <ArchivedHabits />
      </div>
    </Sheet>
  );
}

function AddHabit() {
  const [name, setName] = useState("");
  const create = useCreateHabit();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed }, { onSuccess: () => setName("") });
  };

  return (
    <section className="flex flex-col gap-2.5" aria-label="New habit">
      <h3 className="label-caps text-fg-muted">New habit</h3>
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Read 20 pages"
          aria-label="Habit name"
          className={inputClass}
        />
        <Button type="submit" variant="solid" disabled={!name.trim() || create.isPending}>
          Add
        </Button>
      </form>
      {create.isError ? (
        <p className="text-[13px] font-semibold text-habits-soft">Couldn&rsquo;t add that — {create.error.message}</p>
      ) : null}
    </section>
  );
}

/** Rename saves on Enter or blur; archive hides the habit but keeps its ticks.
    The second line links it to a Health figure — or unlinks it. */
function EditRow({ habit, index }: { habit: Habit; index: number }) {
  const [name, setName] = useState(habit.name);
  const update = useUpdateHabit();

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setName(habit.name);
    if (trimmed !== habit.name) update.mutate({ id: habit.id, name: trimmed });
  };

  return (
    <div data-accent={habitAccent(index)} className="flex w-full flex-col gap-2 rounded-row bg-surface px-3.5 py-3">
      <div className="flex items-center gap-2">
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
      <MetricLink habit={habit} />
    </div>
  );
}

/** "Tick from Health: Steps ≥ 10000". Changing either saves at once, and Atlas
    re-checks the last 90 days (never before the habit was created). */
function MetricLink({ habit }: { habit: Habit }) {
  const metrics = useMetrics();
  const update = useUpdateHabit();
  const [target, setTarget] = useState(habit.target != null ? String(habit.target) : "");
  const metric = metrics.data?.find((m) => m.key === habit.metric);

  const saveTarget = () => {
    const value = Number(target);
    if (!habit.metric || !Number.isFinite(value) || value <= 0) {
      return setTarget(habit.target != null ? String(habit.target) : "");
    }
    if (value !== habit.target) update.mutate({ id: habit.id, target: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pl-1 text-[13px] font-semibold text-fg-muted">
      <HeartPulse aria-hidden strokeWidth={2.2} className="size-4" />
      <label htmlFor={`metric-${habit.id}`}>Tick from Health</label>
      <select
        id={`metric-${habit.id}`}
        value={habit.metric ?? ""}
        disabled={update.isPending || !metrics.data}
        onChange={(e) => {
          const key = e.target.value || null;
          const next = metrics.data?.find((m) => m.key === key);
          setTarget(next ? String(next.default_target) : "");
          update.mutate({ id: habit.id, metric: key });
        }}
        className="h-9 rounded-full bg-surface-2 px-3 text-[13px] font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <option value="">Off — I tick it</option>
        {metrics.data?.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
      {metric ? (
        <>
          <span aria-hidden>≥</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={metric.unit === "h" ? 0.5 : 1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={saveTarget}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label={`${metric.label} target`}
            className="h-9 w-24 rounded-full bg-surface-2 px-3 text-[13px] font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <span>{metric.unit}</span>
        </>
      ) : null}
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
    <section className="flex flex-col gap-1.5" aria-label="Archived">
      <h3 className="label-caps text-fg-muted">Archived</h3>
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
    </section>
  );
}
