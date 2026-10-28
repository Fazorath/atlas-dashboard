/* A Board (ADR 0002): a screen whose content is an arrangeable grid of
   Widgets.

   The grid is 4 columns from 900px and 2 below; tiles are S 1×1, M 2×1,
   L 2×2 and XL 4×2 (2×4 on a phone), auto-packed densely so a gap left by a
   Widget that steps aside fills from below. The cell maths lives in
   index.css (`.board-grid`), against the Board's own width.

   Edit mode, iOS-style: long-press a Widget or tap Edit → Widgets wiggle,
   each with a (–) remove badge, a Size switcher (only its supported Sizes)
   and earlier/later buttons for the keyboard; drag to reorder; "+" opens the
   Widget gallery; Done saves. Outside Edit mode a tap opens the Widget's
   Area, which the Widget's own Card already does. */

import { ChevronLeft, ChevronRight, Minus, Pencil, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { WidgetGallery } from "@/components/board/WidgetGallery";
import { useBoardLayout, useResetBoard, useSaveBoard } from "@/lib/boards";
import { cn } from "@/lib/utils";
import { enabledModules } from "@/lib/config";
import { catchUpBoard, defaultBoard, resolveLayout, WIDGET_BY_ID } from "@/widgets/registry";
import type { BoardKey, Size, TileSpec, WidgetDef } from "@/widgets/types";

export const SPAN: Record<Size, string> = {
  S: "col-span-1 row-span-1",
  M: "col-span-2 row-span-1",
  L: "col-span-2 row-span-2",
  XL: "col-span-2 row-span-4 lap:col-span-4 lap:row-span-2",
};

const LONG_PRESS_MS = 500;
/** On touch a drag needs a short still hold first, so a swipe still scrolls. */
const TOUCH_HOLD_MS = 180;

const same = (a: TileSpec[], b: TileSpec[]) =>
  a.length === b.length && a.every((t, i) => t.widget === b[i].widget && t.size === b[i].size);

export function Board({
  board,
  leading,
  trailing,
  notice,
}: {
  board: BoardKey;
  /** Left of the toolbar: a Problem chip, a heading. */
  leading?: ReactNode;
  /** Right of the toolbar, after the Edit controls: the avatar on a phone. */
  trailing?: ReactNode;
  /** Between the toolbar and the grid: a status line the screen owns. */
  notice?: ReactNode;
}) {
  const saved = useBoardLayout(board);
  const save = useSaveBoard(board);
  const reset = useResetBoard(board);

  // Non-null exactly while in Edit mode.
  const [draft, setDraft] = useState<TileSpec[] | null>(null);
  const [gallery, setGallery] = useState(false);
  const editing = draft !== null;
  // The saved layout, with Widgets of Modules enabled since it was saved
  // appended once. Written back below, so it happens only once.
  const caught = useMemo(
    () => catchUpBoard(board, saved.data?.layout, saved.data?.seen_modules),
    [board, saved.data?.layout, saved.data?.seen_modules],
  );
  const base = caught.layout;
  const layout = draft ?? resolveLayout(board, base);

  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (!caught.changed || !caught.layout || editing) return;
    const stamp = JSON.stringify(caught.seen);
    if (attempted.current === stamp) return; // a failed save isn't retried in a loop
    attempted.current = stamp;
    save.mutate({ layout: caught.layout, seen: caught.seen });
  });

  const enter = useCallback(() => {
    setDraft((d) => d ?? resolveLayout(board, base));
  }, [board, base]);

  const done = () => {
    if (!draft) return;
    const current = resolveLayout(board, base);
    // Matching the default is stored as "never saved", so the default can
    // improve later without a stale copy pinning this Board to the old one.
    if (same(draft, defaultBoard(board))) {
      if (saved.data?.layout != null) reset.mutate();
    } else if (!same(draft, current)) {
      save.mutate({ layout: draft, seen: enabledModules() });
    }
    setDraft(null);
    setGallery(false);
  };

  // Escape leaves Edit mode the way Done does, once the gallery is closed.
  useEffect(() => {
    if (!editing || gallery) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const move = (from: number, to: number) =>
    setDraft((d) => {
      if (!d || to < 0 || to >= d.length || from === to) return d;
      const next = [...d];
      const [tile] = next.splice(from, 1);
      next.splice(to, 0, tile);
      return next;
    });

  const drag = useDrag({ onMove: (id, overId) => {
    setDraft((d) => {
      if (!d) return d;
      const from = d.findIndex((t) => t.widget === id);
      const to = d.findIndex((t) => t.widget === overId);
      if (from < 0 || to < 0) return d;
      const next = [...d];
      const [tile] = next.splice(from, 1);
      next.splice(to, 0, tile);
      return next;
    });
  }, layout });

  const pending = saved.isPending;

  return (
    <div className="flex flex-col gap-3 lap:gap-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">{leading}</div>
        <div className="flex shrink-0 items-center gap-2">
          {save.isError && !editing ? (
            <span role="status" className="text-[12px] text-due">
              Couldn&rsquo;t save the layout
            </span>
          ) : null}
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(defaultBoard(board))}>
                Reset
              </Button>
              <Button variant="neutral" onClick={() => setGallery(true)} aria-haspopup="dialog">
                <Plus aria-hidden strokeWidth={2.4} className="size-4" />
                Add
              </Button>
              <Button variant="solid" onClick={done}>
                Done
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={enter} disabled={pending} aria-label="Edit this board">
              <Pencil aria-hidden strokeWidth={2.2} className="size-4" />
              <span className="hidden min-[420px]:inline">Edit</span>
            </Button>
          )}
          {trailing}
        </div>
      </div>

      {notice}

      {editing ? (
        <p className="sr-only" role="status">
          Editing. Drag a widget to move it, or use its earlier and later buttons. Press Done to save.
        </p>
      ) : null}

      <div className="board">
        <ul ref={drag.gridRef} className="board-grid relative" aria-label="Widgets">
          {pending
            ? defaultBoard(board).map((t) => (
                <li key={t.widget} aria-hidden className={cn(SPAN[t.size], "rounded-card border border-border-subtle bg-surface lap:rounded-card-lg")} />
              ))
            : layout.map((tile, index) => {
                const def = WIDGET_BY_ID.get(tile.widget);
                if (!def) return null;
                return (
                  <Tile
                    key={tile.widget}
                    tile={tile}
                    def={def}
                    board={board}
                    index={index}
                    count={layout.length}
                    editing={editing}
                    dragging={drag.dragging === tile.widget}
                    onLongPress={enter}
                    onDragStart={drag.start}
                    onRemove={() => setDraft((d) => d?.filter((t) => t.widget !== tile.widget) ?? d)}
                    onResize={(size) =>
                      setDraft((d) => d?.map((t) => (t.widget === tile.widget ? { ...t, size } : t)) ?? d)
                    }
                    onMove={(delta) => move(index, index + delta)}
                  />
                );
              })}
        </ul>
        {!pending && layout.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border-subtle p-6">
            <p className="text-[15px] font-medium">This board is empty.</p>
            <Button variant="neutral" onClick={() => { enter(); setGallery(true); }}>
              <Plus aria-hidden strokeWidth={2.4} className="size-4" />
              Add a widget
            </Button>
          </div>
        ) : null}
      </div>

      {gallery && draft ? (
        <WidgetGallery
          board={board}
          placed={new Set(draft.map((t) => t.widget))}
          onAdd={(tile) => {
            setDraft((d) => (d ? [...d, tile] : d));
            setGallery(false);
          }}
          onClose={() => setGallery(false)}
        />
      ) : null}
    </div>
  );
}

/* --- One tile ------------------------------------------------------------ */

function Tile({
  tile,
  def,
  board,
  index,
  count,
  editing,
  dragging,
  onLongPress,
  onDragStart,
  onRemove,
  onResize,
  onMove,
}: {
  tile: TileSpec;
  def: WidgetDef;
  board: BoardKey;
  index: number;
  count: number;
  editing: boolean;
  dragging: boolean;
  onLongPress: () => void;
  onDragStart: (e: ReactPointerEvent<HTMLElement>, id: string) => void;
  onRemove: () => void;
  onResize: (size: Size) => void;
  onMove: (delta: number) => void;
}) {
  // A tile's Widget never changes under it (the key is the Widget id), so
  // this hook is called on every render or on none.
  const absent = def.useAbsent?.(board) ?? false;
  const press = useLongPress(onLongPress, !editing);
  const Widget = def.render;

  if (absent && !editing) return null;

  return (
    <li
      data-tile={tile.widget}
      {...press.handlers}
      className={cn(
        SPAN[tile.size],
        "relative min-w-0 [-webkit-touch-callout:none]",
        editing && !dragging && (index % 2 ? "wiggle wiggle-b" : "wiggle"),
        dragging && "z-20",
      )}
    >
      <div inert={editing} className={cn("h-full", editing && "select-none", absent && "opacity-40")}>
        <Widget size={tile.size} />
      </div>

      {editing ? (
        <div
          onPointerDown={(e) => onDragStart(e, tile.widget)}
          className={cn(
            "absolute inset-0 cursor-grab touch-pan-y rounded-card ring-1 ring-border-subtle lap:rounded-card-lg",
            dragging && "cursor-grabbing shadow-[0_18px_48px_rgba(0,0,0,0.6)] ring-accent",
          )}
        >
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${def.title}`}
            className="absolute -top-4 -left-4 z-10 grid size-11 place-items-center"
          >
            <span className="grid size-[26px] place-items-center rounded-full border border-border-subtle bg-surface-2 text-fg">
              <Minus aria-hidden strokeWidth={3} className="size-3.5" />
            </span>
          </button>

          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <MoveButton label={`Move ${def.title} earlier`} disabled={index === 0} onClick={() => onMove(-1)}>
              <ChevronLeft aria-hidden strokeWidth={2.4} className="size-4" />
            </MoveButton>
            <MoveButton label={`Move ${def.title} later`} disabled={index === count - 1} onClick={() => onMove(1)}>
              <ChevronRight aria-hidden strokeWidth={2.4} className="size-4" />
            </MoveButton>
          </div>

          {absent ? (
            <p className="absolute top-1/2 left-1/2 max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-center text-[12px] text-fg-muted">
              Hidden here until there&rsquo;s something to show
            </p>
          ) : null}

          {def.sizes.length > 1 ? (
            <div
              role="radiogroup"
              aria-label={`${def.title} size`}
              className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-pill border border-border-subtle bg-surface-2 p-0.5"
            >
              {def.sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={size === tile.size}
                  aria-label={`Size ${size}`}
                  onClick={() => onResize(size)}
                  className={cn(
                    "tnum grid h-8 min-w-9 place-items-center rounded-pill px-2 text-[12px] transition-colors",
                    size === tile.size ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full border border-border-subtle bg-surface-2 text-fg-muted hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* --- Gestures ------------------------------------------------------------ */

/** Hold a tile to enter Edit mode. The tap that ends the hold is swallowed so
 *  it doesn't also open the Area. */
function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return {
    handlers: enabled
      ? {
          onPointerDown: (e: ReactPointerEvent) => {
            if (e.button !== 0) return;
            fired.current = false;
            origin.current = { x: e.clientX, y: e.clientY };
            timer.current = window.setTimeout(() => {
              fired.current = true;
              navigator.vibrate?.(10);
              onLongPress();
            }, LONG_PRESS_MS);
          },
          onPointerMove: (e: ReactPointerEvent) => {
            const o = origin.current;
            if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 8) cancel();
          },
          onPointerUp: cancel,
          onPointerCancel: cancel,
          onPointerLeave: cancel,
          onClickCapture: (e: React.MouseEvent) => {
            if (fired.current) {
              e.preventDefault();
              e.stopPropagation();
              fired.current = false;
            }
          },
          onContextMenu: (e: React.MouseEvent) => {
            if (fired.current || timer.current) e.preventDefault();
          },
        }
      : {},
  };
}

interface DragState {
  id: string;
  el: HTMLElement;
  pointerType: string;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  active: boolean;
  over: string | null;
  timer: number | null;
}

/** Drag-to-reorder for the tiles in Edit mode. The dragged tile follows the
    pointer; whichever tile is under the pointer gives up its place. Mouse
    drags start after a few pixels; touch drags after a short still hold, so a
    swipe across the Board still scrolls the page.

    The window listeners are built once, over refs, so the exact functions
    added are the ones removed. */
function useDrag({ onMove, layout }: { onMove: (id: string, overId: string) => void; layout: TileSpec[] }) {
  const gridRef = useRef<HTMLUListElement>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [dragging, setDragging] = useState<string | null>(null);

  const [ctl] = useState(() => {
    let s: DragState | null = null;

    // Follow the pointer from wherever the tile now sits in the grid. Also
    // run after every reorder, since the tile's home cell moved under it.
    const place = () => {
      const grid = gridRef.current;
      if (!s?.active || !grid) return;
      const box = grid.getBoundingClientRect();
      const dx = s.x - s.grabX - (box.left + s.el.offsetLeft);
      const dy = s.y - s.grabY - (box.top + s.el.offsetTop);
      s.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
    };

    const activate = () => {
      if (!s) return;
      s.active = true;
      s.el.style.pointerEvents = "none";
      navigator.vibrate?.(10);
      setDragging(s.id);
      place();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (s?.active) e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!s) return;
      s.x = e.clientX;
      s.y = e.clientY;
      if (!s.active) {
        const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
        if (s.pointerType === "mouse") {
          if (moved > 4) activate();
        } else if (moved > 8) {
          stop(); // a scroll, not a drag
        }
        return;
      }
      place();
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        ?.closest<HTMLElement>("[data-tile]")?.dataset.tile;
      // Swap once per tile entered, so two tiles of different sizes can't
      // trade places back and forth under a still pointer.
      if (over && over !== s.id && over !== s.over) onMoveRef.current(s.id, over);
      s.over = over ?? null;
    };

    const stop = () => {
      if (!s) return;
      if (s.timer) window.clearTimeout(s.timer);
      s.el.style.transform = "";
      s.el.style.pointerEvents = "";
      s = null;
      setDragging(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("touchmove", onTouchMove);
    };

    const start = (e: ReactPointerEvent<HTMLElement>, id: string) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      const el = e.currentTarget.closest<HTMLElement>("[data-tile]");
      if (!el) return;
      stop();
      const rect = el.getBoundingClientRect();
      s = {
        id,
        el,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        x: e.clientX,
        y: e.clientY,
        active: false,
        over: null,
        timer: e.pointerType === "mouse" ? null : window.setTimeout(activate, TOUCH_HOLD_MS),
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
    };

    return { start, stop, place };
  });

  useLayoutEffect(ctl.place, [layout, ctl]);
  useEffect(() => ctl.stop, [ctl]);

  return { gridRef, dragging, start: ctl.start };
}

