/* Today is one responsive grid, not a phone page and a desktop page.

   The grid is 2 columns until 1180px and 4 above it, so a card marked `span 2`
   is full width on a phone and half the sheet on a laptop with no extra markup.
   Only the reading order is re-cut at `desk`, via `order-*`, because the phone
   stack wants Listening and Due right after the two-up tiles while the desktop
   sheet wants the sleep chart to open the second row.

   Nothing here invents data. Anything derivable from the clock — the date, the
   seven day labels — is drawn for real; anything that needs an upstream shows
   the setup state from the spec until its phase lands. */

import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { IconTile } from "@/components/ui/icon-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { StatRing } from "@/components/ui/stat-ring";
import { CoverArt } from "@/components/widgets/cover-art";
import { AssignmentRow } from "@/components/widgets/assignment-row";
import { ReconnectBanner } from "@/components/widgets/fitbit-connection";
import { NightBars } from "@/components/widgets/sleep-charts";
import { SourceCard } from "@/components/widgets/source-card";
import {
  cardState,
  freshnessLabel,
  freshnessTone,
  SOURCE,
  useSources,
  type SourceState,
} from "@/lib/sources";
import type { ListeningBook } from "@/lib/api";
import { useHabits } from "@/lib/habits";
import {
  bylineOf,
  formatDuration,
  progressLine,
  useListening,
} from "@/lib/listening";
import {
  formatMoneyShort,
  formatSigned,
  spentShare,
  useFinance,
} from "@/lib/money";
import { useSchool, useToggleAssignment } from "@/lib/school";
import { localDate } from "@/lib/habits";
import { formatMinutes, SLEEP_GOAL_MIN, useSleep } from "@/lib/sleep";
import { formatHour, formatTemp, useWeather, weatherIcon } from "@/lib/weather";
import { LISTENING_ICON, NAV_SECTIONS, WEATHER_ICON, type Accent } from "@/lib/sections";
import { dateEyebrow, greeting } from "@/lib/utils";

const OWNER = "Eggs";

const SLEEP_ICON = NAV_SECTIONS[1].icon;
const SCHOOL_ICON = NAV_SECTIONS[2].icon;
const MONEY_ICON = NAV_SECTIONS[3].icon;

export function Today() {
  const sources = useSources();
  const hello = greeting();

  return (
    <div className="flex flex-col gap-[14px] lap:gap-5">
      {/* The phone carries its greeting above the grid; the desktop sheet folds
          it into the hero card instead. */}
      <header className="flex items-start justify-between gap-4 lap:hidden">
        <div className="min-w-0">
          <p className="eyebrow">{dateEyebrow(false)}</p>
          <h1 className="mt-1.5 text-[30px] leading-none font-extrabold tracking-[-0.02em]">
            {hello}
          </h1>
        </div>
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-sleep text-[16px] font-extrabold text-bg"
        >
          {OWNER[0]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 lap:gap-5 desk:grid-cols-4">
        <SleepBanner />

        <SummaryCard sources={sources} hello={hello} />

        <WeatherCard state={sources.stateOf(SOURCE.weather)} />

        <MoneyCard state={sources.stateOf(SOURCE.finance)} />

        <ListeningCard state={sources.stateOf(SOURCE.listening)} />
        <DueCard state={sources.stateOf(SOURCE.school)} />
        <SleepWeekCard state={sources.stateOf(SOURCE.sleep)} />
        <SourcesCard sources={sources} />
      </div>
    </div>
  );
}

/** Greeting plus the three rings the day is judged by. */
function SummaryCard({
  sources,
  hello,
}: {
  sources: ReturnType<typeof useSources>;
  hello: string;
}) {
  // Habits reads the same query key the Habits screen writes to, so ticking a
  // habit there moves this ring too. Due reads the same ["school", ...] entry as
  // the Due card below it, so ticking an assignment moves both. Slept is last
  // night only — an older night on this ring would pass for today's.
  const habits = useHabits();
  const habitsReady = habits.configured && habits.total > 0;
  const school = useSchool();
  const week = school.data?.configured ? school.data : null;
  const dueReady = week != null && week.week_total > 0;
  const sleep = useSleep();
  const lastNight = sleep.data?.last_night;
  const slept = lastNight?.date === localDate() ? lastNight.minutes_asleep : null;

  const stats: {
    accent: Accent;
    label: string;
    value: string | null;
    short?: string | null;
    progress: number;
  }[] = [
    {
      accent: "sleep",
      label: "Slept",
      value: formatMinutes(slept),
      short: slept ? `${(slept / 60).toFixed(1)}h` : null,
      progress: slept ? slept / SLEEP_GOAL_MIN : 0,
    },
    {
      accent: "habits",
      label: "Habits",
      value: habitsReady ? `${habits.done}/${habits.total}` : null,
      progress: habitsReady ? habits.done / habits.total : 0,
    },
    {
      accent: "due",
      label: "Due this week",
      value: dueReady ? `${week.week_done}/${week.week_total}` : null,
      progress: dueReady ? week.week_done / week.week_total : 0,
    },
  ];

  const anyLoading = sources.isPending || habits.isPending || school.isPending || sleep.isPending;

  return (
    <Card
      title="Today"
      titleHidden
      span={2}
      className="gap-5 desk:order-1 desk:h-[270px] lap:px-8 lap:py-7"
      aside={
        anyLoading ? (
          <span className="text-[12px] font-semibold text-fg-muted">checking</span>
        ) : null
      }
    >
      <div className="hidden lap:block">
        <p className="eyebrow">{dateEyebrow(true)}</p>
        <h1 className="mt-2 text-[40px] leading-none font-extrabold tracking-[-0.03em]">
          {hello}, {OWNER}
        </h1>
      </div>

      <div className="grid grid-cols-3 items-end gap-2 lap:flex lap:items-center lap:gap-8">
        {stats.map((stat) => (
          <StatRing
            key={stat.label}
            accent={stat.accent}
            label={stat.label}
            value={stat.value}
            short={stat.short}
            progress={stat.progress}
          />
        ))}
      </div>
    </Card>
  );
}

/** Phase 2, and the first card on this page with a real number in it.

    Everything comes from Atlas's own archive rather than Open-Meteo, so the
    reading survives a failed sync: `SourceCard` keeps rendering children in the
    `error` state, and the Sources strip is where "the sync is broken" is said.
    The header icon follows the current conditions instead of being a fixed
    cloud — it is the one glanceable thing on a 133px-wide phone tile. */
function WeatherCard({ state: sourceState }: { state: SourceState }) {
  const weather = useWeather();
  const now = weather.now;

  const state = cardState(sourceState, weather, "archive");

  const temp = formatTemp(now?.temperature_c);
  const feels = formatTemp(now?.apparent_temperature_c);
  const high = formatTemp(weather.data?.high_c);
  const low = formatTemp(weather.data?.low_c);
  // Four hours is what fits the desktop card without the row going to 11px.
  const strip = (weather.data?.hourly ?? []).slice(0, 4);

  const detail = [feels && `Feels ${feels}`, high && low && `H ${high} L ${low}`]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <SourceCard
      title="Weather"
      accent="weather"
      icon={now ? weatherIcon(now.weather_code, now.is_day) : WEATHER_ICON}
      span={1}
      narrow
      state={state}
      source="Open-Meteo"
      hint="Add your coordinates to .env to switch this on."
      className="min-h-[144px] desk:order-2 desk:h-[270px]"
    >
      {temp ? (
        <>
          <div className="flex flex-1 flex-col justify-end gap-1">
            <p className="tnum text-[40px] leading-none font-extrabold tracking-[-0.03em] lap:text-[52px]">
              {temp}
            </p>
            <p className="truncate text-[13px] font-bold text-accent lap:text-[15px]">
              {now?.description}
            </p>
            {detail ? (
              <p className="tnum text-[12px] font-semibold text-accent-soft lap:text-[13px]">
                {detail}
              </p>
            ) : null}
          </div>

          {strip.length > 0 ? (
            <ul className="mt-4 hidden grid-cols-4 gap-1 desk:grid">
              {strip.map((hour) => {
                const Icon = weatherIcon(hour.weather_code, hour.is_day);
                const hourTemp = formatTemp(hour.temperature_c);
                return (
                  <li key={hour.at} className="flex flex-col items-center gap-1.5">
                    <span className="text-[11px] font-bold text-accent-soft">
                      {formatHour(hour.at)}
                    </span>
                    <Icon aria-hidden strokeWidth={2} className="size-4 text-accent" />
                    <span className="tnum text-[13px] font-extrabold">{hourTemp ?? "\u2014"}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}
    </SourceCard>
  );
}

/** Phase 3, and the second card here with a real number in it.

    Unlike weather there is no archive underneath: Securo is read live on every
    request. That is why the failure mode is different — `SourceCard` still
    renders children in the `error` state, so the balance React Query already
    holds stays on screen with a "Couldn't reach Securo" chip over it, but a
    first load that fails has nothing to show and falls back to the hint. */
function MoneyCard({ state: sourceState }: { state: SourceState }) {
  const finance = useFinance();
  const state = cardState(sourceState, finance, "live");

  const data = finance.data;
  const currency = data?.currency ?? "USD";

  // No cents: at 40px, two decimals cost a third of the tile and say nothing
  // you would act on.
  const balance = formatMoneyShort(data?.balance, currency);
  const net = formatSigned(data?.net_month, currency);
  const share = spentShare(data?.income_month, data?.expenses_month);

  const flow = [
    data?.income_month != null && `In ${formatMoneyShort(data.income_month, currency)}`,
    data?.expenses_month != null && `Out ${formatMoneyShort(data.expenses_month, currency)}`,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  const negative = (data?.net_month ?? 0) < 0;

  return (
    <SourceCard
      title="Money"
      accent="money"
      icon={MONEY_ICON}
      span={1}
      narrow
      state={state}
      source="Securo"
      hint="Add your Securo login to .env to switch this on."
      className="min-h-[144px] desk:order-3 desk:h-[270px]"
    >
      {balance ? (
        <>
          <div className="flex flex-1 flex-col justify-end gap-1">
            <p className="tnum text-[30px] leading-none font-extrabold tracking-[-0.03em] lap:text-[40px]">
              {balance}
            </p>
            {net ? (
              <p
                className={
                  negative
                    ? "tnum truncate text-[13px] font-bold text-due lap:text-[15px]"
                    : "tnum truncate text-[13px] font-bold text-accent lap:text-[15px]"
                }
              >
                {net} this month
              </p>
            ) : null}
            {flow ? (
              <p className="tnum truncate text-[12px] font-semibold text-accent-soft lap:text-[13px]">
                {flow}
              </p>
            ) : null}
          </div>

          {/* The desktop tile has the height weather spends on its hourly
              strip; this is the equivalent — how much of the month's income is
              already gone. */}
          {share != null ? (
            <div className="mt-4 hidden flex-col gap-1.5 desk:flex">
              <ProgressBar
                value={share}
                height={8}
                label={`Spent ${Math.round(share * 100)} percent of income this month`}
              />
              <p className="text-[11px] font-bold text-accent-soft">
                {Math.round(share * 100)}% of income spent
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </SourceCard>
  );
}

/* Phase 4, and the third card here with a real number in it.

   Read-only and live, like Money: what it shows is a position in a book, which
   stops being true the moment you press play somewhere else, so there is no
   archive behind it and nothing here can write your place back to ABS.

   The cover is the card. At 133px of phone tile the art is the only thing
   legible at a glance, and it is the one place in Atlas where an image carries
   the card instead of an accent glyph — the headphones tile is what a book
   with no cover falls back to. */
function ListeningCard({ state: sourceState }: { state: SourceState }) {
  const listening = useListening();
  const state = cardState(sourceState, listening, "live");

  const book = listening.data?.current ?? null;
  // Zero is "not yet today", not "0s today".
  const today = listening.data?.today_s ? formatDuration(listening.data.today_s) : null;
  const line = book ? progressLine(book) : null;

  // Configured, reachable, and genuinely nothing on the go. Not a failure and
  // not a setup state — the card says so rather than showing an empty shelf as
  // though something were broken.
  const idle = state === "ready" && listening.data?.configured === true && !book;

  const body = book ? (
    <>
      <BookHeading book={book} />

      <div className="mt-auto flex flex-col gap-1.5">
        <ProgressBar
          value={book.progress}
          height={6}
          label={`${book.title} is ${Math.round(book.progress * 100)} percent finished`}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          {line ? (
            <p className="tnum text-[12px] font-bold text-accent lap:text-[13px]">{line}</p>
          ) : null}
          {today ? (
            <p className="tnum text-[12px] font-semibold text-accent-soft">{today} today</p>
          ) : null}
        </div>
      </div>
    </>
  ) : idle ? (
    <div className="flex items-center gap-4 lap:flex-col lap:items-start">
      <IconTile size={64} icon={LISTENING_ICON} className="desk:hidden" />
      <IconTile size={96} icon={LISTENING_ICON} className="hidden desk:grid" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-accent-soft">
        Nothing on the go. Start a book in Audiobookshelf and it shows up here.
      </p>
    </div>
  ) : null;

  return (
    <SourceCard
      title="Listening"
      accent="due"
      icon={LISTENING_ICON}
      span={1}
      narrow
      phoneFull
      state={state}
      source="Audiobookshelf"
      hint="Needs an Audiobookshelf API key from Settings, API Keys."
      className="desk:order-5 desk:h-[290px]"
      bodyClassName="gap-4"
    >
      {body}
    </SourceCard>
  );
}

/** Cover, title and byline — the whole block is the link into ABS's own player
 *  when there is one, so the tap target is the art rather than a word of text.
 *  `link` is null when ABS_PUBLIC_URL is unset: a link Atlas cannot resolve for
 *  the browser is worse than no link, so the same block renders unwrapped. */
function BookHeading({ book }: { book: ListeningBook }) {
  const byline = bylineOf(book);

  const inner = (
    <>
      <CoverArt
        src={book.cover_url}
        alt=""
        size={64}
        fallbackIcon={LISTENING_ICON}
        className="desk:hidden"
      />
      <CoverArt
        src={book.cover_url}
        alt=""
        size={96}
        fallbackIcon={LISTENING_ICON}
        className="hidden desk:block"
      />
      <div className="min-w-0 flex-1 lap:w-full">
        <p className="line-clamp-2 text-[15px] leading-tight font-extrabold tracking-[-0.01em] lap:text-[17px]">
          {book.title}
        </p>
        {byline ? (
          <p className="mt-1 truncate text-[12px] font-semibold text-accent-soft lap:text-[13px]">
            {byline}
          </p>
        ) : null}
      </div>
    </>
  );

  if (!book.link) {
    return <div className="flex min-w-0 flex-1 items-center gap-4 lap:flex-col lap:items-start">{inner}</div>;
  }

  return (
    <a
      href={book.link}
      target="_blank"
      rel="noreferrer"
      title={`Open ${book.title} in Audiobookshelf`}
      className="flex min-w-0 flex-1 items-center gap-4 rounded-[18px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent lap:flex-col lap:items-start"
    >
      {inner}
    </a>
  );
}

/* Phase 6. Overdue first, then what's next, ticked in place.

   An archive like weather, so a failed feed sync keeps the list on screen under
   a "Couldn't reach Canvas" chip. Three rows is what the desktop tile holds at
   44px targets; the rest is one tap away on the School screen. */
const DUE_ROWS = 3;

function DueCard({ state: sourceState }: { state: SourceState }) {
  const school = useSchool();
  const toggle = useToggleAssignment();
  const state = cardState(sourceState, school, "archive");
  const data = school.data?.configured ? school.data : null;

  const rows = data ? [...data.overdue, ...data.upcoming.filter((a) => !a.done)] : [];
  const shown = rows.slice(0, DUE_ROWS);
  const more = rows.length - shown.length;

  const body = !data ? null : shown.length > 0 ? (
    <div className="flex flex-1 flex-col gap-2 pt-3">
      <ul className="flex flex-col gap-2">
        {shown.map((a) => (
          <li key={a.ics_uid}>
            <AssignmentRow compact assignment={a} onToggle={() => toggle.mutate(a.ics_uid)} />
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <Link
          to="/school"
          className="mt-auto self-start rounded-full text-[12px] font-bold text-accent outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {more} more this week
        </Link>
      ) : null}
    </div>
  ) : (
    <div className="flex flex-1 flex-col justify-end gap-1">
      <p className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
        {data.week_total > 0 ? "All done." : "Nothing due."}
      </p>
      <p className="text-[13px] leading-snug font-semibold text-accent-soft">
        {data.week_total > 0
          ? `${data.week_total} ${data.week_total === 1 ? "assignment" : "assignments"} this week, every one ticked.`
          : "Canvas lists nothing for the next seven days."}
      </p>
    </div>
  );

  return (
    <SourceCard
      title="Due this week"
      accent="due"
      tinted={false}
      icon={SCHOOL_ICON}
      span={1}
      narrow
      phoneFull
      state={state}
      source="Canvas"
      hint="Paste your Canvas calendar feed URL into .env to list assignments here."
      className="desk:order-6 desk:h-[290px]"
    >
      {body}
    </SourceCard>
  );
}

/** Only there when Google needs a click: the weekly sign-in has lapsed, or is
    inside its last two days. Everything else about sleep lives in its card. */
function SleepBanner() {
  const sleep = useSleep();
  return <ReconnectBanner conn={sleep.data?.connection} />;
}

/** The calendar week, Monday first. The day labels are real from the clock
    either way; once a source lands, the bars are each night's time asleep. */
function SleepWeekCard({ state: sourceState }: { state: SourceState }) {
  const sleep = useSleep();
  const state = cardState(sourceState, sleep, "archive");
  const data = sleep.data?.configured ? sleep.data : null;
  const byDate = new Map((data?.nights ?? []).map((n) => [n.date, n.minutes_asleep]));
  const days = weekDays().map((d) => ({ ...d, minutes: byDate.get(d.key) ?? null }));
  const hasNights = days.some((d) => d.minutes != null);
  const avg = formatMinutes(data?.avg_minutes_asleep);

  const hint = !data
    ? "Add a Google Health OAuth client to .env to fill these in."
    : data.connection.state === "disconnected"
      ? "Connect Fitbit on the Sleep screen to fill these in."
      : "Waiting on the first nights from Google Health.";

  return (
    <Card
      title="Sleep this week"
      accent="sleep"
      icon={SLEEP_ICON}
      span={2}
      className="desk:order-4 desk:h-[290px]"
      bodyClassName="gap-3"
      aside={
        avg && hasNights ? (
          <span className="tnum text-[12px] font-semibold text-fg-muted">avg {avg}</span>
        ) : (
          <Skeleton width={56} height={10} pulse={state === "loading"} />
        )
      }
    >
      {hasNights ? (
        <NightBars days={days} goal={SLEEP_GOAL_MIN} height={140} />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-end gap-2 pt-4">
            {days.map((day) => (
              <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-[14px] bg-sleep-track"
                  style={{ height: day.isToday ? 36 : 24 }}
                />
                <span
                  className={
                    day.isToday
                      ? "text-[12px] font-extrabold text-sleep"
                      : "text-[12px] font-bold text-fg-muted"
                  }
                >
                  {day.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[13px] leading-snug font-semibold text-sleep-soft">{hint}</p>
        </>
      )}
    </Card>
  );
}

function SourcesCard({ sources }: { sources: ReturnType<typeof useSources> }) {
  return (
    <Card
      title="Sources"
      span={4}
      className="desk:order-7"
      aside={
        sources.isFetching ? (
          <span className="text-[12px] font-semibold text-fg-muted">checking</span>
        ) : null
      }
    >
      <div className="pt-3">
        {sources.isPending ? (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={128} height={30} pulse className="rounded-full" />
            ))}
          </div>
        ) : sources.isError ? (
          <Chip tone="error">The API is not answering — check atlas-api is running</Chip>
        ) : sources.all.length === 0 ? (
          <Chip tone="idle">No sources registered yet</Chip>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sources.all.map((status) => (
              <li key={status.source}>
                <Chip tone={freshnessTone(status)}>
                  {status.source} &middot; {freshnessLabel(status)}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** Monday-first week containing today. */
function weekDays() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return {
      key: localDate(day),
      label: day.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
      long: day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      isToday: day.toDateString() === now.toDateString(),
    };
  });
}
