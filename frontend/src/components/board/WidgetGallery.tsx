/* The Widget gallery: the sheet "+" opens in Edit mode, listing every Widget
   that can be placed on this Board, grouped by Area, each with a live
   preview at the Size you pick. The seed of the marketplace catalog.

   A preview is the real Widget on real data, laid out at the tile's true
   size on this device and scaled down to fit the sheet, so what you see is
   exactly what lands on the Board. */

import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const groups: { key: string; label: string; accent?: string; defs: WidgetDef[] }[] = [];
  for (const area of enabledAreas()) {
    const own = defs.filter((d) => d.area === area.key);
    if (own.length) groups.push({ key: area.key, label: area.label, accent: area.accent, defs: own });
  }

  return (
    <Sheet eyebrow={`Add to ${boardTitle(board)}`} title="Widget gallery" onClose={onClose} className="max-w-[880px]">
        <div className="flex flex-col gap-8 overflow-y-auto px-4 py-5 lap:px-6">
          {groups.map((g) => (
            <section key={g.key} data-accent={g.accent} className="flex flex-col gap-3">
              <h3 className="label-caps flex items-center gap-2 text-fg-muted">
                <span aria-hidden className="size-1.5 bg-accent" />
                {g.label}
              </h3>
              <ul className="flex flex-col gap-4">
                {g.defs.map((def) => (
                  <Entry key={def.id} def={def} placed={placed.has(def.id)} onAdd={onAdd} />
                ))}
              </ul>
            </section>
          ))}
        </div>
    </Sheet>
  );
}

function Entry({ def, placed, onAdd }: { def: WidgetDef; placed: boolean; onAdd: (tile: TileSpec) => void }) {
  const [size, setSize] = useState<Size>(def.sizes[def.sizes.length - 1]);
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

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
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
