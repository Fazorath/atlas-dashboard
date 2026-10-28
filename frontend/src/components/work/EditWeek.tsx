/* Edit week: the sheet behind the Work header's button, and where a "not
   entered" tap lands. The "Timeline" look — each day is a chip you tap on or
   off, its shift drawn as a block on one shared day ruler, and two time
   inputs to set it — so a week typed in from a schedule reads back at a glance.

   Saving sends the whole week: a day left off is a day off, and the week
   counts as entered from then on. Clear week makes it "not entered" again.

   "Read from photo" sends a Schedule photo off to be read in the background
   (ADR 0006); you can close the sheet. When a Draft week exists for the week
   shown, the form opens on it instead of the saved week, with any day that
   couldn't be read left off and marked — Save makes it the week, Discard
   drops it. */

import { useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { workPhotoEnabled } from "@/lib/config";
import { draftToOffer } from "@/lib/draft-offer";
import { bannerDraft, copied, fromDraft, SAVED, saveDraftId, type RowSource } from "@/lib/row-source";
import { cn } from "@/lib/utils";
import {
  addDays,
  draftFor,
  hoursLabel,
  toMinutes,
  useClearWeek,
  useDiscardRead,
  usePhotoReads,
  useReadPhoto,
  useSaveWeek,
  useWeek,
  weekDays,
  weekdayShort,
  weekQuery,
  weekRange,
  type PhotoRead,
  type Week,
} from "@/lib/work";

interface Row {
  date: string;
  on: boolean;
  start: string;
  end: string;
  /** From a Draft week: what was on the paper for a day that couldn't be read. */
  unread?: string;
}

const DEFAULT = { start: "09:00", end: "17:00" };

function rowsFrom(start: string, week: Week | undefined, shiftDays = 0): Row[] {
  const byDate = new Map((week?.shifts ?? []).map((s) => [addDays(s.date, shiftDays), s]));
  return weekDays(start).map((date) => {
    const s = byDate.get(date);
    return s ? { date, on: true, start: s.start, end: s.end } : { date, on: false, ...DEFAULT };
  });
}

function rowsFromDraft(draft: PhotoRead): Row[] {
  return (draft.days ?? []).map((d) =>
    d.start && d.end
      ? { date: d.date, on: true, start: d.start, end: d.end }
      : { date: d.date, on: false, ...DEFAULT, ...(d.off ? {} : { unread: d.raw }) },
  );
}

const valid = (r: Row) => !r.on || toMinutes(r.end) > toMinutes(r.start);
const minutesOf = (r: Row) => (r.on && valid(r) ? toMinutes(r.end) - toMinutes(r.start) : 0);

const timeInput =
  "tnum h-9 w-[118px] rounded-row bg-surface-2 px-2 text-[13px] text-fg outline-none [color-scheme:dark] " +
  "focus-visible:ring-2 focus-visible:ring-accent";

export function EditWeek({ initialWeek, onClose }: { initialWeek: string; onClose: () => void }) {
  const [start, setStart] = useState(initialWeek);
  const week = useWeek(start);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const client = useQueryClient();
  const save = useSaveWeek();
  const clear = useClearWeek();
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const photoOn = workPhotoEnabled();
  const reads = usePhotoReads();
  const readPhoto = useReadPhoto();
  const discard = useDiscardRead();
  // Where the rows came from; the banner and Save's draft id follow it.
  const [source, setSource] = useState<RowSource>(SAVED);
  const banner = bannerDraft(source);
  const basedOn = saveDraftId(source);
  // A Draft week the user waved off; not offered again.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reading = reads.data?.some((r) => r.status === "reading") ?? false;
  const lastFailed = reads.data?.find((r) => r.status === "failed");

  // Fill the form once per week shown, so a background refetch never wipes
  // what you've typed. A Draft week for it wins over the saved week.
  useEffect(() => {
    if (!week.data || loadedFor === start || (photoOn && reads.isPending)) return;
    const draft = draftFor(reads.data, start);
    setRows(draft ? rowsFromDraft(draft) : rowsFrom(start, week.data));
    setSource(draft ? fromDraft(draft) : SAVED);
    setDismissed(null);
    discard.reset();
    setLoadedFor(start);
    setCopyNote(null);
  }, [week.data, start, loadedFor, photoOn, reads.isPending, reads.data]);

  const pickPhoto = (file: File | undefined) => {
    if (file) readPhoto.mutate({ file, week: start });
    if (fileInput.current) fileInput.current.value = "";
  };

  // Waits for the server: on failure the Draft week stays loaded and we say so.
  const discardDraft = () => {
    if (!banner || !week.data) return;
    const saved = week.data;
    discard.mutate(banner.id, {
      onSuccess: () => {
        setDismissed(banner.id);
        setRows(rowsFrom(start, saved));
        setSource(SAVED);
      },
    });
  };

  // A Draft week that finished after the form loaded: offered, never loaded
  // over what's typed.
  const offer = rows && loadedFor === start ? draftToOffer(reads.data, start, basedOn, dismissed) : undefined;

  const loadOffer = () => {
    if (!offer) return;
    setRows(rowsFromDraft(offer));
    setSource(fromDraft(offer));
    discard.reset();
    setCopyNote(null);
  };

  const step = (n: number) => {
    setRows(null);
    setStart(addDays(start, n * 7));
  };

  const copyLast = async () => {
    const prev = await client.fetchQuery(weekQuery(addDays(start, -7)));
    if (!prev.entered) {
      setCopyNote(`${weekRange(prev.week_start)} wasn't entered either.`);
      return;
    }
    setRows(rowsFrom(start, prev, 7));
    setSource(copied(source, offer?.id ?? null));
    discard.reset();
    setCopyNote(`Copied from ${weekRange(prev.week_start)} — fix what changed.`);
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, unread: undefined, ...patch } : r)));

  const toggle = (i: number) => {
    if (!rows) return;
    const r = rows[i];
    if (r.on) return update(i, { on: false });
    // A day switched on borrows the nearest shift above it: most weeks repeat.
    const prior = [...rows.slice(0, i)].reverse().find((x) => x.on && valid(x));
    update(i, { on: true, start: prior?.start ?? r.start, end: prior?.end ?? r.end });
  };

  const bad = rows?.filter((r) => !valid(r)) ?? [];
  const total = rows?.reduce((sum, r) => sum + minutesOf(r), 0) ?? 0;
  const count = rows?.filter((r) => r.on).length ?? 0;

  // One ruler for the whole week, 6a–10p unless a shift runs outside it.
  const on = rows?.filter((r) => r.on && valid(r)) ?? [];
  const lo = Math.min(6 * 60, ...on.map((r) => Math.floor(toMinutes(r.start) / 60) * 60));
  const hi = Math.max(22 * 60, ...on.map((r) => Math.ceil(toMinutes(r.end) / 60) * 60));
  const pct = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`;
  const ticks: number[] = [];
  for (let m = Math.ceil(lo / 240) * 240; m <= hi; m += 240) ticks.push(m);

  const submit = () => {
    if (!rows || bad.length) return;
    save.mutate(
      { start, draftId: basedOn, shifts: rows.filter((r) => r.on).map(({ date, start: s, end }) => ({ date, start: s, end })) },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet eyebrow="Work" title="Edit week" onClose={onClose} className="max-w-[600px]">
      <div data-accent="work" className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 lap:px-6 lap:py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="neutral" size="icon" className="size-9" onClick={() => step(-1)} aria-label="Previous week">
            <ChevronLeft aria-hidden strokeWidth={2.2} className="size-4" />
          </Button>
          <p className="min-w-[132px] text-center text-[16px] font-semibold" aria-live="polite">
            Week of {weekRange(start)}
          </p>
          <Button variant="neutral" size="icon" className="size-9" onClick={() => step(1)} aria-label="Next week">
            <ChevronRight aria-hidden strokeWidth={2.2} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className="ml-auto h-9 rounded-row border border-border-subtle px-3 text-[13px] font-medium text-fg"
            onClick={copyLast}
            disabled={!rows}
          >
            <Copy aria-hidden strokeWidth={2.2} className="size-3.5" />
            Copy last week
          </Button>
        </div>
        {copyNote ? <p className="-mt-1 text-[13px] text-fg-muted">{copyNote}</p> : null}

        {photoOn ? (
          <div className="-mt-1 flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
            <Button
              variant="ghost"
              className="h-9 rounded-row border border-border-subtle px-3 text-[13px] font-medium text-fg"
              onClick={() => fileInput.current?.click()}
              disabled={reading || readPhoto.isPending}
            >
              <Camera aria-hidden strokeWidth={2.2} className="size-3.5" />
              Read from photo
            </Button>
            <p className="min-w-0 flex-1 text-[13px] text-fg-muted" role="status">
              {readPhoto.isPending
                ? "Sending…"
                : reading
                  ? "Reading your photo — you can close this; the Work screen says when it's ready."
                  : lastFailed
                    ? `The last photo couldn't be read — ${lastFailed.error || "no reason was given."}`
                    : null}
            </p>
          </div>
        ) : null}

        {offer ? (
          <div className="flex items-center gap-2 rounded-row bg-accent-tint px-3 py-2 text-[13px]" role="status">
            <Camera aria-hidden strokeWidth={2.2} className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">Your schedule was read &mdash; load it?</span>
            <Button variant="ghost" className="h-8 px-2 text-[13px] font-medium" onClick={loadOffer}>
              Load it
            </Button>
            <Button
              variant="ghost"
              className="h-8 px-2 text-[13px] font-medium"
              onClick={() => setDismissed(offer.id)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        {banner ? (
          <div className="flex items-center gap-2 rounded-row bg-accent-tint px-3 py-2 text-[13px]" role="status">
            <Camera aria-hidden strokeWidth={2.2} className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              Filled in from your schedule photo — check it, then Save.
              {banner.week_guessed ? (
                <span className="font-semibold">
                  {" "}
                  Its dates couldn&rsquo;t be read, so it&rsquo;s filed under the week you had open. If
                  that&rsquo;s the wrong week, Discard — Save replaces this week&rsquo;s shifts.
                </span>
              ) : null}
              {rows?.some((r) => r.unread !== undefined) ? " Marked days couldn't be read." : ""}
            </span>
            <Button variant="ghost" className="h-8 px-2 text-[13px] font-medium" onClick={discardDraft} disabled={discard.isPending}>
              Discard
            </Button>
          </div>
        ) : null}

        {discard.isError ? (
          <p className="-mt-2 text-[13px] text-due" role="alert">
            Couldn&rsquo;t discard it — {discard.error.message}
          </p>
        ) : null}

        {week.isError ? (
          <p className="text-[13px] text-fg-muted">Couldn&rsquo;t reach the work API.</p>
        ) : !rows ? (
          <div aria-label="Loading" className="h-[322px]" />
        ) : (
          <div className="flex flex-col gap-1.5">
            <div aria-hidden className="grid grid-cols-[44px_minmax(0,1fr)_248px] gap-2.5 max-[479px]:hidden">
              <span />
              <div className="tnum relative h-3 text-[10px] text-fg-dim">
                {ticks.map((m, i) => (
                  <span
                    key={m}
                    className={cn("absolute", i > 0 && "-translate-x-1/2", i === ticks.length - 1 && m === hi && "-translate-x-full")}
                    style={{ left: pct(m) }}
                  >
                    {fmtHour(m)}
                  </span>
                ))}
              </div>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.date}
                className="grid min-h-11 grid-cols-[44px_minmax(0,1fr)_248px] items-center gap-2.5 max-[479px]:grid-cols-[44px_minmax(0,1fr)] max-[479px]:gap-y-1.5 max-[479px]:py-1"
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={r.on}
                  aria-label={`${weekdayShort(r.date)}: ${r.on ? "working — tap for a day off" : "off — tap to add a shift"}`}
                  className={cn(
                    "pressable h-9 rounded-row text-[12px] font-semibold transition-colors",
                    r.on ? "bg-accent text-bg" : "bg-surface-2 text-fg-muted",
                  )}
                >
                  {weekdayShort(r.date)}
                </button>
                <div
                  aria-hidden
                  className="relative h-[22px] rounded-[3px] bg-surface max-[479px]:col-start-2 max-[479px]:row-start-2 max-[479px]:h-1.5"
                >
                  {r.on && valid(r) ? (
                    <span
                      className="absolute inset-y-0 rounded-[3px] bg-accent-track"
                      style={{ left: pct(toMinutes(r.start)), width: `calc(${pct(toMinutes(r.end))} - ${pct(toMinutes(r.start))})` }}
                    />
                  ) : null}
                </div>
                {r.on ? (
                  <div className="flex items-center gap-1.5 max-[479px]:col-start-2 max-[479px]:row-start-1">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => e.target.value && update(i, { start: e.target.value })}
                      aria-label={`${weekdayShort(r.date)} start`}
                      className={timeInput}
                    />
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => e.target.value && update(i, { end: e.target.value })}
                      aria-label={`${weekdayShort(r.date)} end`}
                      aria-invalid={!valid(r)}
                      className={cn(timeInput, !valid(r) && "ring-2 ring-due")}
                    />
                  </div>
                ) : r.unread !== undefined ? (
                  <span className="truncate text-[13px] text-due max-[479px]:col-start-2 max-[479px]:row-start-1">
                    couldn&rsquo;t read{r.unread ? ` “${r.unread}”` : ""} — tap the day to set it
                  </span>
                ) : (
                  <span className="text-[13px] text-fg-dim max-[479px]:col-start-2 max-[479px]:row-start-1">off — tap the day to add</span>
                )}
              </div>
            ))}
          </div>
        )}

        {bad.length ? (
          <p className="text-[13px] text-due" role="alert">
            {bad.map((r) => weekdayShort(r.date)).join(", ")} {bad.length === 1 ? "ends" : "end"} before{" "}
            {bad.length === 1 ? "it starts" : "they start"} — shifts can&rsquo;t run past midnight.
          </p>
        ) : null}
        {save.isError || clear.isError ? (
          <p className="text-[13px] text-due" role="alert">
            Couldn&rsquo;t save — {(save.error ?? clear.error)?.message}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center gap-3 border-t border-divider px-4 py-3 lap:px-6" data-accent="work">
        <span className="tnum text-[14px]">
          {hoursLabel(total)} <span className="text-fg-muted">· {count} {count === 1 ? "shift" : "shifts"}</span>
        </span>
        {week.data?.entered ? (
          <Button
            variant="ghost"
            className="ml-auto text-[13px] font-medium"
            disabled={clear.isPending}
            onClick={() => clear.mutate(start, { onSuccess: onClose })}
          >
            Clear week
          </Button>
        ) : null}
        <Button
          variant="solid"
          className={cn("rounded-row px-5", !week.data?.entered && "ml-auto")}
          disabled={!rows || bad.length > 0 || save.isPending}
          onClick={submit}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </footer>
    </Sheet>
  );
}

/** Ruler labels: "6a", "2p", "10p". */
function fmtHour(minutes: number): string {
  const h = Math.round(minutes / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}
