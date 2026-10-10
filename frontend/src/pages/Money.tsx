/* Money — Phase 3.

   The first section screen with a real design behind it rather than the shared
   `SectionScreen` scaffold. Four cards, each answering one question: what do I
   have, what moved this month, where did it go, and is this month normal.

   Everything is read live from Securo through atlas-api. Nothing financial is
   stored in Atlas, which is why there is no "last synced" line anywhere on this
   page — the numbers are as old as the request that fetched them.

   Two rules from the spec shape the empty state. A card that cannot fill itself
   yet keeps its shape and its colour, so the category rows and the trend bars
   are drawn at every state and only their values wait. And the instruction to
   switch the source on is given once, on the card that owns the headline
   number; the rest say what will appear there, because four copies of the same
   sentence down one page reads as an error, not as help.

   Two colour rules meet here as well. The page is `money`, so amber is
   inherited by every bar and title inside it. The one exception is the category
   list, where the dot and the bar take Securo's own category colour: those
   categories are already colour-coded in Securo, and matching them is what
   makes the list scannable instead of a wall of amber. */

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Badge, Chip } from "@/components/ui/chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceChip, SourcePlaceholder } from "@/components/widgets/source-card";
import { NAV_SECTIONS } from "@/lib/sections";
import { cardState, SOURCE, useSources, type SourceState } from "@/lib/sources";
import {
  asOfLabel,
  categoryColor,
  formatMoney,
  formatMoneyShort,
  formatSigned,
  monthLabel,
  spentShare,
  TREND_MONTHS,
  useFinance,
  useMonthlyTrend,
  useSpending,
} from "@/lib/money";

const MONEY_ICON = NAV_SECTIONS[3].icon;

/** Said once, on the card that owns the headline number. */
const SETUP_HINT =
  "Add your Securo email and password to .env to read balances and spending live.";

/** Rows drawn in the category list and columns in the trend chart before there
 *  is anything to put in them — enough to give each card its height. */
const GHOST_ROWS = 4;

export function Money() {
  const sources = useSources();
  const finance = useFinance();

  const state = cardState(sources.stateOf(SOURCE.finance), finance, "live");
  const data = finance.data;
  const currency = data?.currency ?? "USD";

  // The detail cards only fetch once the summary says the source is on, so an
  // unconfigured visit costs one request rather than three.
  const live = state === "ready" || state === "error";
  const spending = useSpending(live);
  const trend = useMonthlyTrend(live);

  const balance = formatMoney(data?.balance, currency);
  const asOf = asOfLabel(data?.balance_date);
  const projected = formatMoneyShort(data?.projected_balance, currency);
  const pending = data?.pending_categorization ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[14px] lap:gap-5">
      <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
        Money
      </h1>

      {/* Balance. The one number worth opening this page for, so it gets a card
          to itself, the largest type in the app, and the page's only tint. */}
      <Card
        title="Balance"
        accent="money"
        icon={MONEY_ICON}
        aside={<SourceChip state={state} source="Securo" />}
        bodyClassName="gap-4 pt-4"
      >
        {balance ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="tnum text-[40px] leading-none font-extrabold tracking-[-0.03em] lap:text-[56px]">
                {balance}
              </p>
              {asOf ? (
                <p className="text-[13px] font-semibold text-accent-soft">as of {asOf}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {projected ? <Badge accent>Projected {projected}</Badge> : null}
              {data?.accounts_count ? (
                <Badge>
                  {data.accounts_count} {data.accounts_count === 1 ? "account" : "accounts"}
                </Badge>
              ) : null}
              {pending > 0 ? <Badge>{pending} to categorise</Badge> : null}
            </div>
          </>
        ) : (
          <SourcePlaceholder state={state} hint={SETUP_HINT} />
        )}
      </Card>

      <ThisMonth state={state} data={data} currency={currency} />

      <WhereItWent
        state={state}
        currency={currency}
        rows={spending.rows}
        isPending={spending.isPending}
      />

      <InVsOut
        state={state}
        currency={currency}
        points={trend.points}
        isPending={trend.isPending}
      />
    </div>
  );
}

/** The line under a card's scaffold: what will appear there, or a pulsing bar
 *  while the answer is still in flight. Never the setup sentence again — the
 *  balance card above has already given it. */
function Note({ state, text }: { state: SourceState; text: string }) {
  if (state === "loading") return <Skeleton width={180} height={10} pulse />;
  return <p className="text-[13px] leading-snug font-semibold text-accent-soft">{text}</p>;
}

/** What came in against what went out, and the one derived number that makes
 *  the pair mean something: the share of income that was spent. */
function ThisMonth({
  state,
  data,
  currency,
}: {
  state: SourceState;
  data: ReturnType<typeof useFinance>["data"];
  currency: string;
}) {
  const income = data?.income_month ?? null;
  const expenses = data?.expenses_month ?? null;
  const net = data?.net_month ?? null;
  const share = spentShare(income, expenses);
  const hasFigures = income != null && expenses != null;

  return (
    <Card
      title="This month"
      accent="money"
      tinted={false}
      aside={
        net != null ? (
          <span
            className={
              net < 0
                ? "tnum text-[13px] font-extrabold text-due"
                : "tnum text-[13px] font-extrabold text-accent"
            }
          >
            {formatSigned(net, currency)}
          </span>
        ) : null
      }
      bodyClassName="gap-4 pt-4"
    >
      {/* Drawn at every state: two labelled boxes are the shape of this card,
          and an empty one still says "in" and "out". */}
      <div className="grid grid-cols-2 gap-3">
        <Figure label="In" value={hasFigures ? formatMoney(income, currency) : null} />
        <Figure label="Out" value={hasFigures ? formatMoney(expenses, currency) : null} />
      </div>

      {!hasFigures ? (
        <Note state={state} text="This month's income and spending land here." />
      ) : share != null ? (
        <div className="flex flex-col gap-2">
          <ProgressBar
            value={share}
            height={10}
            label={`Spent ${Math.round(share * 100)} percent of income this month`}
          />
          <p className="text-[13px] font-semibold text-fg-muted">
            {Math.round(share * 100)}% of what came in has gone back out
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-row bg-surface-2 px-4 py-3">
      <span className="text-[12px] font-bold text-fg-muted">{label}</span>
      {value ? (
        <span className="tnum text-[20px] leading-tight font-extrabold lap:text-[24px]">
          {value}
        </span>
      ) : (
        // A skeleton rather than an em-dash: the number is missing, not zero.
        <Skeleton width={84} height={14} />
      )}
    </div>
  );
}

/** Spending by category, biggest first. The API already trims and sorts. */
function WhereItWent({
  state,
  currency,
  rows,
  isPending,
}: {
  state: SourceState;
  currency: string;
  rows: ReturnType<typeof useSpending>["rows"];
  isPending: boolean;
}) {
  const ready = state === "ready" || state === "error";
  const hasRows = ready && !isPending && rows.length > 0;

  return (
    <Card title="Where it went" accent="money" tinted={false} bodyClassName="gap-3 pt-4">
      {hasRows ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            // Securo's colour when it gave us a usable one, the page's amber
            // otherwise — never a missing mark.
            const colour = categoryColor(row.color) ?? "var(--accent)";
            return (
              <li
                key={row.name}
                className="flex flex-col gap-2.5 rounded-row bg-surface-2 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colour }}
                    />
                    <span className="truncate text-[14px] font-bold">{row.name}</span>
                  </span>
                  <span className="tnum shrink-0 text-[14px] font-extrabold">
                    {formatMoney(row.amount, currency)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* A neutral track, not the amber one the rest of the page
                      uses: these fills carry Securo's category colours, and an
                      amber groove under a blue bar reads as a third colour. */}
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                    <div
                      className="value-transition h-full rounded-full"
                      style={{
                        width: `${Math.max(2, row.share * 100)}%`,
                        backgroundColor: colour,
                      }}
                    />
                  </div>
                  <span className="tnum w-9 shrink-0 text-right text-[12px] font-bold text-fg-muted">
                    {Math.round(row.share * 100)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <ul aria-hidden className="flex flex-col gap-2">
            {Array.from({ length: GHOST_ROWS }, (_, i) => (
              <li
                key={i}
                className="h-[62px] rounded-row bg-surface-2"
                style={{ opacity: 1 - i * 0.2 }}
              />
            ))}
          </ul>
          {ready && !isPending ? (
            <Chip tone="idle">Nothing categorised this month yet</Chip>
          ) : (
            <Note state={state} text="Your spending, broken down by category, lands here." />
          )}
        </>
      )}
    </Card>
  );
}

/** Six months of income against expenses, so this month has something to be
 *  compared with. Paired bars rather than a line: there are only two series and
 *  a dozen values, and the question is "which of the two is taller". */
function InVsOut({
  state,
  currency,
  points,
  isPending,
}: {
  state: SourceState;
  currency: string;
  points: ReturnType<typeof useMonthlyTrend>["points"];
  isPending: boolean;
}) {
  const ready = state === "ready" || state === "error";
  const hasPoints = ready && !isPending && points.length > 0;
  // One scale across both series, or the two bars in a column would not be
  // comparable with each other.
  const ceiling = Math.max(1, ...points.flatMap((p) => [p.income, p.expenses]));

  // Securo returns what it has, which early on is fewer months than were asked
  // for. Name the window that came back rather than the one requested, so the
  // title never promises six columns and draws four.
  const months = hasPoints ? points.length : TREND_MONTHS;

  return (
    <Card
      title={months === 1 ? "Last month" : `Last ${months} months`}
      accent="money"
      tinted={false}
      aside={
        hasPoints ? (
          <span className="flex items-center gap-3 text-[12px] font-bold">
            <Legend swatch="bg-accent-soft" label="In" />
            <Legend swatch="bg-accent" label="Out" />
          </span>
        ) : null
      }
      bodyClassName="gap-4 pt-5"
    >
      {hasPoints ? (
        <ul className="flex items-end gap-2" style={{ height: 132 }}>
          {points.map((point) => (
            <li
              key={point.month}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              // The bars carry the shape; this carries the numbers, for a
              // pointer and for a screen reader alike.
              title={`${monthLabel(point.month)}: in ${formatMoney(point.income, currency)}, out ${formatMoney(point.expenses, currency)}`}
            >
              <div className="flex w-full items-end justify-center gap-1" style={{ height: 100 }}>
                <Bar value={point.income} ceiling={ceiling} className="bg-accent-soft" />
                <Bar value={point.expenses} ceiling={ceiling} className="bg-accent" />
              </div>
              <span className="truncate text-[11px] font-bold text-fg-muted">
                {monthLabel(point.month)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {/* The chart's own silhouette, so the card does not change height when
              the numbers arrive. Varied so it reads as a chart, not a loader. */}
          <div aria-hidden className="flex items-end gap-2" style={{ height: 132 }}>
            {Array.from({ length: TREND_MONTHS }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-[8px] bg-accent-track"
                style={{ height: 44 + ((i * 23) % 56) }}
              />
            ))}
          </div>
          <Note state={state} text="Six months of income against spending lands here." />
        </>
      )}
    </Card>
  );
}

function Bar({
  value,
  ceiling,
  className,
}: {
  value: number;
  ceiling: number;
  className: string;
}) {
  // A floor of 2% so a month with no spending still reads as an empty column
  // rather than a missing one.
  const height = Math.max(2, Math.min(100, (value / ceiling) * 100));
  return (
    <div
      aria-hidden
      className={`value-transition w-1/3 rounded-t-[6px] ${className}`}
      style={{ height: `${height}%` }}
    />
  );
}

function Legend({ swatch, label }: { swatch: string; label: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-fg-muted">
      <span aria-hidden className={`size-2 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}
