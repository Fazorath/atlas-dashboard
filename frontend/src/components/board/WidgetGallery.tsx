/* The Widget gallery: the sheet "+" opens in Edit mode, listing every Widget
   that can be placed on this Board, grouped by Area, each with a live
   preview at the Size you pick. Every entry starts at its smallest Size —
   opening on the largest made the gallery a wall of giant tiles — and the
   Widget lands at whatever Size is picked. The seed of the marketplace catalog.

   One tab per Area, as a single scrolling chip row (it overflows on a
   phone). Today opens on the first Area with something left to add; an
   Area Board only ever has its own tab.

   A preview is the real Widget on real data, laid out at the tile's true
   size on this device and scaled down to fit the sheet, so what you see is
   exactly what lands on the Board. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { enabledAreas } from "@/lib/sections";
import { cn } from "@/lib/utils";
import { boardTitle, widgetsFor } from "@/widgets/registry";
import type { BoardKey, Size, TileSpec, WidgetDef } from "@/widgets/types";

/* The grid's numbers, mirrored from `.board-grid` in index.css. */
const DESK = { cols: 4, gap: 20, rowRatio: 0.71 };
const PHONE = { cols: 2, gap: 12, rowRatio: 1 };
/** The Board's widest content box (1184 page minus 48px gutters). */
const DESK_WIDTH = 1088;

const SPANS: Record<Size, { desk: [number, number]; phone: [number, number] }> = {
  S: { desk: [1, 1], phone: [1, 1] },
  M: { desk: [2, 1], phone: [2, 1] },
  L: { desk: [2, 2], phone: [2, 2] },
  XL: { desk: [4, 2], phone: [2, 4] },
};

function useWide(): boolean {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function tileBox(size: Size, wide: boolean): { w: number; h: number } {
  const grid = wide ? DESK : PHONE;
  const width = wide ? DESK_WIDTH : Math.min(window.innerWidth, 899) - 36;
  const col = (width - (grid.cols - 1) * grid.gap) / grid.cols;
  const row = col * grid.rowRatio;
  const [c, r] = wide ? SPANS[size].desk : SPANS[size].phone;
  return { w: c * col + (c - 1) * grid.gap, h: r * row + (r - 1) * grid.gap };
}

export function WidgetGallery({
  board,
  placed,
  onAdd,
  onClose,
}: {
  board: BoardKey;
  placed: Set<string>;
  onAdd: (tile: TileSpec) => void;
  onClose: () => void;
}) {
  const defs = widgetsFor(board);

  // Group by Area in nav order.
  const groups: { key: string; label: string; accent?: string; defs: WidgetDef[]; addable: number }[] = [];
  for (const area of enabledAreas()) {
    const own = defs.filter((d) => d.area === area.key);
    if (own.length) {
      const addable = own.filter((d) => !placed.has(d.id)).length;
      groups.push({ key: area.key, label: area.label, accent: area.accent, defs: own, addable });
    }
  }

  const [tab, setTab] = useState(
    () => groups.find((g) => g.key === board)?.key ?? groups.find((g) => g.addable > 0)?.key ?? groups[0]?.key,
  );
  const current = groups.find((g) => g.key === tab) ?? groups[0];

  return (
    <Sheet eyebrow={`Add to ${boardTitle(board)}`} title="Widget gallery" onClose={onClose} className="max-w-[880px]">
        <AreaTabs groups={groups} tab={current?.key} onPick={setTab} />
        {current ? (
          <div
            key={current.key}
            role="tabpanel"
            id={`gallery-panel-${current.key}`}
            aria-labelledby={`gallery-tab-${current.key}`}
            data-accent={current.accent}
            className="overflow-y-auto px-4 py-5 lap:px-6"
          >
            <ul className="flex flex-col gap-4">
              {current.defs.map((def) => (
                <Entry key={def.id} def={def} placed={placed.has(def.id)} onAdd={onAdd} />
              ))}
            </ul>
          </div>
        ) : null}
    </Sheet>
  );
}

function AreaTabs({
  groups,
  tab,
  onPick,
}: {
  groups: { key: string; label: string; accent?: string }[];
  tab?: string;
  onPick: (key: string) => void;
}) {
  const row = useRef<HTMLDivElement>(null);

  // Keep the selected chip in view when the row overflows.
  useEffect(() => {
    row.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  return (
    <div
      ref={row}
      role="tablist"
      aria-label="Areas"
      className="flex shrink-0 gap-2 overflow-x-auto border-b border-border-subtle px-4 py-3 [scrollbar-width:none] lap:px-6"
    >
      {groups.map((g) => {
        const on = g.key === tab;
        return (
          <button
            key={g.key}
            type="button"
            role="tab"
            id={`gallery-tab-${g.key}`}
            aria-selected={on}
            aria-controls={`gallery-panel-${g.key}`}
            data-accent={g.accent}
            onClick={() => onPick(g.key)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-pill px-3.5 text-[13px] transition-colors",
              on ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            <span aria-hidden className="size-1.5 bg-accent" />
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

function Entry({ def, placed, onAdd }: { def: WidgetDef; placed: boolean; onAdd: (tile: TileSpec) => void }) {
  const [size, setSize] = useState<Size>(def.sizes[0]);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-3 lap:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-medium">{def.title}</p>
        <div className="flex items-center gap-2">
          {def.sizes.length > 1 ? (
            <div role="radiogroup" aria-label={`${def.title} size`} className="flex gap-0.5 rounded-pill bg-surface-2 p-0.5">
              {def.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={s === size}
                  onClick={() => setSize(s)}
                  className={cn(
                    "tnum grid h-9 min-w-10 place-items-center rounded-pill px-2 text-[12px] transition-colors",
                    s === size ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <span className="tnum rounded-pill bg-surface-2 px-3 py-2 text-[12px] text-fg-muted">{size} only</span>
          )}
          {placed ? (
            <span className="text-[13px] text-fg-muted">On this board</span>
          ) : (
            <Button variant="solid" onClick={() => onAdd({ widget: def.id, size })}>
              Add
            </Button>
          )}
        </div>
      </div>
      <Preview>
        {(wide) => {
          const box = tileBox(size, wide);
          const Widget = def.render;
          return { box, node: <Widget size={size} /> };
        }}
      </Preview>
    </li>
  );
}

/** Lays the Widget out at its true tile size and scales it to the sheet. */
function Preview({ children }: { children: (wide: boolean) => { box: { w: number; h: number }; node: ReactNode } }) {
  const wide = useWide();
  const outer = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);

  // Measure before the first paint: starting at 0 drew an empty frame on
  // every tab switch, which read as the whole gallery flashing.
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    setAvail(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setAvail(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { box, node } = children(wide);
  // Tall phone XL tiles are capped so one preview doesn't fill the sheet.
  const scale = avail ? Math.min(1, avail / box.w, 420 / box.h) : 0;

  return (
    <div ref={outer} className="w-full" style={{ height: box.h * scale }}>
      {scale > 0 ? (
        <div
          inert
          aria-hidden
          className="origin-top-left"
          style={{ width: box.w, height: box.h, transform: `scale(${scale})` }}
        >
          {node}
        </div>
      ) : null}
    </div>
  );
}
