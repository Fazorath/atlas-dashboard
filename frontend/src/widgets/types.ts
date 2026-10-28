/* What a Widget is, as the Board sees it.

   This is the frontend half of the module manifest (M1): every Area declares
   its Widgets here — id, Sizes, where they may be placed — and the Board, the
   Widget gallery and saved layouts all key off the id. Nothing outside
   `widgets/` names a Widget, so adding one is one entry in its Area's file. */

import type { ComponentType } from "react";

import type { AreaKey } from "@/lib/sections";

/** S 1×1 · M 2×1 · L 2×2 · XL 4×2 (2×4 on a phone). A bigger Size shows more,
 *  never the same thing stretched. */
export type Size = "S" | "M" | "L" | "XL";

export const SIZES: readonly Size[] = ["S", "M", "L", "XL"];

/** Today, or one Area's own screen. */
export type BoardKey = "today" | AreaKey;

export interface WidgetProps {
  size: Size;
}

export interface WidgetDef {
  /** "<area>.<name>", stable forever: saved Boards store it. */
  id: string;
  title: string;
  area: AreaKey;
  /** Smallest first. */
  sizes: readonly Size[];
  /** "anywhere": Today and its own Area. "area": its Area's Board only
   *  (an Area-only widget, too detailed for Today). */
  placement: "anywhere" | "area";
  render: ComponentType<WidgetProps>;
  /** True: offered in the Widget gallery but left out of an Area's default
   *  Board (Today's list is explicit). For a Widget that is an alternative to
   *  another one, so a fresh Board doesn't show the same thing twice. */
  galleryOnly?: boolean;
  /** A hook: true when the Widget has nothing to say on this Board right now
   *  and should step aside so the grid packs (Next class on a day without
   *  class). Ignored in Edit mode, where every placed Widget stays visible. */
  useAbsent?: (board: BoardKey) => boolean;
}

/** One placed Widget. A Board is an ordered list of these; the grid packs it. */
export interface TileSpec {
  widget: string;
  size: Size;
}
