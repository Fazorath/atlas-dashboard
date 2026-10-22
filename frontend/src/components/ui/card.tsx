/* Atlas's card: an instrument panel. Every card is the same near-black surface
   with a hairline edge — no tint, no shadow, no gradient — and the area's
   accent is spent only on the square beside the title and on the data marks
   inside, so colour always means "this is a reading".

   Setting `data-accent` here is what rebinds --accent for everything inside, so
   a ring, a chart bar or a chip nested in this card colours itself without
   being told which area it belongs to.

   A card with `to` opens that Area. The title is the real link — the keyboard
   and screen-reader path — and a tap anywhere on the card that isn't already
   on a control follows it too, so a Due card's ticks and a book's ABS link
   keep working inside a card that is itself a way in. */

import { ChevronRight, type LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  /** The Area this card opens. */
  to?: string;
  children: ReactNode;
}

const INTERACTIVE = "a, button, input, label, select, textarea, summary, [role=button]";

export function Card({
  title,
  accent,
  titleHidden = false,
  icon: Icon,
  aside,
  span = 1,
  narrow = false,
  phoneFull = false,
  className,
  bodyClassName,
  to,
  children,
}: CardProps) {
  const navigate = useNavigate();
  // When a narrow card's source needs attention, the chip takes the right-hand
  // slot: the chip carries meaning, the icon is decoration. Wide cards fit both.
  const showIcon = !(aside && narrow);

  const open = to
    ? (event: MouseEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest(INTERACTIVE)) return;
        // A drag to select text is not a tap.
        if (window.getSelection()?.toString()) return;
        navigate(to);
      }
    : undefined;

  const heading = cn("label-caps min-w-0 text-fg-muted", titleHidden && "sr-only");
  // The area's mark: a small accent square ahead of the title.
  const mark = accent ? <span aria-hidden className="size-1.5 shrink-0 bg-accent" /> : null;

  return (
    <section
      data-accent={accent}
      onClick={open}
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border-subtle bg-surface p-4 lap:rounded-card-lg lap:p-6",
        phoneFull ? "col-span-2 lap:col-span-1" : spanClass[span],
        to && "cursor-pointer",
        className,
      )}
    >
      {/* Wraps rather than overflows: a phone two-up tile is only ~133px of
          content wide, which a title plus a status chip will not share. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {to ? (
          <h2 className={cn(heading, "min-w-0")}>
            <Link
              to={to}
              className="inline-flex max-w-full items-center gap-2 rounded-chip outline-offset-4"
            >
              {mark}
              <span className="truncate">{title}</span>
              <ChevronRight aria-hidden strokeWidth={2.5} className="-ml-1 size-3.5 shrink-0 opacity-70" />
            </Link>
          </h2>
        ) : (
          <h2 className={cn(heading, "flex items-center gap-2")}>
            {mark}
            <span className="truncate">{title}</span>
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          {Icon && showIcon ? (
            <Icon
              aria-hidden
              strokeWidth={2}
              className="size-[18px] text-fg-dim lap:size-5"
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
