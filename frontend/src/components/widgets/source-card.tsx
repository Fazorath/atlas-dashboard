/* What a card looks like when its phase has not landed, its credentials are
   missing, or its upstream just failed.

   The rule from the spec: an unconfigured source keeps its shape and its
   colour. It never degrades to a bare em-dash, and it never says "phase 5" —
   it says what you would do to switch it on. */

import type { ReactNode } from "react";

import { Card, type CardProps } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import type { SourceState } from "@/lib/sources";

/** Header badge. Nothing is shown while loading — a skeleton already says it. */
export function SourceChip({ state, source }: { state: SourceState; source: string }) {
  if (state === "error") {
    return (
      <Chip tone="error" compact>
        Couldn&rsquo;t reach {source}
      </Chip>
    );
  }
  if (state === "setup" || state === "idle") {
    return (
      <Chip tone="setup" compact>
        Needs setup
      </Chip>
    );
  }
  return null;
}

/** Sits where the big number would be. */
export function SourcePlaceholder({ state, hint }: { state: SourceState; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-2.5">
      <Skeleton width={48} height={10} pulse={state === "loading"} />
      {state === "loading" ? (
        <Skeleton width={120} height={10} pulse className="opacity-70" />
      ) : hint ? (
        <p className="max-w-[34ch] text-[13px] leading-snug font-semibold text-accent-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface SourceCardProps extends Omit<CardProps, "children" | "aside"> {
  state: SourceState;
  /** Name used in the failure chip, e.g. "Open-Meteo". */
  source: string;
  /** What the reader would do to switch this card on. */
  hint?: string;
  /** Rendered only when there is something real to show. On `error` it still
   *  renders, so a cached reading survives a failed sync. */
  children?: ReactNode;
}

export function SourceCard({ state, source, hint, children, ...card }: SourceCardProps) {
  const hasValue = children != null && (state === "ready" || state === "error");

  return (
    <Card {...card} aside={<SourceChip state={state} source={source} />}>
      {hasValue ? children : <SourcePlaceholder state={state} hint={hint} />}
    </Card>
  );
}
