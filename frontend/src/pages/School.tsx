/* School — Phase 6. The Today card's list, with room.

   One hero with the week's ring, then three stacks: what's late, what's coming
   (grouped under its day, so each row only has to say the time), and the last
   month — the part of the archive Canvas's own feed has already forgotten.

   Until there is data, the page is the shared SectionScreen skeleton, so an
   unconfigured School looks like every other unconfigured section. */

import { useState } from "react";

import { SectionScreen } from "@/components/layout/SectionScreen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { AssignmentRow } from "@/components/widgets/assignment-row";
import { SourceChip } from "@/components/widgets/source-card";
import {
  groupByDay,
  usePastAssignments,
  useSchool,
  useToggleAssignment,
  type Assignment,
} from "@/lib/school";
import { NAV_SECTIONS } from "@/lib/sections";
import { cardState, SOURCE, useSources, type SourceState } from "@/lib/sources";
import { timeAgo } from "@/lib/utils";

const SCHOOL_ICON = NAV_SECTIONS[2].icon;

/** Three weeks ahead: far enough to see a midterm coming, short enough that
 *  the list is still about this stretch of term. */
const AHEAD_DAYS = 21;
const PAST_DAYS = 30;
const PAST_PREVIEW = 5;

export function School() {
  const sources = useSources();
  const school = useSchool(AHEAD_DAYS);
  const state = cardState(sources.stateOf(SOURCE.school), school, "archive");
  const data = school.data?.configured && school.data.fetched_at ? school.data : null;

  if (!data) {
    return (
      <SectionScreen
        title="School"
        accent="due"
        icon={SCHOOL_ICON}
        heroTitle="Due this week"
        source="Canvas"
        hint={
          school.data?.configured
            ? "Waiting on the first sync from your Canvas feed."
            : "Paste your Canvas calendar feed URL into .env to pull assignments in."
        }
        state={state}
        listTitle="Assignments"
        listHint="Each assignment lists with its due date and your own done tick."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[14px] lap:gap-5">
      <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
        School
      </h1>

      <WeekHero
        done={data.week_done}
        total={data.week_total}
        overdue={data.overdue.length}
        fetchedAt={data.fetched_at}
        state={state}
      />

      {data.overdue.length > 0 ? (
        <Card title="Overdue" accent="due" tinted={false} bodyClassName="pt-3">
          <RowList items={data.overdue} />
        </Card>
      ) : null}

      <ComingUp items={data.upcoming} />

      <PastMonth exclude={data.overdue} />
    </div>
  );
}

function WeekHero({
  done,
  total,
  overdue,
  fetchedAt,
  state,
}: {
  done: number;
  total: number;
  overdue: number;
  fetchedAt: string | null;
  state: SourceState;
}) {
  const left = total - done;
  const headline =
    total === 0 ? "Nothing due this week" : left === 0 ? "All done. Nice." : `${left} left this week`;

  const detail = [
    overdue > 0 && `${overdue} overdue`,
    total > 0 && `${done} of ${total} ticked`,
    fetchedAt && `Canvas checked ${timeAgo(fetchedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      title="This week"
      titleHidden
      accent="due"
      aside={state === "ready" ? null : <SourceChip state={state} source="Canvas" />}
      bodyClassName="pt-4"
    >
      <div className="flex items-center gap-5">
        <ProgressRing
          size={88}
          stroke={10}
          value={total > 0 ? done / total : 0}
          muted={total === 0}
          label={total > 0 ? `${done} of ${total} assignments this week done` : "Nothing due this week"}
        >
          {total > 0 ? (
            <span className="tnum text-[20px] leading-none font-extrabold">{`${done}/${total}`}</span>
          ) : null}
        </ProgressRing>

        <div className="min-w-0">
          <p className="eyebrow">This week</p>
          <p className="mt-1.5 text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
            {headline}
          </p>
          {detail ? (
            <p className="tnum mt-1 text-[13px] font-semibold text-accent-soft">{detail}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function RowList({
  items,
  timeOnly = false,
  showLate = true,
}: {
  items: Assignment[];
  timeOnly?: boolean;
  showLate?: boolean;
}) {
  const toggle = useToggleAssignment();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <li key={a.ics_uid}>
          <AssignmentRow
            assignment={a}
            timeOnly={timeOnly}
            showLate={showLate}
            onToggle={() => toggle.mutate(a.ics_uid)}
          />
        </li>
      ))}
    </ul>
  );
}

function ComingUp({ items }: { items: Assignment[] }) {
  const days = groupByDay(items);

  return (
    <Card title="Coming up" accent="due" tinted={false} bodyClassName="pt-3">
      {days.length === 0 ? (
        <p className="text-[13px] leading-snug font-semibold text-accent-soft">
          Canvas lists nothing for the next three weeks.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <section key={day.key} className="flex flex-col gap-2">
              <h3 className="eyebrow">{day.label}</h3>
              <RowList items={day.items} timeOnly />
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Overdue rows are already on screen above; listing them twice would make one
 *  late assignment read as two. */
function PastMonth({ exclude }: { exclude: Assignment[] }) {
  const past = usePastAssignments(PAST_DAYS);
  const [all, setAll] = useState(false);
  const skip = new Set(exclude.map((a) => a.ics_uid));
  const items = (past.data ?? []).filter((a) => !skip.has(a.ics_uid));
  if (items.length === 0) return null;

  const ticked = items.filter((a) => a.done).length;
  const shown = all ? items : items.slice(0, PAST_PREVIEW);

  return (
    <Card
      title="Last 30 days"
      accent="due"
      tinted={false}
      bodyClassName="pt-3"
      aside={
        <span className="tnum text-[12px] font-semibold text-fg-muted">
          {ticked} of {items.length} ticked
        </span>
      }
    >
      <div className="flex flex-col gap-2.5">
        <RowList items={shown} showLate={false} />
        {items.length > PAST_PREVIEW ? (
          <Button variant="ghost" className="self-start px-2" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
