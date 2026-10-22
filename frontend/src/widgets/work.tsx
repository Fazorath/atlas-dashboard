/* Work's Widgets — module work. The "Readout" look: the shift as a mono
   reading over a 20-segment meter that fills as the shift goes by.

   No Source and so no Freshness: you are the upstream, entering each week
   by hand. A week nobody saved says so ("not entered") and a
   tap opens its Edit week sheet; an empty day in a saved week is a day off. */

import { Link } from "react-router-dom";

import { SegmentMeter } from "@/components/ui/segment-meter";
import { localDate, parseLocalDate } from "@/lib/habits";
import { cn } from "@/lib/utils";
import {
  compactRange,
  compactTime,
  durationParts,
  editLink,
  hoursLabel,
  mondayOf,
  nextLine,
  todayOf,
  untilShort,
  at,
  useNow,
  useWork,
  weekDays,
  weekdayShort,
  weekRange,
  type Shift,
  type Week,
} from "@/lib/work";
import { R, Units, WidgetCard } from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const PROBLEM = { chip: "Unavailable", text: "The Atlas API didn't answer." };
const NOT_ENTERED = {
  title: "This week isn't entered",
  text: "Tap to enter this week's shifts.",
};

/** "WED · OCT 14" for the header. */
function dayAside(iso: string): string {
  const d = parseLocalDate(iso);
  return `${weekdayShort(iso)} · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`.toUpperCase();
}

/** "Next Wed 12–6p · in 1d 3h", or a plain "Nothing entered ahead". */
function NextLine({ next, now }: { next: Shift | null; now: Date }) {
  if (!next) return <p className="text-[13px] text-fg-muted">Nothing entered ahead</p>;
  return (
    <p className="truncate text-[13px] text-fg-muted">
      Next <span className="tnum text-accent">{nextLine(next)}</span> · {untilShort(at(next.date, next.start), now)}
    </p>
  );
}

/* --- Shift --------------------------------------------------------------- */

function ShiftWidget({ size }: WidgetProps) {
  const work = useWork();
  const now = useNow();
  const state = work.isPending ? "loading" : work.isError ? "error" : "ready";
  const t = work.data ? todayOf(work.data, now) : null;
  const unknown = t?.kind === "unknown";
  const today = localDate(now);

  return (
    <WidgetCard
      title="Shift"
      area="work"
      state={state}
      problem={PROBLEM}
      empty={unknown ? NOT_ENTERED : null}
      to={unknown ? editLink(mondayOf(today)) : undefined}
      aside={size === "M" ? (t?.kind === "on" ? "on now" : dayAside(today)) : null}
    >
      {t && t.kind !== "unknown" ? (size === "S" ? <ShiftS t={t} /> : <ShiftM t={t} now={now} />) : null}
    </WidgetCard>
  );
}

type Known = Exclude<ReturnType<typeof todayOf>, { kind: "unknown" }>;

function ShiftS({ t }: { t: Known }) {
  return (
    <div className="mt-auto">
      {t.kind === "before" ? (
        <>
          <p className="tnum text-[22px] leading-none tracking-[-0.01em] lap:text-[24px]">
            {compactRange(t.shift.start, t.shift.end)}
          </p>
          <p className="mt-2 text-[13px] text-accent">{t.startsIn}</p>
        </>
      ) : t.kind === "on" ? (
        <>
          <p className={R.m}>
            <Units parts={durationParts(t.leftMinutes)} />
          </p>
          <p className="mt-2 text-[13px] text-fg-muted">
            <span className="text-accent">left</span> · to {compactTime(t.shift.end)}
          </p>
        </>
      ) : (
        <>
          <p className="text-[28px] leading-none font-semibold tracking-[-0.01em]">{t.kind === "done" ? "Done" : "Off"}</p>
          <p className="mt-2 truncate text-[13px] text-fg-muted">
            {t.next ? (
              <>
                next <span className="tnum text-accent">{weekdayShort(t.next.date)} {compactTime(t.next.start)}</span>
              </>
            ) : (
              "none ahead"
            )}
          </p>
        </>
      )}
    </div>
  );
}

function ShiftM({ t, now }: { t: Known; now: Date }) {
  if (t.kind === "off" || t.kind === "done") {
    return (
      <div className="mt-auto flex flex-col gap-3.5">
        <p className={cn(R.l, "font-sans font-semibold")}>{t.kind === "off" ? "Off today" : "Done"}</p>
        <NextLine next={t.next} now={now} />
      </div>
    );
  }
  const range = compactRange(t.shift.start, t.shift.end);
  return (
    <div className="mt-auto flex flex-col gap-3.5">
      <div className="flex items-end justify-between gap-3">
        {t.kind === "before" ? (
          <p className={R.l}>{range}</p>
        ) : (
          <p className={R.l}>
            <Units parts={durationParts(t.leftMinutes)} />
            <span className="text-[0.5em] text-fg-muted"> left</span>
          </p>
        )}
        <span className={cn(R.t, "shrink-0", t.kind === "before" ? "text-accent" : "text-fg-muted")}>
          {t.kind === "before" ? t.startsIn : `until ${compactTime(t.shift.end)}`}
        </span>
      </div>
      <SegmentMeter
        value={t.kind === "on" ? t.progress : 0}
        className="h-1.5"
        label={t.kind === "on" ? `${Math.round(t.progress * 100)}% of the shift done` : `Shift ${range}, not started`}
      />
    </div>
  );
}

/* --- Week ---------------------------------------------------------------- */

/** One reading per hour, so a 10-hour day fills the column. */
const HOUR_SEGMENTS = 10;

function HourCells({ minutes, today, vertical }: { minutes: number; today: boolean; vertical?: boolean }) {
  const lit = Math.min(HOUR_SEGMENTS, Math.round(minutes / 60));
  return (
    <div aria-hidden className={cn("flex gap-[2px]", vertical ? "w-3.5 flex-col-reverse" : "min-w-0 flex-1")}>
      {Array.from({ length: HOUR_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-[1px]",
            vertical ? "h-[5px]" : "h-[5px] flex-1",
            i < lit ? (today ? "bg-accent" : "bg-accent-track") : "bg-surface-2",
          )}
        />
      ))}
    </div>
  );
}

function WeekWidget({ size }: WidgetProps) {
  const work = useWork();
  const now = useNow(60_000);
  const state = work.isPending ? "loading" : work.isError ? "error" : "ready";
  const week = work.data?.this_week;
  const next = work.data?.next_week;
  const today = localDate(now);

  return (
    <WidgetCard
      title="Week"
      area="work"
      state={state}
      problem={PROBLEM}
      empty={week && !week.entered ? NOT_ENTERED : null}
      to={week && !week.entered ? editLink(week.week_start) : undefined}
      aside={week ? (size === "M" ? hoursLabel(week.total_minutes) : weekRange(week.week_start).toUpperCase()) : null}
    >
      {week && week.entered ? (
        size === "M" ? <WeekM week={week} today={today} /> : <WeekL week={week} next={next!} today={today} />
      ) : null}
    </WidgetCard>
  );
}

function rows(week: Week) {
  const byDate = new Map(week.shifts.map((s) => [s.date, s]));
  return weekDays(week.week_start).map((date) => ({ date, shift: byDate.get(date) ?? null }));
}

function WeekM({ week, today }: { week: Week; today: string }) {
  return (
    <ul className="mt-auto grid grid-cols-7 gap-2">
      {rows(week).map(({ date, shift }) => (
        <li
          key={date}
          className="flex flex-col items-center gap-1.5"
          aria-label={`${weekdayShort(date)}: ${shift ? `${compactRange(shift.start, shift.end)}, ${hoursLabel(shift.minutes)}` : "off"}`}
        >
          <HourCells minutes={shift?.minutes ?? 0} today={date === today} vertical />
          <span className={cn(R.t, date === today ? "text-accent" : "text-fg-muted")}>
            {weekdayShort(date).slice(0, 1)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeekL({ week, next, today }: { week: Week; next: Week; today: string }) {
  const count = week.shifts.length;
  return (
    <>
      <ul className="flex flex-col gap-[2px]">
        {rows(week).map(({ date, shift }) => (
          <li
            key={date}
            className={cn(
              "grid h-7 grid-cols-[34px_minmax(0,1fr)_64px_36px] items-center gap-2.5 rounded-row px-1.5",
              date === today && "bg-surface-2",
            )}
          >
            <span className={cn("text-[13px]", date === today ? "text-accent" : "text-fg-muted")}>{weekdayShort(date)}</span>
            <span className={cn("tnum truncate text-[13px]", shift ? "text-fg" : "text-fg-dim")}>
              {shift ? compactRange(shift.start, shift.end) : "off"}
            </span>
            <HourCells minutes={shift?.minutes ?? 0} today={date === today} />
            <span className={cn(R.t, "text-right text-fg-muted")}>{shift ? hoursLabel(shift.minutes) : "–"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-2.5">
        <p className={R.m}>
          {Number((week.total_minutes / 60).toFixed(2))}
          <span className="text-[0.5em] text-fg-muted">
            h · {count} {count === 1 ? "shift" : "shifts"}
          </span>
        </p>
        <Link
          to={next.entered ? "/work" : editLink(next.week_start)}
          className="flex items-center justify-between rounded-row bg-surface-2 px-3 py-2.5"
        >
          <span className="eyebrow">Next week</span>
          <span className="text-[13px] text-fg-muted">
            {next.entered ? (
              <span className="tnum">{hoursLabel(next.total_minutes)}</span>
            ) : (
              <>
                not entered <span className="text-accent">&rarr;</span>
              </>
            )}
          </span>
        </Link>
      </div>
    </>
  );
}

export const WORK_WIDGETS: WidgetDef[] = [
  { id: "work.shift", title: "Shift", area: "work", sizes: ["S", "M"], placement: "anywhere", render: ShiftWidget },
  { id: "work.week", title: "Week", area: "work", sizes: ["M", "L"], placement: "anywhere", render: WeekWidget },
];
