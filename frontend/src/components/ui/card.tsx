/* Atlas's card. No border, no shadow, no gradient — a card is separated from
   the page only by being a different colour, which is why every accent ships
   with a dark tint of itself.

   Setting `data-accent` here is what rebinds --accent for everything inside, so
   a ring, a chart bar or a chip nested in this card colours itself without
   being told which area it belongs to. */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { Accent } from "@/lib/sections";
import { cn } from "@/lib/utils";

/** Desktop grid columns. The grid is 2-up until `desk`, so a 4 only widens
 *  there; a 2 is full width at every size below it. */
const spanClass: Record<1 | 2 | 4, string> = {
  1: "col-span-1",
  2: "col-span-2",
  4: "col-span-2 desk:col-span-4",
};

export interface CardProps {
  title: string;
  accent?: Accent;
  /** False keeps the accent bound for children but sits the card on --surface.
   *  Due this week works this way: neutral card, coral marks inside it. */
  tinted?: boolean;
  /** Keeps the title for screen readers but drops it from the page. For cards
   *  that already name themselves in an eyebrow, like Today's greeting. */
  titleHidden?: boolean;
  icon?: LucideIcon;
  /** Header right slot, before the icon — a status chip, or "avg 6h 48m". */
  aside?: ReactNode;
  span?: 1 | 2 | 4;
  /** This card gets one grid column, so its header has room for a title and one
   *  thing on the right. Set by the callers that place cards in a narrow slot. */
  narrow?: boolean;
  /** Full width on a phone, one column from 900px up. Listening and Due read
   *  as rows on a narrow screen and as tiles beside each other on a wide one. */
  phoneFull?: boolean;
  className?: string;
  /** Applied to the body, for cards that want their own padding rhythm. */
  bodyClassName?: string;
  children: ReactNode;
}

export function Card({
  title,
  accent,
  tinted = true,
  titleHidden = false,
  icon: Icon,
  aside,
  span = 1,
  narrow = false,
  phoneFull = false,
  className,
  bodyClassName,
  children,
}: CardProps) {
  // When a narrow card's source needs attention, the chip takes the right-hand
  // slot: the chip carries meaning, the icon is decoration. Wide cards fit both.
  const showIcon = !(aside && narrow);

  return (
    <section
      data-accent={accent}
      className={cn(
        "flex min-w-0 flex-col rounded-card p-4 lap:rounded-card-lg lap:p-6",
        accent && tinted ? "bg-accent-tint" : "bg-surface",
        phoneFull ? "col-span-2 lap:col-span-1" : spanClass[span],
        className,
      )}
    >
      {/* Wraps rather than overflows: a phone two-up tile is only ~133px of
          content wide, which a title plus a status chip will not share. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2
          className={cn(
            "min-w-0 truncate text-[13px] font-bold lap:text-[15px]",
            titleHidden && "sr-only",
            accent ? "text-accent" : "text-fg-muted",
          )}
        >
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          {Icon && showIcon ? (
            <Icon
              aria-hidden
              strokeWidth={2}
              className={cn("size-[22px] lap:size-[26px]", accent ? "text-accent" : "text-fg-dim")}
            />
          ) : null}
        </div>
      </header>

      {/* Pushes the card's big number to the bottom edge of the card. */}
      <div className={cn("flex min-w-0 flex-1 flex-col justify-between", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
