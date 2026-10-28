/* Catching a saved Board up with Modules switched on since it was saved.

   A saved layout is the whole of a Board, so a Module enabled later would never
   get a Widget on it (Work and Listening have no nav tab, so Today's Widget is
   the way in). Each saved Board remembers the Modules that were on when it was
   last written; one on now but not remembered gets its default Widgets
   appended, once, after what is already there. The Board then remembers it, so
   a Widget you remove stays removed. Pure: the registry feeds it the facts. */

export interface Tile {
  widget: string;
  size: string;
}

export interface CatchUp<T extends Tile> {
  layout: T[];
  seen: string[];
  /** The Board has something new to write back. */
  changed: boolean;
}

/** The Module a Widget id belongs to: "work.shift" is Work's. */
export function moduleOf(widget: string): string {
  return widget.split(".", 1)[0];
}

/**
 * @param layout   the saved layout, already checked against the catalog
 * @param seen     Modules the Board remembers, null if it predates that (then: those with a Widget on it)
 * @param enabled  Modules on now
 * @param defaults the Board's default Widgets from every enabled Module, in order
 */
export function catchUp<T extends Tile>(layout: T[], seen: string[] | null, enabled: string[], defaults: T[]): CatchUp<T> {
  // Saved before Boards remembered Modules: take the Modules with a Widget on
  // the Board as the ones it has seen, so an enabled Module with no Widget
  // there counts as new. (Someone who had removed all of a Module's Widgets
  // gets them back this once.)
  const known = seen ?? [...new Set(layout.map((t) => moduleOf(t.widget)))];
  const fresh = new Set(enabled.filter((m) => !known.includes(m)));
  if (fresh.size === 0) return { layout, seen: seen ?? enabled, changed: seen === null };
  const placed = new Set(layout.map((t) => t.widget));
  const added = defaults.filter((t) => fresh.has(moduleOf(t.widget)) && !placed.has(t.widget));
  return { layout: [...layout, ...added], seen: [...known, ...fresh], changed: true };
}
