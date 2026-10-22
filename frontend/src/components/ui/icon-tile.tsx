/* A rounded square holding one mark: cover art on Listening, a letter on a
   habit row. Two fills — `solid` puts the accent behind a dark glyph, `soft`
   puts the tint behind an accent glyph. */

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const sizes = {
  44: { box: "size-11 rounded-[14px]", glyph: "size-5 text-[17px]" },
  64: { box: "size-16 rounded-[16px]", glyph: "size-7 text-[22px]" },
  96: { box: "size-24 rounded-[22px]", glyph: "size-10 text-[32px]" },
} as const;

export function IconTile({
  size = 44,
  variant = "solid",
  icon: Icon,
  letter,
  className,
}: {
  size?: 44 | 64 | 96;
  variant?: "solid" | "soft";
  icon?: LucideIcon;
  letter?: string;
  className?: string;
}) {
  const s = sizes[size];
  const solid = variant === "solid";

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        s.box,
        solid ? "bg-accent text-accent-tint" : "bg-accent-tint text-accent",
        className,
      )}
    >
      {Icon ? (
        <Icon strokeWidth={2} className={s.glyph} />
      ) : (
        <span className={cn("leading-none font-extrabold", s.glyph.split(" ")[1])}>{letter}</span>
      )}
    </span>
  );
}
