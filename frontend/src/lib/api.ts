/** Everything is same-origin: nginx proxies /api to atlas-api. No auth header —
 *  Tailscale is the boundary. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body; the status text will do */
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export type SyncStatus = "running" | "success" | "failed" | "skipped";

export interface SyncResult {
  source: string;
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  rows_written: number;
  error: string | null;
}

export interface SourceStatus {
  source: string;
  configured: boolean;
  /** A source Atlas reads straight through rather than archiving. Its runs are
   *  reachability probes that write nothing, so the strip says "live" for these
   *  rather than quoting the age of a sync that never stored anything. */
  live: boolean;
  last_run: SyncResult | null;
}

/** Phase 2 — weather. Temperatures are Celsius, as stored; `lib/weather.ts`
 *  formats them. `configured: false` is a 200 with empty fields, never a 4xx. */
export interface HourlyPoint {
  at: string;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  precipitation_probability: number | null;
  weather_code: number | null;
  is_day: boolean | null;
  is_forecast: boolean;
}

export interface WeatherNow {
  at: string;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  relative_humidity: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  wind_speed_kmh: number | null;
  cloud_cover: number | null;
  weather_code: number | null;
  description: string;
  is_day: boolean | null;
}

export interface WeatherSummary {
  configured: boolean;
  now: WeatherNow | null;
  high_c: number | null;
  low_c: number | null;
  hourly: HourlyPoint[];
  fetched_at: string | null;
  detail: string | null;
}

/** Phase 3 — Securo, live-proxied. Nothing financial is stored in Atlas, so
 *  unlike weather there is no archive to fall back on: `configured: false` is a
 *  200 with empty fields, but a *configured* source whose upstream is down
 *  answers 502 and the card says so. Amounts are in `currency`; expenses are
 *  always positive and `net_month` is the signed one. */
export interface FinanceSummary {
  configured: boolean;
  detail: string | null;
  currency: string;
  balance: number | null;
  projected_balance: number | null;
  balance_date: string | null;
  income_month: number | null;
  expenses_month: number | null;
  net_month: number | null;
  projected_income: number | null;
  projected_expenses: number | null;
  assets_value: number | null;
  accounts_count: number | null;
  pending_categorization: number | null;
  fetched_at: string | null;
}

export interface CategorySpend {
  name: string;
  icon: string | null;
  /** Securo's own category colour — the one mark in Atlas coloured by data
   *  rather than by the area's accent. */
  color: string | null;
  amount: number;
  /** 0–1, already divided down from Securo's percentage. */
  share: number;
}

export interface MonthPoint {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

/** Phase 4 — Audiobookshelf, live-proxied and read-only. Times are seconds and
 *  `progress` is 0–1; `lib/listening.ts` formats them. Same contract as
 *  finance: `configured: false` is a 200 with empty fields, a configured source
 *  whose upstream is down answers 502. Nothing is ever written back to ABS. */
export interface ListeningBook {
  item_id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  narrator: string | null;
  series: string | null;
  /** "audiobook" or "ebook". */
  kind: string;
  duration_s: number | null;
  current_time_s: number | null;
  remaining_s: number | null;
  progress: number;
  last_listened_at: string | null;
  /** Same-origin, proxied by atlas-api — ABS wants the API key on the request
   *  and an `<img src>` cannot carry one privately. */
  cover_url: string | null;
  /** Deep link into ABS's own player, or null when ABS_PUBLIC_URL is unset. */
  link: string | null;
}

export interface ListeningSummary {
  configured: boolean;
  detail: string | null;
  current: ListeningBook | null;
  in_progress: ListeningBook[];
  /** Seconds listened today, as ABS buckets days in its own timezone. */
  today_s: number;
  total_s: number;
  fetched_at: string | null;
}

export const getHealth = () => api<{ status: string; service: string }>("/health");
export const getSyncStatus = () => api<SourceStatus[]>("/sync/status");
export const getWeather = () => api<WeatherSummary>("/weather/");
export const getFinance = () => api<FinanceSummary>("/finance/");
export const getFinanceCategories = () => api<CategorySpend[]>("/finance/categories");
export const getFinanceTrend = (months: number) =>
  api<MonthPoint[]>(`/finance/trend?months=${months}`);
export const getListening = () => api<ListeningSummary>("/listening/");
