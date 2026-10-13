/* Health's Widgets — module google_health. */

import { Hypnogram, StageBar } from "@/components/widgets/sleep-charts";
import { SegmentMeter } from "@/components/ui/segment-meter";
import { localDate, parseLocalDate } from "@/lib/habits";
import {
  clockTime,
  formatCount,
  formatMinutes,
  formatPercent,
  SLEEP_GOAL_MIN,
  stageMinutes,
  STAGES,
  useSleep,
  type Activity,
  type Night,
  type SleepSummary,
} from "@/lib/sleep";
import { cardState, SOURCE, useSources } from "@/lib/sources";
import { cn } from "@/lib/utils";
import {
  calendarWeek,
  MiniBars,
  minutesParts,
  R,
  Units,
  WidgetCard,
  type Problem,
} from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const STEPS_GOAL = 10_000;
const SETUP = "Add a Google Health OAuth client to .env, then connect on Status.";

function useHealth(days = 7) {
  const sources = useSources();
  const sleep = useSleep(days);
  const state = cardState(sources.stateOf(SOURCE.sleep), sleep, "archive");
  return { sleep, data: sleep.data?.configured ? sleep.data : null, state };
}

function problemOf(data: SleepSummary | null | undefined): Problem {
  const conn = data?.connection.state;
  if (conn === "expired" || conn === "disconnected") {
    return { chip: "Reconnect", text: "Google Health signed out." };
  }
  return { chip: "Sync failed", text: "Google Health didn't answer the last sync." };
}

/* --- Last night ---------------------------------------------------------- */

function LastNight({ size }: WidgetProps) {
  const { sleep, data, state } = useHealth();
  // Only the Night filed under today: an older one here would pass for today's.
  const night = data?.last_night?.date === localDate() ? data.last_night : null;
  const disconnected = data?.connection.state === "disconnected" || data?.connection.state === "expired";

  return (
    <WidgetCard
      title="Last night"
      area="health"
      state={disconnected && !night ? "error" : state}
      problem={problemOf(sleep.data)}
      setup={SETUP}
      empty={
        night
          ? null
          : { title: "No night yet", text: "Nights are filed under the morning you wake." }
      }
      aside={size !== "S" && night?.efficiency != null ? `${formatPercent(night.efficiency)} efficient` : null}
    >
      {night ? <LastNightBody night={night} size={size} data={data!} /> : null}
    </WidgetCard>
  );
}

function LastNightBody({ night, size, data }: { night: Night; size: WidgetProps["size"]; data: SleepSummary }) {
  const asleep = night.minutes_asleep ?? 0;
  const share = asleep / SLEEP_GOAL_MIN;
  const span = `${clockTime(night.start_at)} – ${clockTime(night.end_at)}`;
  const awake = night.minutes_awake ? ` · ${formatMinutes(night.minutes_awake)} awake` : "";

  const reading = (
    <div className="min-w-0">
      <p className={R.l}>
        <Units parts={minutesParts(asleep)} />
      </p>
      <p className={cn(R.t, "mt-1.5 truncate text-fg-muted")}>
        {span}
        {size === "XL" ? awake : ""}
      </p>
    </div>
  );

  const meter = (
    <div className="flex items-center gap-3">
      <SegmentMeter
        value={share}
        label={`${formatMinutes(asleep)} asleep of an ${SLEEP_GOAL_MIN / 60} hour goal`}
        className="flex-1"
      />
      <span className={cn(R.t, "whitespace-nowrap text-fg-muted")}>
        {Math.round(share * 100)}%{size === "S" ? "" : ` of ${SLEEP_GOAL_MIN / 60}h`}
      </span>
    </div>
  );

  if (size === "S") {
    return (
      <>
        {reading}
        {meter}
      </>
    );
  }

  if (size === "M") {
    return (
      <>
        <div className="flex min-w-0 items-end justify-between gap-4">
          {reading}
          <StageFigures night={night} compact />
        </div>
        {meter}
      </>
    );
  }

  if (size === "L") {
    return (
      <>
        {reading}
        <StageBar night={night} />
        {meter}
        <Hypnogram night={night} />
      </>
    );
  }

  // XL: numbers and stages on the left, the night on the right; on a phone
  // the same blocks stack and the week's context closes the column.
  const avg = data.avg_minutes_asleep;
  const delta = avg != null ? asleep - avg : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lap:flex-row lap:gap-8">
      <div className="flex min-w-0 flex-col gap-3.5 lap:w-[44%] lap:justify-between">
        {reading}
        {meter}
        <StageBar night={night} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 lap:border-l lap:border-divider lap:pl-8">
        <p className="label-caps text-fg-muted">Through the night</p>
        <Hypnogram night={night} />
        {avg != null ? (
          <p className={cn(R.t, "mt-auto text-fg-muted")}>
            vs last 7 nights · avg {formatMinutes(avg)} · this night{" "}
            <span className="text-fg">
              {delta != null && delta >= 0 ? "+" : "−"}
              {formatMinutes(Math.abs(delta ?? 0))}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Deep / Light / REM / Awake in two columns. */
function StageFigures({ night, compact = false }: { night: Night; compact?: boolean }) {
  const mins = stageMinutes(night);
  return (
    <dl className={cn("grid shrink-0 grid-cols-2 gap-x-4 gap-y-1", compact && "hidden min-[420px]:grid")}>
      {STAGES.map((s) => (
        <div key={s.kind} className="flex items-baseline gap-2">
          <dt className="text-[11px] text-fg-muted">{s.label}</dt>
          <dd className={cn(R.t, "text-fg")}>{formatMinutes(mins[s.kind]) ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --- Sleep week ---------------------------------------------------------- */

function SleepWeek({ size }: WidgetProps) {
  const { sleep, data, state } = useHealth(size === "XL" ? 30 : 7);
  const byDate = new Map((data?.nights ?? []).map((n) => [n.date, n.minutes_asleep ?? 0]));
  const week = calendarWeek().map((d) => {
    const key = localDate(d.date);
    return { ...d, key, minutes: byDate.get(key) ?? 0 };
  });
  const recorded = week.filter((d) => d.minutes > 0);
  const avg = recorded.length
    ? recorded.reduce((a, d) => a + d.minutes, 0) / recorded.length
    : null;
  const atGoal = recorded.filter((d) => d.minutes >= SLEEP_GOAL_MIN).length;

  const bars = week.map((d) => ({
    key: d.key,
    label: size === "M" ? "" : d.label,
    value: d.minutes,
    highlight: d.isToday,
    title: `${d.label}: ${formatMinutes(d.minutes) ?? "no night recorded"}`,
  }));

  return (
    <WidgetCard
      title="Sleep week"
      area="health"
      state={state}
      problem={problemOf(sleep.data)}
      setup={SETUP}
      empty={
        recorded.length === 0
          ? { title: "No nights yet", text: "Nights are filed under the morning you wake." }
          : null
      }
      aside={avg != null ? `avg ${formatMinutes(avg)}` : null}
    >
      {size === "M" ? (
        <MiniBars bars={bars} goal={SLEEP_GOAL_MIN} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lap:flex-row lap:gap-8">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <MiniBars bars={bars} goal={SLEEP_GOAL_MIN} />
            <dl className="grid grid-cols-3 gap-3 border-t border-divider pt-3">
              <Figure label="avg asleep" value={formatMinutes(avg) ?? "—"} />
              <Figure label="efficiency" value={formatPercent(data?.avg_efficiency) ?? "—"} />
              <Figure label="nights ≥8h" value={`${atGoal}/7`} />
            </dl>
          </div>
          {size === "XL" ? <ThirtyNights nights={data?.nights ?? []} /> : null}
        </div>
      )}
    </WidgetCard>
  );
}

function ThirtyNights({ nights }: { nights: Night[] }) {
  const byDate = new Map(nights.map((n) => [n.date, n.minutes_asleep ?? 0]));
  const today = parseLocalDate(localDate());
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    return d;
  });
  const values = days.map((d) => byDate.get(localDate(d)) ?? 0);
  const recorded = values.filter((v) => v > 0);
  const avg = recorded.length ? recorded.reduce((a, b) => a + b, 0) / recorded.length : null;
  const atGoal = recorded.filter((v) => v >= SLEEP_GOAL_MIN).length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lap:border-l lap:border-divider lap:pl-8">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-caps text-fg-muted">Last 30 nights</p>
        <p className={cn(R.t, "text-fg-muted")}>
          avg {formatMinutes(avg) ?? "—"} · ≥8h {atGoal}/30
        </p>
      </div>
      <MiniBars
        goal={SLEEP_GOAL_MIN}
        labelEvery={7}
        bars={days.map((d, i) => ({
          key: localDate(d),
          label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          value: values[i],
          highlight: i === 29,
          title: `${d.toLocaleDateString()}: ${formatMinutes(values[i]) ?? "no night recorded"}`,
        }))}
      />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-fg-muted lap:text-[12px]">{label}</dt>
      <dd className={cn(R.xs, "mt-1")}>{value}</dd>
    </div>
  );
}

/* --- Activity ------------------------------------------------------------ */

function ActivityWidget({ size }: WidgetProps) {
  const { sleep, data, state } = useHealth();
  // Today's figures only; yesterday's steps are not "steps today".
  const today = data?.activity?.date === localDate() ? data.activity : null;
  const days = data?.activity_days ?? [];

  return (
    <WidgetCard
      title="Activity"
      area="health"
      state={state}
      problem={problemOf(sleep.data)}
      setup={SETUP}
      empty={today ? null : { title: "No activity yet today", text: "The Source hasn't sent today's figures." }}
      aside={size === "L" ? "today so far" : null}
    >
      {today ? <ActivityBody today={today} days={days} size={size} /> : null}
    </WidgetCard>
  );
}

function avgOf(days: Activity[], pick: (a: Activity) => number | null): number | null {
  const values = days.map(pick).filter((v): v is number => v != null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function ActivityBody({ today, days, size }: { today: Activity; days: Activity[]; size: WidgetProps["size"] }) {
  const stepsShare = today.steps != null ? today.steps / STEPS_GOAL : 0;
  const avgHr = avgOf(days, (a) => a.resting_hr);

  const steps = (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div>
        <p className={R.l}>{formatCount(today.steps) ?? "—"}</p>
        <p className="mt-1 text-[12px] text-fg-muted lap:text-[13px]">steps today</p>
      </div>
      <div className="flex items-center gap-3">
        <SegmentMeter value={stepsShare} label={`${Math.round(stepsShare * 100)} percent of 10,000 steps`} className="flex-1" />
        <span className={cn(R.t, "whitespace-nowrap text-fg-muted")}>{Math.round(stepsShare * 100)}%</span>
      </div>
    </div>
  );

  if (size === "S") return <div className="mt-auto">{steps}</div>;

  if (size === "M") {
    return (
      <div className="mt-auto grid grid-cols-2 gap-6">
        {steps}
        <div className="flex min-w-0 flex-col justify-end border-l border-divider pl-6">
          <p className={R.l}>
            {today.resting_hr != null ? <Units parts={[today.resting_hr, "bpm"]} /> : "—"}
          </p>
          <p className="mt-1 truncate text-[12px] text-fg-muted lap:text-[13px]">resting heart rate</p>
          {avgHr != null ? (
            <p className={cn(R.t, "mt-2.5 text-fg-muted")}>7-day avg {Math.round(avgHr)}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const cells = [
    { label: "Steps", value: formatCount(today.steps), avg: formatCount(roundOrNull(avgOf(days, (a) => a.steps))) },
    {
      label: "Resting heart rate",
      value: today.resting_hr != null ? `${today.resting_hr} bpm` : null,
      avg: avgHr != null ? `${Math.round(avgHr)}` : null,
    },
    {
      label: "Active minutes",
      value: formatMinutes(today.active_minutes),
      avg: formatMinutes(avgOf(days, (a) => a.active_minutes)),
    },
    {
      label: "Calories",
      value: formatCount(roundOrNull(today.calories_kcal)),
      avg: formatCount(roundOrNull(avgOf(days, (a) => a.calories_kcal))),
    },
  ];
  return (
    <ul className="grid flex-1 grid-cols-2 gap-2">
      {cells.map((c) => (
        <li key={c.label} className="flex min-w-0 flex-col justify-between gap-1 rounded-row bg-surface-2 p-3 lap:p-4">
          <span className="label-caps truncate text-fg-muted">{c.label}</span>
          <span className={R.m}>{c.value ?? "—"}</span>
          <span className={cn(R.t, "truncate text-fg-muted")}>{c.avg ? `7-day avg ${c.avg}` : " "}</span>
        </li>
      ))}
    </ul>
  );
}

function roundOrNull(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

/* --- Sleep history (Area-only) ------------------------------------------- */

const HISTORY = 30;
const HISTORY_WEEKS = 4;

const shortDate = (d: Date, weekday = false) =>
  d.toLocaleDateString(undefined, { weekday: weekday ? "short" : undefined, month: "short", day: "numeric" });

/** Thirty nights against the goal, the best and worst called out; XL adds
 *  the last four calendar weeks' averages. A missing night stays a gap. */
function SleepHistory({ size }: WidgetProps) {
  const { sleep, data, state } = useHealth(HISTORY);
  const byDate = new Map((data?.nights ?? []).map((n) => [n.date, n.minutes_asleep ?? 0]));
  const today = parseLocalDate(localDate());
  const days = Array.from({ length: HISTORY }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (HISTORY - 1 - i));
    return { date: d, key: localDate(d), minutes: byDate.get(localDate(d)) ?? 0 };
  });
  const recorded = days.filter((d) => d.minutes > 0);
  const avg = recorded.length ? recorded.reduce((a, d) => a + d.minutes, 0) / recorded.length : null;
  const atGoal = recorded.filter((d) => d.minutes >= SLEEP_GOAL_MIN).length;
  const best = recorded.reduce<(typeof days)[number] | null>((b, d) => (!b || d.minutes > b.minutes ? d : b), null);
  const worst = recorded.reduce<(typeof days)[number] | null>((w, d) => (!w || d.minutes < w.minutes ? d : w), null);

  const chart = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className={R.l}>
            <Units parts={minutesParts(avg ?? 0)} />
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">{HISTORY}-night avg</p>
        </div>
        <dl className="flex gap-5">
          <Figure label="≥8h" value={`${atGoal}/${HISTORY}`} />
          <Figure label="best" value={formatMinutes(best?.minutes) ?? "—"} />
          <Figure label="worst" value={formatMinutes(worst?.minutes) ?? "—"} />
        </dl>
      </div>
      <MiniBars
        goal={SLEEP_GOAL_MIN}
        labelEvery={7}
        bars={days.map((d, i) => ({
          key: d.key,
          label: shortDate(d.date),
          value: d.minutes,
          highlight: d.key === best?.key || i === HISTORY - 1,
          title: `${shortDate(d.date, true)}: ${formatMinutes(d.minutes) ?? "no night recorded"}`,
        }))}
      />
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Best", night: best },
          { label: "Worst", night: worst },
        ].map(({ label, night }) => (
          <p key={label} className="flex min-w-0 items-baseline justify-between gap-2 rounded-row bg-surface-2 px-3 py-2">
            <span className="truncate text-[12px] text-fg-muted">
              {label} · {night ? shortDate(night.date, true) : "—"}
            </span>
            <span className={R.xs}>{formatMinutes(night?.minutes) ?? "—"}</span>
          </p>
        ))}
      </div>
    </div>
  );

  return (
    <WidgetCard
      title="Sleep history"
      area="health"
      state={state}
      problem={problemOf(sleep.data)}
      setup={SETUP}
      empty={
        recorded.length
          ? null
          : { title: "No nights yet", text: "Nights are filed under the morning you wake. History fills in as they sync." }
      }
      aside={`${HISTORY} nights`}
    >
      {size === "XL" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lap:flex-row lap:gap-8">
          {chart}
          <WeeklyAverages minutes={byDate} />
        </div>
      ) : (
        chart
      )}
    </WidgetCard>
  );
}

function WeeklyAverages({ minutes }: { minutes: Map<string, number> }) {
  const monday = calendarWeek()[0].date;
  const weeks = Array.from({ length: HISTORY_WEEKS }, (_, w) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7 * (HISTORY_WEEKS - 1 - w));
    const nights = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return minutes.get(localDate(d)) ?? 0;
    }).filter((m) => m > 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const range =
      start.getMonth() === end.getMonth()
        ? `${shortDate(start)} – ${end.getDate()}`
        : `${shortDate(start)} – ${shortDate(end)}`;
    const avg = nights.length ? nights.reduce((a, m) => a + m, 0) / nights.length : null;
    return { range, avg, atGoal: nights.filter((m) => m >= SLEEP_GOAL_MIN).length };
  });

  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-divider pt-3 lap:w-[38%] lap:border-t-0 lap:border-l lap:pt-0 lap:pl-8">
      <p className="label-caps text-fg-muted">Weekly averages</p>
      <ul className="flex flex-1 flex-col justify-around gap-2.5">
        {weeks.map((w) => (
          <li key={w.range} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px]">{w.range}</span>
              <span className={cn(R.t, "shrink-0 text-fg-muted")}>
                ≥8h {w.atGoal}/7 <span className="ml-2 text-fg">{formatMinutes(w.avg) ?? "—"}</span>
              </span>
            </div>
            <span className="h-1.5 overflow-hidden rounded-full bg-accent-track">
              <span
                className="value-transition block h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, ((w.avg ?? 0) / SLEEP_GOAL_MIN) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className={cn(R.t, "text-fg-dim")}>bar = share of the {SLEEP_GOAL_MIN / 60}h goal</p>
    </div>
  );
}

export const HEALTH_WIDGETS: WidgetDef[] = [
  {
    id: "google_health.last_night",
    title: "Last night",
    area: "health",
    sizes: ["S", "M", "L", "XL"],
    placement: "anywhere",
    render: LastNight,
  },
  {
    id: "google_health.sleep_week",
    title: "Sleep week",
    area: "health",
    sizes: ["M", "L", "XL"],
    placement: "anywhere",
    render: SleepWeek,
  },
  {
    id: "google_health.activity",
    title: "Activity",
    area: "health",
    sizes: ["S", "M", "L"],
    placement: "anywhere",
    render: ActivityWidget,
  },
  {
    id: "google_health.sleep_history",
    title: "Sleep history",
    area: "health",
    sizes: ["L", "XL"],
    placement: "area",
    render: SleepHistory,
  },
];
