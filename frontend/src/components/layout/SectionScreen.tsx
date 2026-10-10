/* Sleep, School and Money are not designed in detail yet, so they share one
   skeleton that applies the system: the section's accent on the title rule, one
   hero card carrying the key number, and a list of rounded rows beneath it.

   When a phase lands, the page keeps this shape and swaps its `hero` and `rows`
   for real content — the layout is not the thing that changes. */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { SourceChip, SourcePlaceholder } from "@/components/widgets/source-card";
import type { Accent } from "@/lib/sections";
import type { SourceState } from "@/lib/sources";

export function SectionScreen({
  title,
  accent,
  icon,
  heroTitle,
  source,
  hint,
  state,
  scaffold,
  listTitle,
  listHint,
}: {
  title: string;
  accent: Accent;
  icon: LucideIcon;
  heroTitle: string;
  /** Named in the failure chip. */
  source: string;
  hint: string;
  state: SourceState;
  /** The empty shape of this section's chart — a ring, a bar, a row stack. */
  scaffold?: ReactNode;
  listTitle: string;
  listHint: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[14px] lap:gap-5">
      <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
        {title}
      </h1>

      <Card
        title={heroTitle}
        accent={accent}
        icon={icon}
        aside={<SourceChip state={state} source={source} />}
        bodyClassName="gap-5 pt-4"
      >
        {scaffold ? (
          <div className="flex items-center gap-5">
            {scaffold}
            <div className="min-w-0 flex-1">
              <SourcePlaceholder state={state} hint={hint} />
            </div>
          </div>
        ) : (
          <SourcePlaceholder state={state} hint={hint} />
        )}
      </Card>

      <Card title={listTitle} accent={accent} tinted={false}>
        <div className="flex flex-col gap-2.5 pt-3">
          <ul className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                aria-hidden
                className="h-[54px] rounded-row bg-surface-2"
                style={{ opacity: 1 - i * 0.25 }}
              />
            ))}
          </ul>
          <p className="text-[13px] leading-snug font-semibold text-accent-soft">{listHint}</p>
        </div>
      </Card>
    </div>
  );
}
