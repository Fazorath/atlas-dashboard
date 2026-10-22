/* School's Widgets — module canvas.

   Assignments are the only School thing you tick. A Class session is a time
   to show up: never ticked, never counted in "Due soon". */

import { Check } from "lucide-react";

import { SegmentMeter } from "@/components/ui/segment-meter";
import {
  daysFromToday,
  groupByDay,
  untilLabel,
  usePastAssignments,
  useSchool,
  useToggleAssignment,
  type Assignment,
  type ClassSession,
} from "@/lib/school";
import { cardState, SOURCE, useSources } from "@/lib/sources";
import { cn } from "@/lib/utils";
import { R, WidgetCard, type Problem } from "@/widgets/frame";
import type { BoardKey, WidgetDef, WidgetProps } from "@/widgets/types";

const PROBLEM: Problem = { chip: "Feed error", text: "Canvas feed isn't answering." };
const SETUP = "Paste your Canvas calendar feed URL into .env to list assignments here.";

function useCanvas() {
  const sources = useSources();
  const school = useSchool();
  const state = cardState(sources.stateOf(SOURCE.school), school, "archive");
  return { state, data: school.data?.configured ? school.data : null };
}

function shortDay(iso: string): string {
  const d = daysFromToday(iso);
  if (d < 0) return "Late";
  if (d === 0) return "Today";
  if (d === 1) return "Tmrw";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

function weekRange(): string {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + 6);
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${md(start)} – ${end.getDate()}`;
}

/* --- Due soon ------------------------------------------------------------ */

function DueSoon({ size }: WidgetProps) {
  const { state, data } = useCanvas();
  const toggle = useToggleAssignment();
  const open = data ? [...data.overdue, ...data.upcoming.filter((a) => !a.done)] : [];
  const total = data?.week_total ?? 0;
  const done = data?.week_done ?? 0;

  return (
    <WidgetCard
      title="Due soon"
      area="school"
      state={state}
      problem={PROBLEM}
      setup={SETUP}
      empty={
        data && total === 0 && open.length === 0
          ? { title: "Nothing due this week", text: "Canvas lists no open assignments for the next seven days." }
          : null
      }
      aside={size === "M" ? `${done}/${total} done` : size === "L" ? weekRange() : null}
    >
      {size === "S" ? (
        <div className="mt-auto flex flex-col gap-2.5">
          <div>
            <p className={R.l}>
              {done}
              <span className="text-[0.5em] text-fg-muted">/{total}</span>
            </p>
            <p className="mt-1 text-[12px] text-fg-muted lap:text-[13px]">done this week</p>
          </div>
          <SegmentMeter value={total ? done / total : 0} label={`${done} of ${total} done this week`} />
        </div>
      ) : size === "M" ? (
        open.length ? (
          <ul className="flex flex-col">
            {open.slice(0, 2).map((a) => (
              <TickRow key={a.ics_uid} a={a} onToggle={() => toggle.mutate(a.ics_uid)} />
            ))}
          </ul>
        ) : (
          <AllDone total={total} />
        )
      ) : (
        <WeekList open={open} onToggle={(uid) => toggle.mutate(uid)} done={done} total={total} />
      )}
    </WidgetCard>
  );
}

function AllDone({ total }: { total: number }) {
  return (
    <div className="mt-auto">
      <p className="text-[15px] font-medium">All done.</p>
      <p className="text-[13px] text-fg-muted">
        {total} {total === 1 ? "assignment" : "assignments"} this week, every one ticked.
      </p>
    </div>
  );
}

function WeekList({
  open,
  onToggle,
  done,
  total,
}: {
  open: Assignment[];
  onToggle: (uid: string) => void;
  done: number;
  total: number;
}) {
  if (open.length === 0) return <AllDone total={total} />;
  const groups = [
    { label: "Today", rows: open.filter((a) => daysFromToday(a.due_at) <= 0) },
    { label: "Tomorrow", rows: open.filter((a) => daysFromToday(a.due_at) === 1) },
    { label: "This week", rows: open.filter((a) => daysFromToday(a.due_at) > 1) },
  ].filter((g) => g.rows.length > 0);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        {groups.map((g) => (
          <section key={g.label} className="flex flex-col">
            <h3 className="label-caps text-fg-dim">{g.label}</h3>
            <ul className="flex flex-col">
              {g.rows.map((a) => (
                <TickRow key={a.ics_uid} a={a} onToggle={() => onToggle(a.ics_uid)} showDay={g.label === "This week"} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <SegmentMeter value={total ? done / total : 0} label={`${done} of ${total} done this week`} className="flex-1" />
        <span className={cn(R.t, "text-fg-muted")}>
          {done}/{total}
        </span>
      </div>
    </>
  );
}

/** One open assignment: a 44px tick target, title and course, its day. */
function TickRow({ a, onToggle, showDay = true }: { a: Assignment; onToggle: () => void; showDay?: boolean }) {
  return (
    <li className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={a.done}
        aria-label={`${a.done ? "Mark not done" : "Mark done"}: ${a.title}`}
        className="pressable -ml-2.5 grid size-11 shrink-0 place-items-center rounded-full"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-[22px] place-items-center rounded-full transition-colors",
            a.done ? "bg-accent text-bg" : "border-2 border-check-outline",
            a.overdue && "border-accent",
          )}
        >
          {a.done ? <Check strokeWidth={3} className="size-3" /> : null}
        </span>
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] leading-tight font-medium">{a.title}</span>
        {a.course ? (
          <span title={a.course_full ?? undefined} className={cn(R.t, "block truncate text-fg-muted")}>
            {a.course}
          </span>
        ) : null}
      </span>
      {showDay ? (
        <span className={cn(R.t, "shrink-0", a.overdue || daysFromToday(a.due_at) === 0 ? "text-accent" : "text-fg-muted")}>
          {shortDay(a.due_at)}
        </span>
      ) : null}
    </li>
  );
}

/* --- Next class ---------------------------------------------------------- */

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function NextClass({ size }: WidgetProps) {
  const { state, data } = useCanvas();
  const c = data?.next_class ?? null;

  return (
    <WidgetCard
      title="Next class"
      area="school"
      state={state}
      problem={{ ...PROBLEM, text: "Canvas feed isn't answering; the last known class isn't shown as current." }}
      setup={SETUP}
      empty={c ? null : { title: "No classes scheduled", text: "No Class sessions in the feed for the next 4 weeks." }}
      aside={size === "M" && c?.end_at ? `${time(c.start_at)} – ${time(c.end_at)}` : null}
    >
      {c ? <ClassBody c={c} size={size} /> : null}
    </WidgetCard>
  );
}

function ClassBody({ c, size }: { c: ClassSession; size: WidgetProps["size"] }) {
  const days = daysFromToday(c.start_at);
  const day =
    c.in_progress || days === 0
      ? "Today"
      : new Date(c.start_at).toLocaleDateString(undefined, { weekday: "short" });
  const date = new Date(c.start_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (size === "S") {
    return (
      <div className="mt-auto">
        <p className={cn(R.m, "lap:text-[32px]")}>{c.in_progress ? "Now" : time(c.start_at)}</p>
        <p className="mt-1.5 text-[13px]">
          <span className={days === 0 ? "text-accent" : ""}>{day}</span>
          <span className="text-fg-muted"> · {date}</span>
        </p>
      </div>
    );
  }

  const countdown = c.in_progress ? "on now" : days === 0 ? untilLabel(c.start_at) : longUntil(c.start_at);
  const inner = (
    <div className="flex min-h-0 flex-1 items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="flex items-baseline gap-3">
          <span className={R.l}>{c.in_progress ? "Now" : time(c.start_at)}</span>
          <span className={cn("text-[15px]", days === 0 ? "text-accent" : "text-fg-muted")}>{day}</span>
        </p>
        <p className="mt-2 truncate text-[14px] font-medium" title={c.course_full ?? undefined}>
          {[c.course, c.course_full && c.course_full !== c.course ? c.course_full : null].filter(Boolean).join(" · ") ||
            c.title}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {countdown ? <span className={cn(R.t, "text-fg-muted")}>{countdown}</span> : null}
        {c.join_url ? (
          <span className="tnum rounded-chip bg-accent-tint px-2 py-[3px] text-[12px] text-accent">Online</span>
        ) : null}
      </div>
    </div>
  );
  return c.join_url ? (
    <a href={c.join_url} target="_blank" rel="noreferrer" title="Join class" className="flex min-h-0 flex-1">
      {inner}
    </a>
  ) : (
    inner
  );
}

function longUntil(iso: string): string | null {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return null;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return d > 0 ? `in ${d} ${d === 1 ? "day" : "days"} ${h}h` : `in ${h}h ${minutes % 60}m`;
}

/** On Today, Next class is there only on a day you have class; otherwise it
 *  steps aside and the grid packs. Its own Area always shows it. */
function useNextClassAbsent(board: BoardKey): boolean {
  const { state, data } = useCanvas();
  if (board !== "today" || state !== "ready") return false;
  const c = data?.next_class;
  return !c || (!c.in_progress && daysFromToday(c.start_at) !== 0);
}

/* --- Coming up (Area-only) ----------------------------------------------- */

const AHEAD_DAYS = 21;

/** Three weeks ahead, grouped under each day so a row only says its time:
 *  far enough to see a midterm coming. */
function ComingUp({ size }: WidgetProps) {
  const sources = useSources();
  const school = useSchool(AHEAD_DAYS);
  const state = cardState(sources.stateOf(SOURCE.school), school, "archive");
  const toggle = useToggleAssignment();
  const items = school.data?.configured ? school.data.upcoming : [];
  const days = groupByDay(items);
  const open = items.filter((a) => !a.done).length;

  return (
    <WidgetCard
      title="Coming up"
      area="school"
      state={state}
      problem={PROBLEM}
      setup={SETUP}
      empty={items.length ? null : { title: "Nothing coming up", text: "Canvas lists nothing for the next three weeks." }}
      aside={`${open} open · 3 wk`}
    >
      <div
        className={cn(
          "min-h-0 flex-1 gap-x-8 gap-y-3 overflow-y-auto overscroll-contain",
          size === "XL" ? "flex flex-col lap:block lap:columns-2" : "flex flex-col",
        )}
      >
        {days.map((day) => (
          <section key={day.key} className="flex break-inside-avoid flex-col pb-2">
            <h3 className="label-caps text-fg-dim">{day.label}</h3>
            <ul className="flex flex-col">
              {day.items.map((a) => (
                <TickRow key={a.ics_uid} a={a} onToggle={() => toggle.mutate(a.ics_uid)} showDay={false} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </WidgetCard>
  );
}

/* --- Past assignments (Area-only) ---------------------------------------- */

const PAST_DAYS = 14;

/** The last two weeks, each done or missed — the part of the term Canvas's
 *  own feed has already forgotten. A tick here still counts: done late is
 *  done. XL adds a per-course tally and splits the list by week. */
function PastAssignments({ size }: WidgetProps) {
  const { state } = useCanvas();
  const past = usePastAssignments(PAST_DAYS);
  const toggle = useToggleAssignment();
  const items = [...(past.data ?? [])].sort((a, b) => b.due_at.localeCompare(a.due_at));
  const done = items.filter((a) => a.done).length;
  const missed = items.length - done;
  const pastState = state === "ready" && past.isPending ? "loading" : state === "ready" && past.isError ? "error" : state;

  const row = (a: Assignment) => <PastRow key={a.ics_uid} a={a} onToggle={() => toggle.mutate(a.ics_uid)} />;

  return (
    <WidgetCard
      title="Past assignments"
      area="school"
      state={pastState}
      problem={PROBLEM}
      setup={SETUP}
      empty={
        items.length
          ? null
          : {
              title: "Nothing was due in the last 2 weeks",
              text: "Past assignments appear here once their due date passes, marked done or missed.",
            }
      }
      aside={size === "XL" ? pastRange() : `${done}/${items.length} done · 2 wk`}
    >
      {size === "XL" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lap:flex-row lap:gap-8">
          <div className="flex min-w-0 flex-col gap-3 lap:w-[36%]">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={R.l}>
                {done}
                <span className="text-[0.5em] text-fg-muted">/{items.length}</span>
              </span>
              <span className="text-[13px] text-fg-muted">
                done in the last 2 weeks{missed ? ` · ${missed} missed` : ""}
              </span>
            </p>
            <SegmentMeter value={items.length ? done / items.length : 0} label={`${done} of ${items.length} done`} />
            <ul className="flex flex-col">
              {courseTally(items).map((c) => (
                <li key={c.course} className="flex items-baseline justify-between gap-3 border-b border-divider py-1.5 last:border-0">
                  <span className="truncate text-[13px]">{c.course}</span>
                  <span className={cn(R.t, c.done < c.total ? "text-accent" : "text-fg-muted")}>
                    {c.done}/{c.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain lap:border-l lap:border-divider lap:pl-8">
            {byWeek(items).map((w) => (
              <section key={w.label} className="flex flex-col">
                <h3 className="label-caps text-fg-dim">{w.label}</h3>
                <ul className="flex flex-col">{w.items.map(row)}</ul>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{items.map(row)}</ul>
      )}
    </WidgetCard>
  );
}

const monthDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function pastRange(): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (PAST_DAYS - 1));
  return `${monthDay(start)} – ${monthDay(end)}`;
}

function courseTally(items: Assignment[]) {
  const tally = new Map<string, { course: string; done: number; total: number }>();
  for (const a of items) {
    const course = a.course ?? "Other";
    const t = tally.get(course) ?? { course, done: 0, total: 0 };
    t.total++;
    if (a.done) t.done++;
    tally.set(course, t);
  }
  return [...tally.values()].sort((a, b) => a.course.localeCompare(b.course));
}

/** This calendar week (Monday first) and the one before. */
function byWeek(items: Assignment[]) {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  return [
    { label: `This week · since ${monthDay(monday)}`, items: items.filter((a) => new Date(a.due_at) >= monday) },
    {
      label: `Last week · ${monthDay(lastMonday)} – ${monthDay(sunday)}`,
      items: items.filter((a) => new Date(a.due_at) < monday && new Date(a.due_at) >= lastMonday),
    },
    { label: "Earlier", items: items.filter((a) => new Date(a.due_at) < lastMonday) },
  ].filter((w) => w.items.length > 0);
}

function PastRow({ a, onToggle }: { a: Assignment; onToggle: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-1 border-b border-divider last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={a.done}
        aria-label={`${a.done ? "Mark not done" : "Mark done"}: ${a.title}`}
        className="pressable -ml-2.5 grid size-10 shrink-0 place-items-center rounded-full"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-[20px] place-items-center rounded-full transition-colors",
            a.done ? "bg-accent text-bg" : "border-2 border-check-outline",
          )}
        >
          {a.done ? <Check strokeWidth={3} className="size-3" /> : null}
        </span>
      </button>
      <span className={cn(R.t, "w-12 shrink-0 text-fg-muted")}>{monthDay(new Date(a.due_at))}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px] leading-tight", a.done ? "text-fg-muted" : "text-fg")}>{a.title}</span>
      </span>
      {a.course ? (
        <span title={a.course_full ?? undefined} className={cn(R.t, "hidden shrink-0 text-fg-muted min-[420px]:inline")}>
          {a.course}
        </span>
      ) : null}
      {a.done ? null : <span className={cn(R.t, "ml-2 shrink-0 text-accent")}>missed</span>}
    </li>
  );
}

export const SCHOOL_WIDGETS: WidgetDef[] = [
  { id: "canvas.due_soon", title: "Due soon", area: "school", sizes: ["S", "M", "L"], placement: "anywhere", render: DueSoon },
  {
    id: "canvas.next_class",
    title: "Next class",
    area: "school",
    sizes: ["S", "M"],
    placement: "anywhere",
    render: NextClass,
    useAbsent: useNextClassAbsent,
  },
  { id: "canvas.coming_up", title: "Coming up", area: "school", sizes: ["L", "XL"], placement: "area", render: ComingUp },
  {
    id: "canvas.past_assignments",
    title: "Past assignments",
    area: "school",
    sizes: ["L", "XL"],
    placement: "area",
    render: PastAssignments,
  },
];
