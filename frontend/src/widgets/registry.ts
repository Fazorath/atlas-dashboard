/* Every Widget Atlas offers, and what each Board starts with.

   The catalog order here is the Widget gallery's order and an Area Board's
   default order. A saved Board is checked against this list on every read,
   so a Widget that is removed, or a Size it stops supporting, can never
   break a Board: the tile is dropped or moved to the nearest Size it has. */

import { catchUp } from "@/lib/board-modules";
import { areaEnabled, enabledModules } from "@/lib/config";
import { AREAS, type AreaKey } from "@/lib/sections";
import { customWidgetDefs, onCustomChange } from "@/widgets/custom";
import { HABITS_WIDGETS } from "@/widgets/habits";
import { HEALTH_WIDGETS } from "@/widgets/health";
import { LISTENING_WIDGETS } from "@/widgets/listening";
import { MONEY_WIDGETS } from "@/widgets/money";
import { SCHOOL_WIDGETS } from "@/widgets/school";
import { SIZES, type BoardKey, type Size, type TileSpec, type WidgetDef } from "@/widgets/types";
import { WEATHER_WIDGETS } from "@/widgets/weather";
import { WORK_WIDGETS } from "@/widgets/work";

const FIRST_PARTY: WidgetDef[] = [
  ...HEALTH_WIDGETS,
  ...MONEY_WIDGETS,
  ...SCHOOL_WIDGETS,
  ...HABITS_WIDGETS,
  ...WEATHER_WIDGETS,
  ...LISTENING_WIDGETS,
  ...WORK_WIDGETS,
];

/** The first-party Widgets, then the Custom modules'. Updated in place when
 *  the Custom modules reload (lib/custom), so readers always see the current set. */
export const WIDGETS: WidgetDef[] = [...FIRST_PARTY];

export const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

onCustomChange(() => {
  WIDGETS.splice(0, WIDGETS.length, ...FIRST_PARTY, ...customWidgetDefs());
  WIDGET_BY_ID.clear();
  WIDGETS.forEach((w) => WIDGET_BY_ID.set(w.id, w));
});

/** Today takes any Widget not kept to its Area; an Area's Board takes only
 *  its own. A Widget whose module is off in atlas.yaml goes nowhere. */
export function allowedOn(board: BoardKey, def: WidgetDef): boolean {
  if (!areaEnabled(def.area)) return false;
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
  if (board === "today") {
    return TODAY.filter((t) => {
      const def = WIDGET_BY_ID.get(t.widget);
      return def !== undefined && allowedOn("today", def);
    });
  }
  return widgetsFor(board as AreaKey)
    .filter((w) => !w.galleryOnly)
    .map((w) => ({ widget: w.id, size: w.sizes[w.sizes.length - 1] }));
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

/** A saved Board brought up to date with Modules enabled since it was saved:
 *  their default Widgets appended once (see lib/board-modules). Never-saved
 *  Boards (`saved` null) need nothing: their default already has them. */
export function catchUpBoard(
  board: BoardKey,
  saved: TileSpec[] | null | undefined,
  seen: string[] | null | undefined,
): { layout: TileSpec[] | null; seen: string[] | null; changed: boolean } {
  const enabled = enabledModules();
  if (!saved || !enabled) return { layout: saved ?? null, seen: seen ?? null, changed: false };
  const r = catchUp(saved, seen ?? null, enabled, defaultBoard(board));
  return r;
}

export function boardTitle(board: BoardKey): string {
  return board === "today" ? "Today" : AREAS[board].label;
}
