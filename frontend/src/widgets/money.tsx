/* Money's Widgets — module securo.

   Securo is a live proxy: nothing financial is stored in Atlas, so a failed
   read has no cached figure to fall back on and says so. */

import { ArrowRight } from "lucide-react";

import { SegmentMeter } from "@/components/ui/segment-meter";
import type { DayOut } from "@/lib/api";
import { localDate } from "@/lib/habits";
import { daysFromToday } from "@/lib/school";
import {
  categoryColor,
  formatMoney,
  formatMoneyShort,
  formatSigned,
  monthLabel,
  spentShare,
  TREND_MONTHS,
  useAccounts,
  useBills,
  useDailyOut,
  useFinance,
  useGoals,
  useMonthlyTrend,
  useSpending,
} from "@/lib/money";
import { cardState, SOURCE, useSources } from "@/lib/sources";
import { cn } from "@/lib/utils";
import { R, WidgetCard, type Problem } from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const PROBLEM: Problem = { chip: "Unreachable", text: "Securo isn't answering — check it's running." };
const SETUP = "Add your Securo login to .env to switch this on.";
const BILL_DAYS = 7;

function useMoney() {
  const sources = useSources();
  const finance = useFinance();
  const state = cardState(sources.stateOf(SOURCE.finance), finance, "live");
  const data = finance.data?.configured ? finance.data : null;
  return { state, data, currency: data?.currency ?? "USD", on: state === "ready" };
}

/* --- Balance ------------------------------------------------------------- */

function Balance({ size }: WidgetProps) {
  const { state, data, currency, on } = useMoney();
  const accounts = useAccounts(on && size === "M");
  const projected =
    data?.projected_balance != null &&
    data.balance != null &&
    Math.round(data.projected_balance) !== Math.round(data.balance)
      ? formatMoneyShort(data.projected_balance, currency)
      : null;
  const noAccounts = data != null && (data.accounts_count ?? 0) === 0;
  const net = formatSigned(data?.net_month, currency);

  return (
    <WidgetCard
      title="Balance"
      area="money"
      state={state}
      problem={PROBLEM}
      setup={SETUP}
      empty={noAccounts ? { title: "No accounts yet", text: "Accounts show here once they exist in Securo." } : null}
      aside={size === "M" && projected ? `Projected ${projected}` : null}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
        <p className={cn(R.l, "truncate")}>{formatMoneyShort(data?.balance, currency)}</p>
        {size === "S" ? (
          <p className={cn(R.t, "truncate text-fg-muted")}>
            {projected
              ? `Projected ${projected}`
              : `${data?.accounts_count ?? 0} ${data?.accounts_count === 1 ? "account" : "accounts"} · live`}
          </p>
        ) : (
          <div className="flex min-w-0 items-end justify-between gap-4">
            <div className="min-w-0">
              {net ? (
                <p className={cn(R.xs, (data?.net_month ?? 0) < 0 ? "text-due" : "text-accent")}>
                  {net} this month
                </p>
              ) : null}
              <p className={cn(R.t, "mt-1 truncate text-fg-muted")}>
                In {formatMoneyShort(data?.income_month, currency) ?? "—"} · Out{" "}
                {formatMoneyShort(data?.expenses_month, currency) ?? "—"}
              </p>
            </div>
            <ul className="hidden shrink-0 flex-col gap-1 text-right min-[420px]:flex">
              {(accounts.data ?? []).slice(0, 2).map((a) => (
                <li key={a.id} className="flex items-baseline justify-end gap-2">
                  <span className="max-w-[10ch] truncate text-[11px] text-fg-muted">{a.name}</span>
                  <span className={R.t}>{formatMoneyShort(a.balance, a.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

/* --- This month ---------------------------------------------------------- */

function ThisMonth({ size }: WidgetProps) {
  const { state, data, currency, on } = useMoney();
  const spending = useSpending(on && size === "L");
  const daily = useDailyOut(on && size === "L");
  const nothing = data != null && !data.income_month && !data.expenses_month;
  const share = spentShare(data?.income_month, data?.expenses_month);
  const negative = (data?.net_month ?? 0) < 0;

  const figures = (
    <div className="grid grid-cols-3 gap-4">
      <div className="min-w-0">
        <p className="label-caps text-fg-muted">net</p>
        <p className={cn(R.m, "mt-2 truncate", negative ? "text-due" : "text-accent")}>
          {formatSigned(data?.net_month, currency) ?? "—"}
        </p>
      </div>
      <div className="min-w-0">
        <p className="label-caps text-fg-muted">In</p>
        <p className={cn(R.m, "mt-2 truncate")}>{formatMoneyShort(data?.income_month, currency) ?? "—"}</p>
      </div>
      <div className="min-w-0">
        <p className="label-caps text-fg-muted">Out</p>
        <p className={cn(R.m, "mt-2 truncate")}>{formatMoneyShort(data?.expenses_month, currency) ?? "—"}</p>
      </div>
    </div>
  );

  return (
    <WidgetCard
      title="This month"
      area="money"
      state={state}
      problem={PROBLEM}
      setup={SETUP}
      empty={
        nothing
          ? {
              title: "No transactions this month yet",
              text: "In and Out start counting from the first transaction dated this month.",
            }
          : null
      }
    >
      {size === "M" ? (
        <div className="mt-auto">{figures}</div>
      ) : (
        <>
          {figures}
          {share != null ? (
            <div className="flex flex-col gap-2 border-t border-divider pt-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex items-baseline gap-2">
                  <span className={R.s}>{Math.round(share * 100)}%</span>
                  <span className="text-[13px] text-fg-muted">of income spent</span>
                </p>
                <span className={cn(R.t, "text-fg-muted")}>
                  {formatMoneyShort(data?.expenses_month, currency)} /{" "}
                  {formatMoneyShort(data?.income_month, currency)}
                </span>
              </div>
              <SegmentMeter value={share} label={`${Math.round(share * 100)} percent of income spent`} />
            </div>
          ) : null}
          <OutByDay days={daily.data ?? []} currency={currency} />
          {spending.uncategorised && spending.uncategorised.amount > 0 ? (
            <Nudge
              amount={formatMoneyShort(spending.uncategorised.amount, currency) ?? ""}
              count={spending.uncategorised.count}
              href={spending.securoUrl}
            />
          ) : null}
        </>
      )}
    </WidgetCard>
  );
}

/** A day this far above the next-largest is drawn at the top with a cut,
 *  so one rent day doesn't flatten the rest of the month. */
const CLIP_RATIO = 2;

/** Out per day this month, the 1st through today. Days with nothing keep
 *  their slot as a sliver of track. */
function OutByDay({ days, currency }: { days: DayOut[]; currency: string }) {
  if (days.length === 0) return null;
  const sorted = days.map((d) => d.amount).sort((a, b) => b - a);
  const clipped = sorted[1] > 0 && sorted[0] > CLIP_RATIO * sorted[1];
  // With a clip, the runner-up sits at 85% and the outlier pins to the top.
  const top = Math.max(1, clipped ? sorted[1] / 0.85 : sorted[0]);
  const today = localDate();
  const month = new Date(`${days[0].date}T12:00:00`).toLocaleDateString(undefined, { month: "short" });
  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const outlier = clipped ? days.find((d) => d.amount === sorted[0]) : undefined;
  const every = days.length > 16 ? 5 : 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-caps text-fg-muted">Out by day · {month}</p>
        {outlier ? (
          <p className={cn(R.t, "truncate text-fg-muted")}>
            {label(outlier.date)} {formatMoneyShort(outlier.amount, currency)} · clipped
          </p>
        ) : null}
      </div>
      <div className="flex min-h-10 flex-1 items-end gap-[3px] max-lap:min-h-20 lap:gap-1">
        {days.map((d) => {
          const title = `${label(d.date)}: ${formatMoney(d.amount, currency)} out`;
          const cut = clipped && d.amount > top;
          return (
            <div key={d.date} role="img" aria-label={title} title={title} className="flex h-full min-w-0 flex-1 items-end">
              {d.amount > 0 ? (
                <div
                  className={cn("relative w-full rounded-t-[3px]", d.date === today ? "bg-accent" : "bg-accent/70")}
                  style={{ height: `${Math.max(4, Math.min(1, d.amount / top) * 100)}%` }}
                >
                  {cut ? (
                    <span aria-hidden className="absolute inset-x-[-2px] top-2 h-[3px] -skew-y-[14deg] bg-surface" />
                  ) : null}
                </div>
              ) : (
                <div className="h-[3px] w-full rounded-[3px] bg-surface-2" />
              )}
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex gap-[3px] lap:gap-1">
        {days.map((d, i) => (
          <span
            key={d.date}
            className={cn(R.t, "min-w-0 flex-1 text-center text-[10px] lap:text-[11px]", d.date === today ? "text-accent" : "text-fg-muted")}
          >
            {i % every === 0 || d.date === today ? Number(d.date.slice(8)) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Nudge({ amount, count, href }: { amount: string; count: number; href: string | null }) {
  const text = (
    <>
      <span className="tnum text-fg">{amount}</span> across {count}{" "}
      {count === 1 ? "transaction" : "transactions"} not categorised yet
    </>
  );
  return (
    <p className="mt-auto rounded-row bg-surface-2 px-3 py-2.5 text-[12px] leading-snug text-fg-muted lap:text-[13px]">
      {text}
      {href ? (
        <>
          {" — "}
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent">
            open Securo <ArrowRight aria-hidden strokeWidth={2.5} className="size-3.5" />
          </a>
        </>
      ) : null}
    </p>
  );
}

/* --- Upcoming bills ------------------------------------------------------ */

function inDays(date: string): string {
  const d = daysFromToday(`${date}T12:00:00`);
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}

function UpcomingBills({ size }: WidgetProps) {
  const { state, on } = useMoney();
  const bills = useBills(on, BILL_DAYS);
  const rows = (bills.data ?? []).filter((b) => daysFromToday(`${b.date}T12:00:00`) <= BILL_DAYS);
  const billsState = state === "ready" && bills.isPending ? "loading" : state === "ready" && bills.isError ? "error" : state;
  const total = rows.reduce((sum, b) => sum + b.amount, 0);
  const currency = rows[0]?.currency ?? "USD";
  const [next, ...rest] = rows;

  return (
    <WidgetCard
      title="Upcoming bills"
      area="money"
      state={billsState}
      problem={PROBLEM}
      setup={SETUP}
      empty={
        rows.length === 0
          ? {
              title: `Nothing due in the next ${BILL_DAYS} days`,
              text: "Bills list here once their recurring transactions are set up in Securo.",
            }
          : null
      }
      aside={size === "L" ? `next ${BILL_DAYS} days` : null}
    >
      {next && size === "M" ? (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{next.description}</p>
              <p className={cn(R.l, "mt-1.5")}>{formatMoneyShort(next.amount, next.currency)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn(R.xs, "text-accent")}>{inDays(next.date)}</p>
              <p className={cn(R.t, "mt-1 text-fg-muted")}>
                {new Date(`${next.date}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          {rest.length > 0 ? (
            <p className={cn(R.t, "truncate text-fg-muted")}>
              {rest.length} more in the next {BILL_DAYS} days ·{" "}
              <span className="text-fg">{formatMoney(rest.reduce((s, b) => s + b.amount, 0), currency)}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rows.map((bill, i) => {
              const d = new Date(`${bill.date}T12:00:00`);
              return (
                <li
                  key={`${bill.date}-${bill.description}-${i}`}
                  className="flex items-center gap-3 border-b border-divider py-2 last:border-0"
                >
                  <span className="w-9 shrink-0 text-center">
                    <span className="block text-[10px] text-fg-muted uppercase">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className={R.xs}>{d.getDate()}</span>
                  </span>
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(bill.color) ?? "var(--accent)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{bill.description}</span>
                    <span className={cn(R.t, "block text-fg-muted")}>{inDays(bill.date)}</span>
                  </span>
                  <span className={cn(R.xs, "shrink-0")}>{formatMoney(bill.amount, bill.currency)}</span>
                </li>
              );
            })}
          </ul>
          <p className={cn(R.t, "flex justify-between gap-3 border-t border-divider pt-2.5 text-fg-muted")}>
            <span>
              {rows.length} {rows.length === 1 ? "bill" : "bills"}
            </span>
            <span className="text-fg">{formatMoney(total, currency)}</span>
          </p>
        </>
      )}
    </WidgetCard>
  );
}

/* --- Where it went ------------------------------------------------------- */

function WhereItWent({ size }: WidgetProps) {
  const { state, data, currency, on } = useMoney();
  const spending = useSpending(on);
  const trend = useMonthlyTrend(on && size === "XL", 5);
  const spendState = state === "ready" && spending.isPending ? "loading" : state === "ready" && spending.isError ? "error" : state;
  const rows = spending.rows.slice(0, 6);
  const categorised = spending.rows.reduce((sum, r) => sum + r.amount, 0);
  const nothing = data != null && !data.expenses_month;

  const bars = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
      <ul className="flex min-h-0 flex-1 flex-col justify-around gap-1.5 overflow-hidden">
        {rows.map((row) => {
          const colour = categoryColor(row.color) ?? "var(--accent)";
          return (
            <li key={row.name} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
                <span className="truncate text-[13px] font-medium">{row.name}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="value-transition block h-full rounded-full"
                  style={{ width: `${Math.max(2, row.share * 100)}%`, backgroundColor: colour }}
                />
              </span>
              <span className={cn(R.t, "w-[8.5ch] text-right")}>
                {formatMoneyShort(row.amount, currency)}{" "}
                <span className="text-fg-muted">{Math.round(row.share * 100)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
      {spending.uncategorised && spending.uncategorised.amount > 0 ? (
        <Nudge
          amount={formatMoneyShort(spending.uncategorised.amount, currency) ?? ""}
          count={spending.uncategorised.count}
          href={spending.securoUrl}
        />
      ) : null}
    </div>
  );

  return (
    <WidgetCard
      title="Where it went"
      area="money"
      state={spendState}
      problem={PROBLEM}
      setup={SETUP}
      empty={
        nothing
          ? { title: "No transactions this month yet", text: "Category bars appear once spending is dated this month." }
          : null
      }
      aside={categorised > 0 ? `${formatMoneyShort(categorised, currency)} categorised` : null}
    >
      {size === "L" ? (
        bars
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lap:flex-row lap:gap-8">
          {bars}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lap:border-l lap:border-divider lap:pl-8">
            <div className="flex items-center justify-between gap-3">
              <p className="label-caps text-fg-muted">Last 5 months</p>
              <p className="flex items-center gap-3 text-[11px] text-fg-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-accent" /> In
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-accent-track" /> Out
                </span>
              </p>
            </div>
            <MonthPairs points={trend.points} currency={currency} />
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

function MonthPairs({ points, currency }: { points: { month: string; income: number; expenses: number; net: number }[]; currency: string }) {
  const top = Math.max(1, ...points.flatMap((p) => [p.income, p.expenses]));
  return (
    <div className="flex min-h-0 flex-1 items-end gap-3 max-lap:min-h-28">
      {points.map((p) => (
        <div key={p.month} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1">
            <div
              role="img"
              aria-label={`${monthLabel(p.month)} in ${formatMoneyShort(p.income, currency)}`}
              className="w-1/3 rounded-[3px] bg-accent"
              style={{ height: `${Math.max(2, (p.income / top) * 100)}%` }}
            />
            <div
              role="img"
              aria-label={`${monthLabel(p.month)} out ${formatMoneyShort(p.expenses, currency)}`}
              className="w-1/3 rounded-[3px] bg-accent-track"
              style={{ height: `${Math.max(2, (p.expenses / top) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-fg-muted">{monthLabel(p.month)}</span>
          <span className={cn(R.t, p.net < 0 ? "text-due" : "text-fg")}>{formatSigned(p.net, currency)}</span>
        </div>
      ))}
    </div>
  );
}

/* --- Area-only: Accounts, Goals, In vs Out -------------------------------- */

/** A secondary Money read: loading and failure come from its own query once
 *  the summary says Securo is on. */
function queryState(state: ReturnType<typeof useMoney>["state"], q: { isPending: boolean; isError: boolean }) {
  if (state !== "ready") return state;
  return q.isPending ? "loading" : q.isError ? "error" : "ready";
}

/** Every open account, largest balance either way first: a card's debt
 *  matters as much as savings do. */
function Accounts({ size }: WidgetProps) {
  const { state, on } = useMoney();
  const accounts = useAccounts(on);
  const rows = accounts.data ?? [];
  const shown = size === "M" ? rows.slice(0, 2) : rows;

  return (
    <WidgetCard
      title="Accounts"
      area="money"
      state={queryState(state, accounts)}
      problem={PROBLEM}
      setup={SETUP}
      empty={rows.length ? null : { title: "No accounts yet", text: "Accounts show here once they exist in Securo." }}
      aside={`${rows.length} open`}
    >
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {shown.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 border-b border-divider py-2 last:border-0">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{a.name}</span>
              {a.institution ? <span className={cn(R.t, "block truncate text-fg-muted")}>{a.institution}</span> : null}
            </span>
            <span className={cn(R.xs, "shrink-0", a.balance < 0 && "text-due")}>{formatMoney(a.balance, a.currency)}</span>
          </li>
        ))}
      </ul>
      {size === "M" && rows.length > 2 ? (
        <p className={cn(R.t, "text-fg-muted")}>+{rows.length - 2} more</p>
      ) : null}
    </WidgetCard>
  );
}

const ON_TRACK: Record<string, string> = { ahead: "ahead", on_track: "on track", behind: "behind", completed: "reached" };

function Goals({ size }: WidgetProps) {
  const { state, on } = useMoney();
  const goals = useGoals(on);
  const rows = goals.data ?? [];
  const shown = size === "M" ? rows.slice(0, 1) : rows;

  return (
    <WidgetCard
      title="Goals"
      area="money"
      state={queryState(state, goals)}
      problem={PROBLEM}
      setup={SETUP}
      empty={rows.length ? null : { title: "No goals yet", text: "Savings goals set up in Securo show here." }}
      aside={rows.length > 1 ? `${rows.length} active` : null}
    >
      <ul className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain">
        {shown.map((g) => {
          const by = g.target_date
            ? new Date(`${g.target_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })
            : null;
          return (
            <li key={g.name} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[14px] font-medium">{g.name}</span>
                <span className={cn(R.t, "shrink-0", g.on_track === "behind" ? "text-due" : "text-accent")}>
                  {g.on_track ? (ON_TRACK[g.on_track] ?? g.on_track) : `${Math.round(g.share * 100)}%`}
                </span>
              </div>
              <SegmentMeter value={g.share} label={`${g.name}: ${Math.round(g.share * 100)} percent`} />
              <p className={cn(R.t, "truncate text-fg-muted")}>
                {[
                  `${formatMoneyShort(g.current, g.currency)} of ${formatMoneyShort(g.target, g.currency)}`,
                  by && `by ${by}`,
                  g.monthly_contribution && `${formatMoneyShort(g.monthly_contribution, g.currency)}/mo`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

/** Income against spending month by month, so this month has something to
 *  be compared with. L is the last 6 months; XL the last 12. */
function InVsOut({ size }: WidgetProps) {
  const { state, currency, on } = useMoney();
  const months = size === "XL" ? 12 : TREND_MONTHS;
  const trend = useMonthlyTrend(on, months);
  const points = trend.points;
  const net = points.reduce((sum, p) => sum + p.net, 0);

  return (
    <WidgetCard
      title={points.length > 1 ? `In vs Out · ${points.length} months` : "In vs Out"}
      area="money"
      state={queryState(state, trend)}
      problem={PROBLEM}
      setup={SETUP}
      empty={points.length ? null : { title: "No months yet", text: "Each month's In and Out lands here once Securo has one." }}
      aside={points.length ? `net ${formatSigned(net, currency)}` : null}
    >
      <p className="flex items-center gap-3 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-accent" /> In
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-accent-track" /> Out
        </span>
      </p>
      <MonthPairs points={points} currency={currency} />
    </WidgetCard>
  );
}

export const MONEY_WIDGETS: WidgetDef[] = [
  { id: "securo.balance", title: "Balance", area: "money", sizes: ["S", "M"], placement: "anywhere", render: Balance },
  { id: "securo.this_month", title: "This month", area: "money", sizes: ["M", "L"], placement: "anywhere", render: ThisMonth },
  { id: "securo.where_it_went", title: "Where it went", area: "money", sizes: ["L", "XL"], placement: "anywhere", render: WhereItWent },
  { id: "securo.upcoming_bills", title: "Upcoming bills", area: "money", sizes: ["M", "L"], placement: "anywhere", render: UpcomingBills },
  { id: "securo.accounts", title: "Accounts", area: "money", sizes: ["M", "L"], placement: "area", render: Accounts },
  { id: "securo.goals", title: "Goals", area: "money", sizes: ["M", "L"], placement: "area", render: Goals },
  { id: "securo.in_vs_out", title: "In vs Out", area: "money", sizes: ["L", "XL"], placement: "area", render: InVsOut },
];
