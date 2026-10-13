/* The top of every Area screen: its name, and its Source's Freshness.

   Freshness lives here, not on Today: "checked 29m ago" is worth a glance once
   you are looking at the Area, and noise on a screen that is about today. A
   Source that needs you to act turns the line into a chip that says so and
   opens the Status screen. */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Chip } from "@/components/ui/chip";
import type { Area } from "@/lib/sections";
import { areaFreshness, freshnessTone, useSources } from "@/lib/sources";

export function AreaHeader({ area, actions }: { area: Area; actions?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4" data-accent={area.accent}>
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
          {area.label}
        </h1>
        {area.source ? <Freshness source={area.source} /> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

function Freshness({ source }: { source: string }) {
  const sources = useSources();
  const status = sources.statusOf(source);
  if (!status) return <span className="h-[18px]" aria-hidden />;

  const label = areaFreshness(status);
  const tone = freshnessTone(status);
  if (tone === "error" || tone === "setup") {
    return (
      <Link to="/status" className="self-start rounded-full">
        <Chip tone={tone} compact>
          {label} &middot; open Status
        </Chip>
      </Link>
    );
  }
  return <p className="text-[13px] leading-none font-semibold text-fg-muted">{label}</p>;
}
