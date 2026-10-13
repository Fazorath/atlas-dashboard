/* Every Widget Atlas offers, and what each Board starts with.

   The catalog order here is the Widget gallery's order and an Area Board's
   default order. A saved Board is checked against this list on every read,
   so a Widget that is removed, or a Size it stops supporting, can never
   break a Board: the tile is dropped or moved to the nearest Size it has. */

import { AREAS, type AreaKey } from "@/lib/sections";
import { HABITS_WIDGETS } from "@/widgets/habits";
import { HEALTH_WIDGETS } from "@/widgets/health";
import { LISTENING_WIDGETS } from "@/widgets/listening";
import { MONEY_WIDGETS } from "@/widgets/money";
import { SCHOOL_WIDGETS } from "@/widgets/school";
import { SIZES, type BoardKey, type Size, type TileSpec, type WidgetDef } from "@/widgets/types";
import { WEATHER_WIDGETS } from "@/widgets/weather";
import { WORK_WIDGETS } from "@/widgets/work";

export const WIDGETS: WidgetDef[] = [
  ...HEALTH_WIDGETS,
  ...MONEY_WIDGETS,
  ...SCHOOL_WIDGETS,
  ...HABITS_WIDGETS,
  ...WEATHER_WIDGETS,
  ...LISTENING_WIDGETS,
  ...WORK_WIDGETS,
];

export const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

/** Today takes any Widget not kept to its Area; an Area's Board takes only
 *  its own. */
export function allowedOn(board: BoardKey, def: WidgetDef): boolean {
  if (board === "today") return def.placement === "anywhere";
  return def.area === board;
}

export function widgetsFor(board: BoardKey): WidgetDef[] {
  return WIDGETS.filter((w) => allowedOn(board, w));
}

const TODAY: TileSpec[] = [
  { widget: "work.shift", size: "M" },
  { widget: "open_meteo.now", size: "S" },
  { widget: "securo.balance", size: "S" },
  { widget: "canvas.next_class", size: "M" },
  { widget: "google_health.sleep_week", size: "L" },
  { widget: "canvas.due_soon", size: "L" },
  { widget: "audiobookshelf.now_listening", size: "M" },
  { widget: "habits.today", size: "M" },
];

/** A fresh account's arrangement. Today's is the agreed default; an Area's is
 *  all of its Widgets at their largest Size, in catalog order. */
export function defaultBoard(board: BoardKey): TileSpec[] {
  if (board === "today") return TODAY;
  return widgetsFor(board as AreaKey).map((w) => ({ widget: w.id, size: w.sizes[w.sizes.length - 1] }));
}

/** The supported Size closest to the one asked for, rounding up on a tie. */
export function nearestSize(def: WidgetDef, size: Size): Size {
  if (def.sizes.includes(size)) return size;
  const want = SIZES.indexOf(size);
  return [...def.sizes].sort(
    (a, b) => Math.abs(SIZES.indexOf(a) - want) - Math.abs(SIZES.indexOf(b) - want) || SIZES.indexOf(b) - SIZES.indexOf(a),
  )[0];
}

/** What a saved layout means today: unknown, disallowed and repeated Widgets
 *  dropped, Sizes snapped to supported ones. Null (never saved) is the
 *  default arrangement. */
export function resolveLayout(board: BoardKey, saved: TileSpec[] | null | undefined): TileSpec[] {
  if (!saved) return defaultBoard(board);
  const seen = new Set<string>();
  return saved.flatMap((tile) => {
    const def = WIDGET_BY_ID.get(tile.widget);
    if (!def || !allowedOn(board, def) || seen.has(def.id)) return [];
    seen.add(def.id);
    return [{ widget: def.id, size: nearestSize(def, tile.size) }];
  });
}

export function boardTitle(board: BoardKey): string {
  return board === "today" ? "Today" : AREAS[board].label;
}
