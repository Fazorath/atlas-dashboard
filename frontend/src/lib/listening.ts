/* The listening seam.

   Audiobookshelf is live-proxied, not archived, and for a sharper reason than
   Securo: the number on this card is a *position in a book*, which stops being
   true the second you press play on your phone. There is nothing stored in
   Atlas to go stale, and nothing here writes back — a read-only integration
   cannot lose your place.

   All formatting lives in this file. No component turns seconds into "4h 49m",
   so the card and anything added later can never disagree about what a
   half-hour looks like. */

import { useQuery } from "@tanstack/react-query";

import { getListening, type ListeningBook, type ListeningSummary } from "@/lib/api";

export const LISTENING_KEY = ["listening"] as const;

/* Every refetch is a round trip through atlas-api to ABS. Five minutes matches
   weather and finance; the position only moves while you are listening, and a
   card that is five minutes behind a chapter is not a card anyone notices. */
const REFETCH_MS = 5 * 60_000;

export interface ListeningQuery {
  isPending: boolean;
  isError: boolean;
  data: ListeningSummary | undefined;
}

export function useListening(): ListeningQuery {
  const query = useQuery({
    queryKey: LISTENING_KEY,
    queryFn: getListening,
    refetchInterval: REFETCH_MS,
  });

  return { isPending: query.isPending, isError: query.isError, data: query.data };
}

/** "4h 49m" / "58m" / "40s".

    Hours and minutes only once there is an hour to show: "4h 49m 12s" is three
    facts where the reader wanted one, and the seconds are stale before they are
    rendered. Null in means null out, so a caller can choose between a dash and
    showing nothing rather than being handed "NaN". */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  // Under a minute is worth saying for "listened today" — it is the difference
  // between "you pressed play" and "you have not started".
  return `${total}s`;
}

/** "82%". Rounded down, so a book that is not finished never reads as 100%. */
export function formatProgress(progress: number | null | undefined): string | null {
  if (progress == null || !Number.isFinite(progress)) return null;
  const pct = Math.max(0, Math.min(1, progress));
  return `${pct >= 1 ? 100 : Math.floor(pct * 100)}%`;
}

/** The line under the progress bar: "82% · 4h 49m left".

    An ebook has no audio duration, so there is nothing to have "left" — it
    shows its percentage alone rather than an invented time. */
export function progressLine(book: ListeningBook): string | null {
  const pct = formatProgress(book.progress);
  const left = book.kind === "audiobook" ? formatDuration(book.remaining_s) : null;
  return [pct, left && `${left} left`].filter(Boolean).join(" · ") || null;
}

/** "Robert Jordan · The Wheel of Time" — whichever of the two ABS actually has. */
export function bylineOf(book: ListeningBook): string | null {
  return [book.author, book.series].filter(Boolean).join(" · ") || null;
}
