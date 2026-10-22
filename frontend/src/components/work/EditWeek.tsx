/* Edit week: the sheet behind the Work header's button, and where a "not
   entered" tap lands. The "Timeline" look — each day is a chip you tap on or
   off, its shift drawn as a block on one shared day ruler, and two time
   inputs to set it — so a week typed in from a schedule reads back at a glance.

   Saving sends the whole week: a day left off is a day off, and the week
   counts as entered from then on. Clear week makes it "not entered" again. */

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  addDays,
  hoursLabel,
  toMinutes,
  useClearWeek,
  useSaveWeek,
  useWeek,
  weekDays,
  weekdayShort,
  weekQuery,
  weekRange,
  type Week,
} from "@/lib/work";

interface Row {
  date: string;
  on: boolean;
  start: string;
  end: string;
}

const DEFAULT = { start: "09:00", end: "17:00" };

function rowsFrom(start: string, week: Week | undefined, shiftDays = 0): Row[] {
  const byDate = new Map((week?.shifts ?? []).map((s) => [addDays(s.date, shiftDays), s]));
  return weekDays(start).map((date) => {
    const s = byDate.get(date);
    return s ? { date, on: true, start: s.start, end: s.end } : { date, on: false, ...DEFAULT };
  });
}

const valid = (r: Row) => !r.on || toMinutes(r.end) > toMinutes(r.start);
const minutesOf = (r: Row) => (r.on && valid(r) ? toMinutes(r.end) - toMinutes(r.start) : 0);

const timeInput =
  "tnum h-9 w-[118px] rounded-row bg-surface-2 px-2 text-[13px] text-fg outline-none [color-scheme:dark] " +
  "focus-visible:ring-2 focus-visible:ring-accent";

export function EditWeek({ initialWeek, onClose }: { initialWeek: string; onClose: () => void }) {
  const [start, setStart] = useState(initialWeek);
  const week = useWeek(start);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const client = useQueryClient();
  const save = useSaveWeek();
  const clear = useClearWeek();
  const [copyNote, setCopyNote] = useState<string | null>(null);

  // Fill the form once per week shown, so a background refetch never wipes
  // what you've typed.
  useEffect(() => {
    if (week.data && loadedFor !== start) {
      setRows(rowsFrom(start, week.data));
      setLoadedFor(start);
      setCopyNote(null);
    }
  }, [week.data, start, loadedFor]);

  const step = (n: number) => {
    setRows(null);
    setStart(addDays(start, n * 7));
  };

  const copyLast = async () => {
    const prev = await client.fetchQuery(weekQuery(addDays(start, -7)));
    if (!prev.entered) {
      setCopyNote(`${weekRange(prev.week_start)} wasn't entered either.`);
      return;
    }
    setRows(rowsFrom(start, prev, 7));
    setCopyNote(`Copied from ${weekRange(prev.week_start)} — fix what changed.`);
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const toggle = (i: number) => {
    if (!rows) return;
    const r = rows[i];
    if (r.on) return update(i, { on: false });
    // A day switched on borrows the nearest shift above it: most weeks repeat.
    const prior = [...rows.slice(0, i)].reverse().find((x) => x.on && valid(x));
    update(i, { on: true, start: prior?.start ?? r.start, end: prior?.end ?? r.end });
  };

  const bad = rows?.filter((r) => !valid(r)) ?? [];
  const total = rows?.reduce((sum, r) => sum + minutesOf(r), 0) ?? 0;
  const count = rows?.filter((r) => r.on).length ?? 0;

  // One ruler for the whole week, 6a–10p unless a shift runs outside it.
  const on = rows?.filter((r) => r.on && valid(r)) ?? [];
  const lo = Math.min(6 * 60, ...on.map((r) => Math.floor(toMinutes(r.start) / 60) * 60));
  const hi = Math.max(22 * 60, ...on.map((r) => Math.ceil(toMinutes(r.end) / 60) * 60));
  const pct = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`;
  const ticks: number[] = [];
  for (let m = Math.ceil(lo / 240) * 240; m <= hi; m += 240) ticks.push(m);

  const submit = () => {
    if (!rows || bad.length) return;
    save.mutate(
      { start, shifts: rows.filter((r) => r.on).map(({ date, start: s, end }) => ({ date, start: s, end })) },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet eyebrow="Work" title="Edit week" onClose={onClose} className="max-w-[600px]">
      <div data-accent="work" className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 lap:px-6 lap:py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="neutral" size="icon" className="size-9" onClick={() => step(-1)} aria-label="Previous week">
            <ChevronLeft aria-hidden strokeWidth={2.2} className="size-4" />
          </Button>
          <p className="min-w-[132px] text-center text-[16px] font-semibold" aria-live="polite">
            Week of {weekRange(start)}
          </p>
          <Button variant="neutral" size="icon" className="size-9" onClick={() => step(1)} aria-label="Next week">
            <ChevronRight aria-hidden strokeWidth={2.2} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className="ml-auto h-9 rounded-row border border-border-subtle px-3 text-[13px] font-medium text-fg"
            onClick={copyLast}
            disabled={!rows}
          >
            <Copy aria-hidden strokeWidth={2.2} className="size-3.5" />
            Copy last week
          </Button>
        </div>
        {copyNote ? <p className="-mt-1 text-[13px] text-fg-muted">{copyNote}</p> : null}

        {week.isError ? (
          <p className="text-[13px] text-fg-muted">Couldn&rsquo;t reach the work API.</p>
        ) : !rows ? (
          <div aria-label="Loading" className="h-[322px]" />
        ) : (
          <div className="flex flex-col gap-1.5">
            <div aria-hidden className="grid grid-cols-[44px_minmax(0,1fr)_248px] gap-2.5 max-[479px]:hidden">
              <span />
              <div className="tnum relative h-3 text-[10px] text-fg-dim">
                {ticks.map((m, i) => (
                  <span
                    key={m}
                    className={cn("absolute", i > 0 && "-translate-x-1/2", i === ticks.length - 1 && m === hi && "-translate-x-full")}
                    style={{ left: pct(m) }}
                  >
                    {fmtHour(m)}
                  </span>
                ))}
              </div>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.date}
                className="grid min-h-11 grid-cols-[44px_minmax(0,1fr)_248px] items-center gap-2.5 max-[479px]:grid-cols-[44px_minmax(0,1fr)] max-[479px]:gap-y-1.5 max-[479px]:py-1"
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={r.on}
                  aria-label={`${weekdayShort(r.date)}: ${r.on ? "working — tap for a day off" : "off — tap to add a shift"}`}
                  className={cn(
                    "pressable h-9 rounded-row text-[12px] font-semibold transition-colors",
                    r.on ? "bg-accent text-bg" : "bg-surface-2 text-fg-muted",
                  )}
                >
                  {weekdayShort(r.date)}
                </button>
                <div
                  aria-hidden
                  className="relative h-[22px] rounded-[3px] bg-surface max-[479px]:col-start-2 max-[479px]:row-start-2 max-[479px]:h-1.5"
                >
                  {r.on && valid(r) ? (
                    <span
                      className="absolute inset-y-0 rounded-[3px] bg-accent-track"
                      style={{ left: pct(toMinutes(r.start)), width: `calc(${pct(toMinutes(r.end))} - ${pct(toMinutes(r.start))})` }}
                    />
                  ) : null}
                </div>
                {r.on ? (
                  <div className="flex items-center gap-1.5 max-[479px]:col-start-2 max-[479px]:row-start-1">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => e.target.value && update(i, { start: e.target.value })}
                      aria-label={`${weekdayShort(r.date)} start`}
                      className={timeInput}
                    />
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => e.target.value && update(i, { end: e.target.value })}
                      aria-label={`${weekdayShort(r.date)} end`}
                      aria-invalid={!valid(r)}
                      className={cn(timeInput, !valid(r) && "ring-2 ring-due")}
                    />
                  </div>
                ) : (
                  <span className="text-[13px] text-fg-dim max-[479px]:col-start-2 max-[479px]:row-start-1">off — tap the day to add</span>
                )}
              </div>
            ))}
          </div>
        )}

        {bad.length ? (
          <p className="text-[13px] text-due" role="alert">
            {bad.map((r) => weekdayShort(r.date)).join(", ")} {bad.length === 1 ? "ends" : "end"} before{" "}
            {bad.length === 1 ? "it starts" : "they start"} — shifts can&rsquo;t run past midnight.
          </p>
        ) : null}
        {save.isError || clear.isError ? (
          <p className="text-[13px] text-due" role="alert">
            Couldn&rsquo;t save — {(save.error ?? clear.error)?.message}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center gap-3 border-t border-divider px-4 py-3 lap:px-6" data-accent="work">
        <span className="tnum text-[14px]">
          {hoursLabel(total)} <span className="text-fg-muted">· {count} {count === 1 ? "shift" : "shifts"}</span>
        </span>
        {week.data?.entered ? (
          <Button
            variant="ghost"
            className="ml-auto text-[13px] font-medium"
            disabled={clear.isPending}
            onClick={() => clear.mutate(start, { onSuccess: onClose })}
          >
            Clear week
          </Button>
        ) : null}
        <Button
          variant="solid"
          className={cn("rounded-row px-5", !week.data?.entered && "ml-auto")}
          disabled={!rows || bad.length > 0 || save.isPending}
          onClick={submit}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </footer>
    </Sheet>
  );
}

/** Ruler labels: "6a", "2p", "10p". */
function fmtHour(minutes: number): string {
  const h = Math.round(minutes / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}
