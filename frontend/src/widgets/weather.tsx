/* Weather's Widgets — module open_meteo. Read from Atlas's own archive. */

import { localDate } from "@/lib/habits";
import { cardState, SOURCE, useSources } from "@/lib/sources";
import { cn } from "@/lib/utils";
import {
  aqiLevel,
  formatClock,
  formatHour,
  formatTemp,
  uvLevel,
  useWeather,
  weatherIcon,
} from "@/lib/weather";
import { R, WidgetCard, type Problem } from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const SETUP = "Add your coordinates to config/modules/open_meteo.yaml to switch this on.";

function useOpenMeteo() {
  const sources = useSources();
  const weather = useWeather();
  const state = cardState(sources.stateOf(SOURCE.weather), weather, "archive");
  return { weather, state, data: weather.data?.configured ? weather.data : null };
}

/* --- Now ----------------------------------------------------------------- */

function Now({ size }: WidgetProps) {
  const { state, data } = useOpenMeteo();
  const now = data?.now ?? null;
  const temp = formatTemp(now?.temperature_c);
  const feels = formatTemp(now?.apparent_temperature_c);
  const hi = formatTemp(data?.high_c);
  const lo = formatTemp(data?.low_c);
  const Icon = now ? weatherIcon(now.weather_code, now.is_day) : null;
  const strip = (data?.hourly ?? []).filter((h) => h.is_forecast).slice(0, 4);

  const reading = (
    <div className="min-w-0">
      <p className="flex items-center gap-3">
        <span className={cn(R.l, size !== "S" && "lap:text-[56px]")}>{temp}</span>
        {Icon ? <Icon aria-hidden strokeWidth={1.75} className="size-7 text-accent" /> : null}
      </p>
      <p className="mt-2 truncate text-[15px] font-medium text-accent">{now?.description}</p>
      <p className={cn(R.t, "mt-1 truncate text-fg-muted")}>
        {[feels && `Feels ${feels}`, hi && lo && `H ${hi} L ${lo}`].filter(Boolean).join(" · ")}
      </p>
    </div>
  );

  const hours = (
    <ul className="grid grid-cols-4 gap-2">
      {strip.map((h) => {
        const HourIcon = weatherIcon(h.weather_code, h.is_day);
        return (
          <li key={h.at} className="flex flex-col items-center gap-1.5 rounded-row bg-surface-2 py-2">
            <span className={cn(R.t, "text-fg-muted")}>{formatHour(h.at)}</span>
            <HourIcon aria-hidden strokeWidth={2} className="size-4 text-accent" />
            <span className={R.xs}>{formatTemp(h.temperature_c) ?? "—"}</span>
          </li>
        );
      })}
    </ul>
  );

  let body;
  if (size === "S") body = <div className="mt-auto">{reading}</div>;
  else if (size === "M")
    body = (
      <div className="mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-end gap-4">
        {reading}
        {hours}
      </div>
    );
  else body = <NowLarge reading={reading} hours={hours} />;

  return (
    <WidgetCard
      title="Weather"
      area="weather"
      state={state}
      problem={{ chip: "Unreachable", text: "Open-Meteo didn't answer the last sync." } satisfies Problem}
      setup={SETUP}
      empty={now && temp ? null : { title: "No reading yet", text: "First sync runs on the hour." }}
    >
      {body}
    </WidgetCard>
  );
}

function NowLarge({ reading, hours }: { reading: React.ReactNode; hours: React.ReactNode }) {
  const { data } = useOpenMeteo();
  const today = data?.daily.find((d) => d.date === localDate()) ?? null;
  const now = data?.now;
  const rainAt = (data?.hourly ?? []).find((h) => h.is_forecast && (h.precipitation_probability ?? 0) >= 20);

  const facts = [
    { label: "Sunrise", value: formatClock(today?.sunrise), sub: daylight(today?.sunrise, today?.sunset) },
    { label: "Sunset", value: formatClock(today?.sunset), sub: null },
    { label: "UV index", value: now?.uv_index != null ? String(Math.round(now.uv_index)) : null, sub: uvLevel(now?.uv_index)?.toLowerCase() },
    { label: "Air quality", value: now?.us_aqi != null ? String(now.us_aqi) : null, sub: aqiLevel(now?.us_aqi)?.toLowerCase() },
  ];

  return (
    <>
      <div className="grid grid-cols-1 items-end gap-3 min-[420px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lap:gap-4">
        {reading}
        {hours}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-divider pt-3 lap:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="label-caps truncate text-fg-muted">{f.label}</dt>
            <dd className={cn(R.xs, "mt-1")}>
              {f.value ?? "—"}
              {f.sub ? <span className="ml-1.5 text-[11px] text-fg-muted">{f.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {rainAt ? (
        <p className={cn(R.t, "text-fg-muted")}>
          <span className="text-accent">{rainAt.precipitation_probability}%</span> rain from {formatHour(rainAt.at)}
        </p>
      ) : null}
    </>
  );
}

function daylight(rise: string | null | undefined, set: string | null | undefined): string | null {
  if (!rise || !set) return null;
  const minutes = Math.round((new Date(set).getTime() - new Date(rise).getTime()) / 60_000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m daylight`;
}

/* --- 7-day --------------------------------------------------------------- */

function SevenDay({ size }: WidgetProps) {
  const { state, data } = useOpenMeteo();
  const days = (data?.daily ?? []).slice(0, 7);
  const highs = days.map((d) => d.temperature_max_c).filter((v): v is number => v != null);
  const lows = days.map((d) => d.temperature_min_c).filter((v): v is number => v != null);
  const min = lows.length ? Math.min(...lows) : 0;
  const max = highs.length ? Math.max(...highs) : 1;
  const span = Math.max(1, max - min);
  const today = localDate();

  const name = (date: string) =>
    date === today && size === "L"
      ? "Today"
      : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

  return (
    <WidgetCard
      title="7-day"
      area="weather"
      state={state}
      problem={{ chip: "Unreachable", text: "Open-Meteo didn't answer the last sync, so there's no forecast to trust." }}
      setup={SETUP}
      empty={days.length ? null : { title: "No forecast yet", text: "First sync runs on the hour." }}
      aside={highs.length ? `${formatTemp(min)?.replace("°", "")}–${formatTemp(max)}` : null}
    >
      {size === "M" ? (
        <ul className="grid min-h-0 flex-1 grid-cols-7 gap-1.5">
          {days.map((d) => {
            const Icon = weatherIcon(d.weather_code, true);
            const lo = d.temperature_min_c ?? min;
            const hi = d.temperature_max_c ?? max;
            return (
              <li key={d.date} className="flex min-h-0 min-w-0 flex-col items-center gap-1">
                <span className={cn("text-[11px]", d.date === today ? "text-accent" : "text-fg-muted")}>{name(d.date)}</span>
                <Icon aria-hidden strokeWidth={2} className="size-4 shrink-0 text-accent" />
                <span className={R.t}>{formatTemp(d.temperature_max_c)}</span>
                <span className="relative min-h-0 w-1.5 flex-1 rounded-full bg-surface-2 max-lap:min-h-12">
                  <span
                    className="absolute inset-x-0 rounded-full bg-accent"
                    style={{ bottom: `${((lo - min) / span) * 100}%`, top: `${((max - hi) / span) * 100}%` }}
                  />
                </span>
                <span className={cn(R.t, "text-fg-muted")}>{formatTemp(d.temperature_min_c)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col justify-between gap-3">
          {days.map((d) => {
            const Icon = weatherIcon(d.weather_code, true);
            const lo = d.temperature_min_c ?? min;
            const hi = d.temperature_max_c ?? max;
            return (
              <li key={d.date} className="grid grid-cols-[3.5rem_1.25rem_2.5rem_2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2.5">
                <span className={cn("text-[13px]", d.date === today ? "text-accent" : "text-fg")}>{name(d.date)}</span>
                <Icon aria-hidden strokeWidth={2} className="size-4 text-accent" />
                <span className={cn(R.t, (d.precipitation_probability_max ?? 0) >= 30 ? "text-accent" : "text-fg-dim")}>
                  {d.precipitation_probability_max != null ? `${d.precipitation_probability_max}%` : ""}
                </span>
                <span className={cn(R.t, "text-right text-fg-muted")}>{formatTemp(d.temperature_min_c)}</span>
                <span className="relative h-1.5 rounded-full bg-surface-2">
                  <span
                    className="absolute inset-y-0 rounded-full bg-accent"
                    style={{ left: `${((lo - min) / span) * 100}%`, right: `${((max - hi) / span) * 100}%` }}
                  />
                </span>
                <span className={R.t}>{formatTemp(d.temperature_max_c)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

/* --- Next hours (Area-only) ---------------------------------------------- */

/** The forecast hour by hour with rain chance: 6 hours at M, 12 at L. */
function NextHours({ size }: WidgetProps) {
  const { state, data } = useOpenMeteo();
  const hours = (data?.hourly ?? []).filter((h) => h.is_forecast).slice(0, size === "M" ? 6 : 12);
  const temps = hours.map((h) => h.temperature_c).filter((v): v is number => v != null);
  const lo = temps.length ? Math.min(...temps) : 0;
  const span = Math.max(1, (temps.length ? Math.max(...temps) : 1) - lo);

  return (
    <WidgetCard
      title="Next hours"
      area="weather"
      state={state}
      problem={{ chip: "Unreachable", text: "Open-Meteo didn't answer the last sync, so there's no forecast to trust." }}
      setup={SETUP}
      empty={hours.length ? null : { title: "No forecast yet", text: "First sync runs on the hour." }}
      aside={`next ${hours.length}h`}
    >
      <ul className={cn("grid min-h-0 flex-1 gap-1", size === "M" ? "grid-cols-6" : "grid-cols-6 lap:grid-cols-12")}>
        {hours.map((h, i) => {
          const Icon = weatherIcon(h.weather_code, h.is_day);
          const rain = h.precipitation_probability ?? 0;
          return (
            <li
              key={h.at}
              className={cn(
                "flex min-w-0 flex-col items-center justify-end gap-1.5 rounded-row py-1",
                size === "L" && i >= 6 && "hidden lap:flex",
              )}
            >
              <span className={R.xs}>{formatTemp(h.temperature_c) ?? "—"}</span>
              {size === "L" ? (
                <span className="flex min-h-0 w-1.5 flex-1 items-end rounded-full bg-surface-2 max-lap:min-h-20">
                  <span
                    className="w-full rounded-full bg-accent"
                    style={{ height: `${20 + (((h.temperature_c ?? lo) - lo) / span) * 80}%` }}
                  />
                </span>
              ) : null}
              <Icon aria-hidden strokeWidth={2} className="size-4 shrink-0 text-accent" />
              <span className={cn(R.t, rain >= 30 ? "text-accent" : "text-fg-dim")}>{rain ? `${rain}%` : "·"}</span>
              <span className={cn(R.t, "text-fg-muted")}>{formatHour(h.at)}</span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

/* --- Today (Area-only) --------------------------------------------------- */

/** Sunrise, sunset, UV and air quality for today, each with its plain-words
 *  level. M is the four readings in a row; L gives each its own tile. */
function TodayDetails({ size }: WidgetProps) {
  const { state, data } = useOpenMeteo();
  const today = data?.daily.find((d) => d.date === localDate()) ?? null;
  const now = data?.now ?? null;

  const facts = [
    { label: "Sunrise", value: formatClock(today?.sunrise), note: daylight(today?.sunrise, today?.sunset) },
    { label: "Sunset", value: formatClock(today?.sunset), note: null },
    {
      label: "UV index",
      value: now?.uv_index != null ? String(Math.round(now.uv_index)) : null,
      note: [uvLevel(now?.uv_index), today?.uv_index_max != null && `peak ${Math.round(today.uv_index_max)}`]
        .filter(Boolean)
        .join(" · "),
    },
    { label: "Air quality", value: now?.us_aqi != null ? `${now.us_aqi}` : null, note: aqiLevel(now?.us_aqi) },
  ];

  return (
    <WidgetCard
      title="Today"
      area="weather"
      state={state}
      problem={{ chip: "Unreachable", text: "Open-Meteo didn't answer the last sync." }}
      setup={SETUP}
      empty={today || now ? null : { title: "No reading yet", text: "First sync runs on the hour." }}
    >
      <dl className={cn("grid flex-1 gap-2", size === "M" ? "grid-cols-2 lap:grid-cols-4" : "grid-cols-2")}>
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-1 rounded-row bg-surface-2 p-2.5 lap:justify-between lap:p-3.5">
            <dt className="label-caps truncate text-fg-muted">{f.label}</dt>
            <dd className={size === "M" ? R.xs : R.m}>{f.value ?? "—"}</dd>
            {f.note && (size === "L" || f.label !== "Sunset") ? (
              <dd className={cn(R.t, "truncate text-fg-muted", size === "M" && "hidden lap:block")}>{f.note}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </WidgetCard>
  );
}

export const WEATHER_WIDGETS: WidgetDef[] = [
  { id: "open_meteo.now", title: "Now", area: "weather", sizes: ["S", "M", "L"], placement: "anywhere", render: Now },
  { id: "open_meteo.forecast_7d", title: "7-day", area: "weather", sizes: ["M", "L"], placement: "anywhere", render: SevenDay },
  { id: "open_meteo.next_hours", title: "Next hours", area: "weather", sizes: ["M", "L"], placement: "area", render: NextHours },
  { id: "open_meteo.today", title: "Today", area: "weather", sizes: ["M", "L"], placement: "area", render: TodayDetails },
];
