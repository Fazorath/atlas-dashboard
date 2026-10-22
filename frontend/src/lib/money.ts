/* The money seam.

   Securo is live-proxied, not archived: every number here was fetched from
   Securo when the request was made, so there is no "as of" problem and no
   second source of truth. The cost is that a dead upstream has no last-good
   reading behind it — `GET /api/finance/` answers 502 rather than pretending,
   and the cards below read that as their error state.

   All formatting lives in this file. No component does arithmetic on money and
   none of them builds an Intl formatter, so the currency Securo reports is
   honoured everywhere without a single hard-coded dollar sign. */

import { useQuery } from "@tanstack/react-query";

import {
  getAccounts,
  getBills,
  getDailyOut,
  getFinance,
  getFinanceTrend,
  getGoals,
  getSpending,
  type FinanceSummary,
  type MonthPoint,
} from "@/lib/api";

export const FINANCE_KEY = ["finance"] as const;

/** How far back the trend card looks. Securo caps this at 12. */
export const TREND_MONTHS = 6;

/* Every card refetch is a round trip through atlas-api to Securo, so this is
   slower than a local read would be. Five minutes matches weather and is well
   inside the 24h token, which means one login a day rather than one per poll. */
const REFETCH_MS = 5 * 60_000;

export interface FinanceQuery {
  isPending: boolean;
  isError: boolean;
  data: FinanceSummary | undefined;
}

export function useFinance(): FinanceQuery {
  const query = useQuery({
    queryKey: FINANCE_KEY,
    queryFn: getFinance,
    refetchInterval: REFETCH_MS,
  });

  return { isPending: query.isPending, isError: query.isError, data: query.data };
}

/** Only the Money screen asks for these, and only once the summary says the
 *  source is actually on — otherwise every visit would spend two round trips
 *  to be told again that Securo is not configured. */
export function useSpending(enabled: boolean) {
  const query = useQuery({
    queryKey: ["finance", "spending"],
    queryFn: getSpending,
    refetchInterval: REFETCH_MS,
    enabled,
  });

  return {
    isPending: query.isPending,
    isError: query.isError,
    rows: query.data?.categories ?? [],
    uncategorised: query.data?.uncategorised ?? null,
    securoUrl: query.data?.securo_url ?? null,
  };
}

/** How far ahead "Upcoming bills" looks. */
export const BILLS_DAYS = 30;

export function useAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["finance", "accounts"],
    queryFn: getAccounts,
    refetchInterval: REFETCH_MS,
    enabled,
  });
}

export function useBills(enabled: boolean, days = BILLS_DAYS) {
  return useQuery({
    queryKey: ["finance", "bills", days],
    queryFn: () => getBills(days),
    refetchInterval: REFETCH_MS,
    enabled,
  });
}

export function useGoals(enabled: boolean) {
  return useQuery({
    queryKey: ["finance", "goals"],
    queryFn: getGoals,
    refetchInterval: REFETCH_MS,
    enabled,
  });
}

/** This month's Out per day, the 1st through today. */
export function useDailyOut(enabled: boolean) {
  return useQuery({
    queryKey: ["finance", "daily"],
    queryFn: getDailyOut,
    refetchInterval: REFETCH_MS,
    enabled,
  });
}

export function useMonthlyTrend(enabled: boolean, months = TREND_MONTHS) {
  const query = useQuery({
    queryKey: ["finance", "trend", months],
    queryFn: () => getFinanceTrend(months),
    refetchInterval: REFETCH_MS,
    enabled,
  });

  return {
    isPending: query.isPending,
    isError: query.isError,
    points: (query.data ?? []) as MonthPoint[],
  };
}

/* Intl formatters are expensive to build and these are rebuilt on every render
   otherwise, so they are made once per currency and kept. */
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, cents: boolean): Intl.NumberFormat {
  const key = `${currency}:${cents}`;
  const cached = formatters.get(key);
  if (cached) return cached;

  const digits = cents ? 2 : 0;
  let made: Intl.NumberFormat;
  try {
    made = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch {
    // An unrecognised ISO code throws rather than degrading. A card showing
    // dollars is wrong; a card showing nothing is broken, so take the former.
    made = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  formatters.set(key, made);
  return made;
}

/** "$1,234.56". Null in means null out, so a caller can choose between a
 *  skeleton and a dash rather than being handed "NaN". */
export function formatMoney(
  amount: number | null | undefined,
  currency = "USD",
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return formatter(currency, true).format(amount);
}

/** "$1,235" — no cents, for the big numbers on a card where the decimals cost
 *  two characters and say nothing at a glance. */
export function formatMoneyShort(
  amount: number | null | undefined,
  currency = "USD",
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return formatter(currency, false).format(amount);
}

/** "+$460" / "−$120". Uses a real minus sign, not a hyphen, so the two read as
 *  a matched pair at the same weight. */
export function formatSigned(
  amount: number | null | undefined,
  currency = "USD",
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const magnitude = formatMoneyShort(Math.abs(amount), currency);
  if (magnitude == null) return null;
  return `${amount < 0 ? "−" : "+"}${magnitude}`;
}

/** The share of what came in that went back out, 0–1. Undefined when there was
 *  no income to measure against — a bar filled from a zero denominator is a
 *  made-up number. */
export function spentShare(
  income: number | null | undefined,
  expenses: number | null | undefined,
): number | undefined {
  if (income == null || expenses == null) return undefined;
  if (!Number.isFinite(income) || income <= 0) return undefined;
  return Math.max(0, expenses / income);
}

/** Securo's category colours are hex strings from its own database. They are
 *  put straight into an inline style, so anything that is not a plain hex is
 *  dropped and the card's accent is used instead. */
export function categoryColor(value: string | null | undefined): string | undefined {
  return value && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : undefined;
}

/** "2026-09" -> "Sep". Falls back to the raw key rather than rendering
 *  "Invalid Date" if Securo ever changes the format. */
export function monthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString(undefined, { month: "short" });
}

/** "as of Mar 3" under the balance. */
export function asOfLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
