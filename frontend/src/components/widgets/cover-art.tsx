/* Cover art, with a fallback that keeps the card's shape.

   The image is served by atlas-api at /api/listening/cover/<id>, same origin:
   Audiobookshelf wants its API key on the request, and an `<img src>` pointing
   at ABS could only carry that key by publishing it to anything on the network
   with a view of the page.

   A missing cover is ordinary — ABS has plenty of items with no art — so a
   failed load falls back to the accent tile rather than leaving a broken image
   or collapsing the layout. */

import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

const boxes = {
  44: "size-11 rounded-[14px]",
  64: "size-16 rounded-[16px]",
  96: "size-24 rounded-[22px]",
} as const;

export function CoverArt({
  src,
  alt,
  size = 64,
  fallbackIcon,
  className,
}: {
  src: string | null | undefined;
  /** The book's title. Empty when the cover sits next to that title anyway —
   *  a screen reader should not read the same book twice. */
  alt: string;
  size?: 44 | 64 | 96;
  fallbackIcon: LucideIcon;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  // A new book gets a fresh chance at its cover: without this, one 404 would
  // keep the fallback showing after the card moved on to something else.
  useEffect(() => setBroken(false), [src]);

  if (!src || broken) {
    return <IconTile size={size} icon={fallbackIcon} className={className} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={cn("shrink-0 bg-accent-tint object-cover", boxes[size], className)}
    />
  );
}
