/* Today is a Board (ADR 0002): an arrangeable grid of Widgets from any Area,
   starting from the agreed default — Weather Now S · Balance S · Next class M
   / Sleep week L · Due soon L / Now listening M · Today's habits M. The
   greeting is a plain heading in the toolbar, beside Edit. Everything about the grid, Edit mode and the Widget gallery is in
   `components/board`; every Widget is in `widgets/`.

   Plumbing stays off this screen: Freshness lives in each Area's header and
   the Sources list on the Status screen. The one plumbing fact Today shows is
   a single Problem chip, only when something is wrong, plus Google's
   reconnect banner when the weekly sign-in is about to lapse. */

import { AlertCircle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Board } from "@/components/board/Board";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { Chip } from "@/components/ui/chip";
import { ReconnectBanner } from "@/components/widgets/fitbit-connection";
import { areaEnabled, ownerName } from "@/lib/config";
import { problemsOf, useSources } from "@/lib/sources";
import { useSleep } from "@/lib/sleep";

export function Today() {
  const name = ownerName();
  return (
    <div className="flex flex-col gap-3 lap:gap-4">
      {areaEnabled("health") ? <SleepBanner /> : null}
      <Board
        board="today"
        leading={
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">{name ? `Hello, ${name}!` : "Hello!"}</h1>
            <ProblemChip />
          </div>
        }
        trailing={<AccountMenu className="lap:hidden" />}
      />
    </div>
  );
}

/** One chip, only when a Source needs you, leading to the Status screen. */
function ProblemChip() {
  const sources = useSources();
  const problems = problemsOf(sources.all);
  if (sources.isError) {
    return (
      <Link to="/status" className="inline-block rounded-full">
        <Chip tone="error">The API is not answering — check atlas-api is running</Chip>
      </Link>
    );
  }
  if (problems.length === 0) return null;
  const text = problems.length === 1 ? problems[0].title : `${problems.length} sources need attention`;
  return (
    <Link to="/status" className="inline-block rounded-full">
      <Chip tone="error">
        <AlertCircle aria-hidden strokeWidth={2.4} className="-ml-1 size-4" />
        <span className="truncate">{text}</span>
        <ChevronRight aria-hidden strokeWidth={2.4} className="-mr-1 size-4" />
      </Chip>
    </Link>
  );
}

/** Only there when Google needs a click: the weekly sign-in has lapsed, or is
    inside its last two days. */
function SleepBanner() {
  const sleep = useSleep();
  return <ReconnectBanner conn={sleep.data?.connection} />;
}
