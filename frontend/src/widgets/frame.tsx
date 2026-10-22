/* Pieces every Widget shares.

   A Widget is a Card that fills its tile exactly: the Board decides the
   tile's size, so the Card stretches to it and clips anything that would
   spill rather than pushing the grid.

   `WidgetCard` also owns the four states the catalog draws for every Widget —
   Loading (shapes only, never a number), Setup, Empty and Problem — so each
   Widget only describes what it looks like with data. A Problem replaces the
   reading outright: a stale figure is never shown as current. */

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AREAS, type AreaKey } from "@/lib/sections";
import type { SourceState } from "@/lib/sources";
import { cn } from "@/lib/utils";

/** The catalog's reading scale, all JetBrains Mono. */
export const R = {
  xl: "tnum text-[56px] leading-none tracking-[-0.02em]",
  // 34px on a phone: "$1,234" at 40px overflows a 171px tile.
  l: "tnum text-[34px] leading-none tracking-[-0.02em] lap:text-[40px]",
  m: "tnum text-[28px] leading-none tracking-[-0.01em]",
  s: "tnum text-[20px] leading-none",
  xs: "tnum text-[14px] leading-tight",
  t: "tnum text-[11px] leading-snug lap:text-[12px]",
} as const;

/** A reading with its units set small: "6h 30m" as 6 h 30 m. */
export function Units({ parts, className }: { parts: (string | number)[]; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="mr-[0.15em] text-[0.5em] text-fg-muted">
            {part}
          </span>
        ),
      )}
    </span>
  );
}

/** "6h 30m" → ["6", "h", "30", "m"] for `Units`. */
export function minutesParts(minutes: number): (string | number)[] {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? [h, "h", String(m).padStart(2, "0"), "m"] : [m, "m"];
}

export interface Problem {
  /** The chip: "Unreachable", "Reconnect", "Feed error". */
  chip: string;
  text: string;
}

export interface EmptyCopy {
  title: string;
  text: ReactNode;
}

export interface WidgetCardProps {
  title: string;
  area: AreaKey;
  /** Header right slot, mono — shown only with data. */
  aside?: ReactNode;
  state?: SourceState;
  /** Said in the Problem state. */
  problem?: Problem;
  /** Said in the Setup state: what would switch the Source on. */
  setup?: string;
  /** Set when the Source answered with nothing: replaces the body. */
  empty?: EmptyCopy | null;
  className?: string;
  bodyClassName?: string;
  /** Where a tap goes instead of the Area's screen — e.g. straight into an
   *  editor. Still followed on the Area's own Board. */
  to?: string;
  children?: ReactNode;
}

export function WidgetCard({
  title,
  area,
  aside,
  state = "ready",
  problem,
  setup,
  empty,
  className,
  bodyClassName,
  to,
  children,
}: WidgetCardProps) {
  const spec = AREAS[area];
  // On its own Area's Board a Widget is already where a tap would go.
  const { pathname } = useLocation();
  const home = !to && pathname === spec.to;
  const ready = state === "ready" && !empty;

  let body: ReactNode;
  if (state === "loading") body = <LoadingBody />;
  else if (state === "error")
    body = (
      <ProblemBody
        problem={problem ?? { chip: "Problem", text: `${title} couldn't be read.` }}
      />
    );
  else if (state === "setup" || state === "idle")
    body = (
      <ProblemBody
        tone="setup"
        problem={{ chip: "Set up", text: setup ?? "This Source isn't set up yet." }}
      />
    );
  else if (empty) body = <EmptyBody copy={empty} />;
  else body = children;

  return (
    <Card
      title={title}
      accent={spec.accent}
      to={home ? undefined : (to ?? spec.to)}
      aside={ready && aside ? <span className="tnum text-[11px] text-fg-muted lap:text-[12px]">{aside}</span> : null}
      className={cn("h-full min-h-0 overflow-hidden", className)}
      bodyClassName={cn("min-h-0 gap-2.5 pt-3 lap:gap-3.5 lap:pt-3.5", ready && bodyClassName)}
    >
      {body}
    </Card>
  );
}

function LoadingBody() {
  return (
    <div aria-label="Loading" className="flex flex-1 flex-col justify-end gap-2.5">
      <Skeleton width={72} height={22} pulse />
      <Skeleton width="60%" height={10} pulse className="opacity-70" />
    </div>
  );
}

function EmptyBody({ copy }: { copy: EmptyCopy }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] leading-snug font-medium">{copy.title}</p>
        <p className="text-[13px] leading-snug text-fg-muted">{copy.text}</p>
      </div>
      <span className="tnum text-[12px] text-fg-dim">&mdash;</span>
    </>
  );
}

function ProblemBody({ problem, tone = "problem" }: { problem: Problem; tone?: "problem" | "setup" }) {
  return (
    <>
      <div className="flex min-w-0 flex-col items-start gap-2.5">
        <span
          className={cn(
            "tnum inline-flex items-center gap-1.5 rounded-chip px-2 py-[3px] text-[12px]",
            tone === "problem" ? "bg-due-tint text-due" : "bg-money-tint text-setup-text",
          )}
        >
          {tone === "problem" ? <AlertTriangle aria-hidden strokeWidth={2} className="size-3" /> : null}
          {problem.chip}
        </span>
        <p className="line-clamp-3 text-[13px] leading-snug text-fg-muted">{problem.text}</p>
      </div>
      <Link to="/status" className="self-start text-[13px] font-medium text-accent">
        Open Status &rarr;
      </Link>
    </>
  );
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Lit in full accent; the rest sit a step back. */
  highlight?: boolean;
  /** Read out on hover and to screen readers. */
  title: string;
  /** Small mono figure above the bar. */
  caption?: string;
}

/** A plain row of bars on one scale, for "per day" and "per month" readings.
 *  An empty slot keeps its place as a sliver of track, never a zero-height
 *  gap. `labelEvery` thins the labels for long runs (30 nights). */
export function MiniBars({
  bars,
  labelEvery = 1,
  goal,
  className,
}: {
  bars: Bar[];
  labelEvery?: number;
  /** Draws a dotted line at this value, on the bars' scale. */
  goal?: number;
  className?: string;
}) {
  const top = Math.max(1, goal ? goal * 1.15 : 0, ...bars.map((b) => b.value));
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-1.5", className)}>
      <div className="relative flex min-h-0 flex-1 items-end gap-[3px] max-lap:min-h-24 lap:gap-1.5">
        {goal ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent-track"
            style={{ bottom: `${(goal / top) * 100}%` }}
          />
        ) : null}
        {bars.map((b) => (
          <div
            key={b.key}
            role="img"
            aria-label={b.title}
            title={b.title}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            {b.caption ? (
              <span className={cn(R.t, b.highlight ? "text-accent" : "text-fg-muted")}>
                {b.caption}
              </span>
            ) : null}
            {b.value > 0 ? (
              <div
                className={cn(
                  "value-transition w-full rounded-[4px]",
                  b.highlight ? "bg-accent" : "bg-accent/70",
                )}
                style={{ height: `${Math.max(4, (b.value / top) * 100)}%` }}
              />
            ) : (
              <div className="h-[3px] w-full rounded-[4px] bg-accent-track" />
            )}
          </div>
        ))}
      </div>
      <div aria-hidden className="flex gap-[3px] lap:gap-1.5">
        {bars.map((b, i) => (
          <span
            key={b.key}
            className={cn(
              "min-w-0 flex-1 text-center text-[10px] leading-3 font-medium whitespace-nowrap lap:text-[11px]",
              b.highlight ? "text-accent" : "text-fg-muted",
            )}
          >
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Monday-first week containing today, as local dates. */
export function calendarWeek(now = new Date()) {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return {
      date: day,
      label: day.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
      isToday: day.toDateString() === now.toDateString(),
    };
  });
}
