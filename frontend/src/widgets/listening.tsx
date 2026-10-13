/* Listening's Widgets — module audiobookshelf. A live, read-only proxy: a
   position in a book stops being true the moment you press play elsewhere,
   so nothing is cached and nothing is written back. */

import { ProgressBar } from "@/components/ui/progress-bar";
import { CoverArt } from "@/components/widgets/cover-art";
import { localDate } from "@/lib/habits";
import { bylineOf, formatDuration, formatProgress, useListening, useListeningStats } from "@/lib/listening";
import { LISTENING_ICON } from "@/lib/sections";
import { cardState, SOURCE, useSources } from "@/lib/sources";
import { cn, timeAgo } from "@/lib/utils";
import type { ListeningBook } from "@/lib/api";
import { calendarWeek, MiniBars, R, WidgetCard, type Problem } from "@/widgets/frame";
import type { WidgetDef, WidgetProps } from "@/widgets/types";

const PROBLEM: Problem = { chip: "Unreachable", text: "Audiobookshelf isn't answering — check it on Status." };
const SETUP = "Needs an Audiobookshelf API key from Settings, API Keys.";

function useAbs() {
  const sources = useSources();
  const listening = useListening();
  const state = cardState(sources.stateOf(SOURCE.listening), listening, "live");
  return { state, data: listening.data?.configured ? listening.data : null };
}

function left(book: ListeningBook): string {
  const pct = formatProgress(book.progress);
  const rest = formatDuration(book.remaining_s);
  return [pct, rest && `${rest} left`].filter(Boolean).join(" · ");
}

/* --- Now listening ------------------------------------------------------- */

function NowListening({ size }: WidgetProps) {
  const { state, data } = useAbs();
  const stats = useListeningStats(7);
  const book = data?.current ?? null;

  return (
    <WidgetCard
      title="Listening"
      area="listening"
      state={state}
      problem={PROBLEM}
      setup={SETUP}
      empty={book ? null : { title: "Nothing in progress", text: "Start a book in Audiobookshelf and it shows here." }}
    >
      {book ? (
        size === "S" ? (
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5">
            <div className="flex min-w-0 items-end gap-3">
              <CoverArt src={book.cover_url} alt="" size={64} fallbackIcon={LISTENING_ICON} />
              <p className={cn(R.t, "min-w-0 truncate text-fg-muted")}>{book.author}</p>
            </div>
            <div className="flex items-center gap-2">
              <ProgressBar value={book.progress} height={6} label={`${book.title} ${formatProgress(book.progress)} finished`} />
              <span className={cn(R.t, "text-fg-muted")}>{formatProgress(book.progress)}</span>
            </div>
          </div>
        ) : (
          <>
            <BookLine book={book} />
            {size === "L" ? (
              <>
                <TodayBars days={stats.data?.configured ? stats.data.days : []} todayS={data?.today_s ?? 0} />
                <ul className="flex flex-col gap-1.5 border-t border-divider pt-3">
                  {(data?.in_progress ?? [])
                    .filter((b) => b.item_id !== book.item_id)
                    .slice(0, 2)
                    .map((b) => (
                      <li key={b.item_id} className="flex items-center gap-3">
                        <CoverArt src={b.cover_url} alt="" size={44} fallbackIcon={LISTENING_ICON} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{b.title}</span>
                          <span className="block truncate text-[11px] text-fg-muted">{b.author}</span>
                        </span>
                        <span className={cn(R.t, "text-fg-muted")}>{formatProgress(b.progress)}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </>
        )
      ) : null}
    </WidgetCard>
  );
}

function BookLine({ book }: { book: ListeningBook }) {
  const byline = bylineOf(book);
  return (
    <div className="flex min-w-0 items-center gap-4">
      <CoverArt src={book.cover_url} alt="" size={96} fallbackIcon={LISTENING_ICON} className="hidden lap:block" />
      <CoverArt src={book.cover_url} alt="" size={64} fallbackIcon={LISTENING_ICON} className="lap:hidden" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[15px] leading-tight font-medium lap:text-[17px]">{book.title}</p>
          {byline ? <p className="mt-1 truncate text-[12px] text-fg-muted lap:text-[13px]">{byline}</p> : null}
        </div>
        <ProgressBar value={book.progress} height={6} label={`${book.title} ${formatProgress(book.progress)} finished`} />
        <p className={cn(R.t, "text-fg-muted")}>{left(book)}</p>
      </div>
    </div>
  );
}

function TodayBars({ days, todayS }: { days: { date: string; seconds: number }[]; todayS: number }) {
  const byDate = new Map(days.map((d) => [d.date, d.seconds]));
  const week = calendarWeek();
  return (
    <div className="flex min-h-0 flex-1 items-end gap-5">
      <div className="shrink-0">
        <p className={R.m}>{todayS ? formatDuration(todayS) : "0m"}</p>
        <p className="mt-1 text-[12px] text-fg-muted">today</p>
      </div>
      <MiniBars
        className="h-full"
        bars={week.map((d) => {
          const key = localDate(d.date);
          const s = d.isToday ? todayS : (byDate.get(key) ?? 0);
          return { key, label: d.label.slice(0, 1), value: s, highlight: d.isToday, title: `${d.label}: ${formatDuration(s) ?? "0m"}` };
        })}
      />
    </div>
  );
}

/* --- Listening streak ---------------------------------------------------- */

function ListeningStreak({ size }: WidgetProps) {
  const { state } = useAbs();
  const stats = useListeningStats(31);
  const data = stats.data?.configured ? stats.data : null;
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d.seconds]));
  const week = calendarWeek();
  const weekSeconds = week.map((d) => byDate.get(localDate(d.date)) ?? 0);

  // Consecutive days with any listening, ending today — or yesterday, so an
  // unstarted morning doesn't break a streak that is still alive.
  const daysDesc = [...(data?.days ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const [i, d] of daysDesc.entries()) {
    if (d.seconds > 0) streak++;
    else if (i === 0 && d.date === localDate()) continue;
    else break;
  }

  const month = localDate().slice(0, 7);
  const monthS = (data?.days ?? []).filter((d) => d.date.startsWith(month)).reduce((a, d) => a + d.seconds, 0);
  const year = localDate().slice(0, 4);
  const finished = (data?.finished ?? []).filter((b) => b.finished_at.startsWith(year));
  const streakState = state === "ready" && stats.isPending ? "loading" : state === "ready" && stats.isError ? "error" : state;

  return (
    <WidgetCard
      title="Listening streak"
      area="listening"
      state={streakState}
      problem={PROBLEM}
      setup={SETUP}
      empty={
        data && weekSeconds.every((s) => s === 0)
          ? { title: "No listening this week", text: "Bars fill in after your first session." }
          : null
      }
      aside={streak > 0 ? `${streak}-day streak` : null}
    >
      <MiniBars
        bars={week.map((d, i) => ({
          key: localDate(d.date),
          label: d.label,
          value: weekSeconds[i],
          highlight: d.isToday,
          caption: `${Math.round(weekSeconds[i] / 60)}m`,
          title: `${d.label}: ${formatDuration(weekSeconds[i]) ?? "0m"}`,
        }))}
      />
      {size === "L" ? (
        <div className="flex items-end justify-between gap-6 border-t border-divider pt-3.5">
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className="flex items-baseline gap-2">
              <span className={R.m}>{finished.length}</span>
              <span className="text-[13px] text-fg-muted">
                {finished.length === 1 ? "book" : "books"} finished this year
              </span>
            </p>
            <ul className="flex gap-1.5 overflow-hidden">
              {finished.slice(0, 7).map((b) => (
                <li key={b.item_id} title={b.title}>
                  <CoverArt src={b.cover_url} alt={b.title} size={44} fallbackIcon={LISTENING_ICON} />
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0 text-right">
            <p className={R.m}>{formatDuration(monthS) ?? "0m"}</p>
            <p className="mt-1 text-[13px] text-fg-muted">this month</p>
          </div>
        </div>
      ) : null}
    </WidgetCard>
  );
}

/* --- In progress & Finished (Area-only) ---------------------------------- */

/** Every other book on the go, most recently played first. */
function InProgress({ size }: WidgetProps) {
  const { state, data } = useAbs();
  const books = (data?.in_progress ?? []).filter((b) => b.item_id !== data?.current?.item_id);
  const shown = size === "M" ? books.slice(0, 2) : books;

  return (
    <WidgetCard
      title="Also in progress"
      area="listening"
      state={state}
      problem={PROBLEM}
      setup={SETUP}
      empty={books.length ? null : { title: "Just the one book", text: "Anything else you start in Audiobookshelf lists here." }}
      aside={`${books.length} ${books.length === 1 ? "book" : "books"}`}
    >
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain">
        {shown.map((b) => {
          const ago = timeAgo(b.last_listened_at);
          return (
            <li key={b.item_id} className="flex min-w-0 items-center gap-3">
              <CoverArt src={b.cover_url} alt="" size={44} fallbackIcon={LISTENING_ICON} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[13px] font-medium">{b.title}</span>
                <ProgressBar value={b.progress} height={4} label={`${b.title} ${formatProgress(b.progress)} finished`} />
                <span className={cn(R.t, "truncate text-fg-muted")}>
                  {[left(b), ago && `last ${ago}`].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

/** Books finished, newest first, as far back as Audiobookshelf remembers. */
function Finished({ size }: WidgetProps) {
  const { state } = useAbs();
  const stats = useListeningStats(31);
  const books = stats.data?.configured ? stats.data.finished : [];
  const shown = size === "M" ? books.slice(0, 2) : books;
  const finishedState = state === "ready" && stats.isPending ? "loading" : state === "ready" && stats.isError ? "error" : state;

  return (
    <WidgetCard
      title="Finished"
      area="listening"
      state={finishedState}
      problem={PROBLEM}
      setup={SETUP}
      empty={books.length ? null : { title: "Nothing finished yet", text: "Books you finish in Audiobookshelf list here." }}
      aside={`${books.length} ${books.length === 1 ? "book" : "books"}`}
    >
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain">
        {shown.map((b) => (
          <li key={b.item_id} className="flex min-w-0 items-center gap-3">
            <CoverArt src={b.cover_url} alt="" size={44} fallbackIcon={LISTENING_ICON} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{b.title}</span>
              <span className="block truncate text-[12px] text-fg-muted">{b.author}</span>
            </span>
            <span className={cn(R.t, "shrink-0 text-fg-muted")}>
              {new Date(b.finished_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

export const LISTENING_WIDGETS: WidgetDef[] = [
  { id: "audiobookshelf.now_listening", title: "Now listening", area: "listening", sizes: ["S", "M", "L"], placement: "anywhere", render: NowListening },
  { id: "audiobookshelf.streak", title: "Listening streak", area: "listening", sizes: ["M", "L"], placement: "anywhere", render: ListeningStreak },
  { id: "audiobookshelf.in_progress", title: "Also in progress", area: "listening", sizes: ["M", "L"], placement: "area", render: InProgress },
  { id: "audiobookshelf.finished", title: "Finished", area: "listening", sizes: ["M", "L"], placement: "area", render: Finished },
];
