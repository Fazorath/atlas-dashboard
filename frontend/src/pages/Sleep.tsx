/* Sleep — Phase 7. Fitbit, through the Google Health API.

   One hero for the night you just had — how long, how well, and its shape as a
   hypnogram — then the week of nights, the day's activity, and the connection
   to Google, which in Testing mode needs a click once a week.

   Everything reads Atlas's archive, so an expired sign-in never empties the
   screen: last week's nights stay up while the connection card asks for the
   click. Until the OAuth client exists, the page is the shared SectionScreen
   skeleton, like every other unconfigured section. */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { SectionScreen } from "@/components/layout/SectionScreen";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ConnectionCard } from "@/components/widgets/fitbit-connection";
import { Hypnogram, NightBars, StageBar } from "@/components/widgets/sleep-charts";
import { SourceChip, SourcePlaceholder } from "@/components/widgets/source-card";
import { localDate, parseLocalDate } from "@/lib/habits";
import { NAV_SECTIONS } from "@/lib/sections";
import {
  clockTime,
  formatCount,
  formatMinutes,
  formatPercent,
  nightLabel,
  SLEEP_GOAL_MIN,
  useSleep,
  type Activity,
  type Night,
  type SleepSummary,
} from "@/lib/sleep";
import { cardState, SOURCE, useSources, type SourceState } from "@/lib/sources";

const SLEEP_ICON = NAV_SECTIONS[1].icon;
const WEEK = 7;

export function Sleep() {
  const sources = useSources();
  const sleep = useSleep(WEEK);
  const state = cardState(sources.stateOf(SOURCE.sleep), sleep, "archive");
  const flash = useOAuthFlash();
  const data = sleep.data?.configured ? sleep.data : null;

  if (!data) {
    return (
      <SectionScreen
        title="Sleep"
        accent="sleep"
        icon={SLEEP_ICON}
        heroTitle="Last night"
        source="Google Health"
        hint="Fitbit sleep and daily activity arrive through the Google Health API — add its OAuth client to .env to switch this on."
        state={state}
        scaffold={<ProgressRing size={88} stroke={10} value={0} muted />}
        listTitle="This week"
        listHint="Seven nights of duration and sleep stages will list here."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[14px] lap:gap-5">
      <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
        Sleep
      </h1>

      {/* Before the first night lands, connecting is the only thing to do —
          so the connection leads instead of trailing. */}
      {data.last_night ? null : (
        <ConnectionCard conn={data.connection} flash={flash} fetchedAt={data.fetched_at} />
      )}

      <LastNight data={data} state={state} />
      {data.nights.length > 0 ? <WeekCard data={data} /> : null}
      {data.activity ? <ActivityCard today={data.activity} days={data.activity_days} /> : null}

      {data.last_night ? (
        <ConnectionCard conn={data.connection} flash={flash} fetchedAt={data.fetched_at} />
      ) : null}
    </div>
  );
}

/** Google's redirect comes back as /sleep?connected=1 or ?oauth_error=…; read
    it once, then drop it from the address so a refresh doesn't repeat it. */
function useOAuthFlash() {
  const [params, setParams] = useSearchParams();
  const [flash] = useState(() => {
    if (params.get("connected")) return { ok: true, message: "Connected — your last 90 days are in." };
    const error = params.get("oauth_error");
    return error ? { ok: false, message: error } : null;
  });
  useEffect(() => {
    if (params.has("connected") || params.has("oauth_error")) setParams({}, { replace: true });
  }, [params, setParams]);
  return flash;
}

function LastNight({ data, state }: { data: SleepSummary; state: SourceState }) {
  const night = data.last_night;
  // A failed sync is the connection card's to explain; the hero keeps showing
  // the archive, so only a loading or unreadable API earns it a chip.
  const chip =
    state === "loading" || (state === "error" && !night) ? (
      <SourceChip state={state} source="Google Health" />
    ) : null;

  if (!night) {
    return (
      <Card title="Last night" accent="sleep" icon={SLEEP_ICON} aside={chip} bodyClassName="gap-5 pt-4">
        <div className="flex items-center gap-5">
          <ProgressRing size={88} stroke={10} value={0} muted />
          <div className="min-w-0 flex-1">
            <SourcePlaceholder
              state={state === "loading" ? "loading" : "setup"}
              hint={data.detail ?? undefined}
            />
          </div>
        </div>
      </Card>
    );
  }

  const asleep = night.minutes_asleep ?? 0;
  const detail = [
    `${clockTime(night.start_at)} – ${clockTime(night.end_at)}`,
    night.efficiency != null && `${formatPercent(night.efficiency)} efficient`,
    night.minutes_awake != null && `${formatMinutes(night.minutes_awake)} awake`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      title={nightLabel(night.date)}
      titleHidden
      accent="sleep"
      aside={
        chip ??
        (night.processed ? null : (
          <Chip tone="idle" compact>
            Stages processing
          </Chip>
        ))
      }
      bodyClassName="gap-5 pt-4"
    >
      <div className="flex items-center gap-5">
        <ProgressRing
          size={88}
          stroke={10}
          value={asleep / SLEEP_GOAL_MIN}
          label={`${formatMinutes(asleep)} asleep of an ${SLEEP_GOAL_MIN / 60} hour goal`}
        >
          <span className="flex flex-col items-center">
            <span className="tnum text-[20px] leading-none font-extrabold">
              {Math.round((asleep / SLEEP_GOAL_MIN) * 100)}%
            </span>
            <span className="mt-0.5 text-[10px] font-bold text-accent-soft">
              of {SLEEP_GOAL_MIN / 60}h
            </span>
          </span>
        </ProgressRing>

        <div className="min-w-0">
          <p className="eyebrow">{nightLabel(night.date)}</p>
          <p className="tnum mt-1.5 text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[36px]">
            {formatMinutes(asleep)}
          </p>
          <p className="tnum mt-1.5 text-[13px] font-semibold text-accent-soft">{detail}</p>
        </div>
      </div>

      <StageBar night={night} />
      <div className="h-px bg-accent-track/60" aria-hidden />
      <Hypnogram night={night} />
    </Card>
  );
}

function WeekCard({ data }: { data: SleepSummary }) {
  const byDate = new Map(data.nights.map((n) => [n.date, n]));
  const today = parseLocalDate(localDate());

  // The last seven wake dates ending today, so the newest night is always on
  // the right — the Today card is the one that pins to the calendar week.
  const days = Array.from({ length: WEEK }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (WEEK - 1 - i));
    const key = localDate(d);
    const night: Night | undefined = byDate.get(key);
    return {
      key,
      label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
      long: d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      isToday: i === WEEK - 1,
      minutes: night?.minutes_asleep ?? null,
    };
  });

  const avg = formatMinutes(data.avg_minutes_asleep);
  const eff = formatPercent(data.avg_efficiency);

  return (
    <Card
      title="Last 7 nights"
      accent="sleep"
      tinted={false}
      aside={
        avg ? (
          <span className="tnum text-[12px] font-semibold text-fg-muted">
            avg {avg}
            {eff ? ` · ${eff}` : ""}
          </span>
        ) : null
      }
      bodyClassName="pt-2"
    >
      <NightBars days={days} goal={SLEEP_GOAL_MIN} height={140} />
      <p className="mt-3 text-[12px] font-semibold text-fg-muted">
        Dotted line is the {SLEEP_GOAL_MIN / 60}-hour goal. A night is filed under the morning you
        woke.
      </p>
    </Card>
  );
}

function ActivityCard({ today, days }: { today: Activity; days: Activity[] }) {
  const isToday = today.date === localDate();
  const avg = (pick: (a: Activity) => number | null) => {
    const values = days.map(pick).filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const avgHr = roundOrNull(avg((a) => a.resting_hr));

  const tiles = [
    {
      label: "Steps",
      value: formatCount(today.steps),
      avg: formatCount(roundOrNull(avg((a) => a.steps))),
    },
    {
      label: "Resting heart rate",
      value: today.resting_hr != null ? `${today.resting_hr} bpm` : null,
      avg: avgHr != null ? `${avgHr} bpm` : null,
    },
    {
      label: "Active minutes",
      value: formatMinutes(today.active_minutes),
      avg: formatMinutes(avg((a) => a.active_minutes)),
    },
    {
      label: "Calories",
      value: formatCount(roundOrNull(today.calories_kcal)),
      avg: formatCount(roundOrNull(avg((a) => a.calories_kcal))),
    },
  ];

  const title = isToday
    ? "Today so far"
    : parseLocalDate(today.date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });

  return (
    <Card title={title} accent="sleep" tinted={false} bodyClassName="pt-3">
      <ul className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <li
            key={t.label}
            className="flex min-w-0 flex-col gap-1 rounded-row bg-surface-2 px-4 py-3.5"
          >
            <span className="truncate text-[12px] font-bold text-fg-muted">{t.label}</span>
            <span className="tnum text-[22px] leading-tight font-extrabold tracking-[-0.01em]">
              {t.value ?? "No data"}
            </span>
            {t.avg ? (
              <span className="tnum truncate text-[12px] font-semibold text-accent-soft">
                7-day avg {t.avg}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function roundOrNull(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}
