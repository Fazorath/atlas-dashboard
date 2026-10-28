/* Custom modules (config/custom/*.yaml), as the dashboard needs them: the pure
   half. `GET /api/custom` becomes Area and Widget definitions here; lib/custom.ts
   puts them in the registry. No React and no imports, so `node --test` runs it. */

export interface CustomPayloadWidget {
  /** "custom.<module>.<widget>" */
  id: string;
  widget: string;
  type: string;
  title: string;
  sizes: string[];
  display: Record<string, unknown>;
}

export interface CustomPayloadModule {
  id: string;
  name: string;
  area: { key: string; new: boolean; label: string | null; icon: string | null; accent: string | null } | null;
  widgets: CustomPayloadWidget[];
  /** The secrets the file declares; `set` says whether a value is stored (never the value). */
  secrets: { name: string; set: boolean }[];
  problem: string | null;
}

/** An Area a Custom module brings. */
export interface CustomArea {
  key: string;
  to: string;
  label: string;
  /** Lucide icon name, or null for the fallback. */
  icon: string | null;
  /** The `data-accent` value: a palette name, or `custom-<id>` for a hex colour. */
  accent: string;
  /** Set for a hex accent: the colour `accent` stands for. */
  hex: string | null;
  /** The Status entry whose Freshness the Area's header shows. */
  source: string;
}

export interface CustomWidget {
  id: string;
  module: string;
  widget: string;
  type: "stat" | "list";
  title: string;
  area: string;
  sizes: string[];
  display: Record<string, unknown>;
}

const PALETTE = ["sleep", "habits", "due", "money", "weather", "work"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Areas and Widgets from the modules that loaded cleanly. A module with a
 *  Problem builds nothing: it shows on the Status screen instead. */
export function buildCustom(modules: CustomPayloadModule[]): { areas: CustomArea[]; widgets: CustomWidget[] } {
  const areas: CustomArea[] = [];
  const widgets: CustomWidget[] = [];
  for (const m of modules) {
    if (m.problem || !m.area) continue;
    if (m.area.new) {
      const accent = m.area.accent ?? "";
      const hex = HEX.test(accent) ? accent : null;
      areas.push({
        key: m.area.key,
        to: `/c/${m.id}`,
        label: m.area.label ?? m.name,
        icon: m.area.icon,
        accent: hex ? `custom-${m.id}` : PALETTE.includes(accent) ? accent : "sleep",
        hex,
        source: `custom:${m.id}`,
      });
    }
    for (const w of m.widgets) {
      if (w.type !== "stat" && w.type !== "list") continue;
      widgets.push({ id: w.id, module: m.id, widget: w.widget, type: w.type, title: w.title, area: m.area.key, sizes: w.sizes, display: w.display });
    }
  }
  return { areas, widgets };
}

/** The CSS that gives each hex-accent Area its `data-accent` block. */
export function accentCss(areas: CustomArea[]): string {
  return areas
    .filter((a) => a.hex)
    .map((a) => {
      const c = a.hex as string;
      return (
        `[data-accent="${a.accent}"]{--accent:${c};` +
        `--accent-tint:color-mix(in srgb,${c} 16%,transparent);` +
        `--accent-track:color-mix(in srgb,${c} 24%,transparent);` +
        `--accent-soft:color-mix(in srgb,${c} 70%,white)}`
      );
    })
    .join("\n");
}

/** A Stat's value as text. `number` reads numeric text too (Home Assistant
 *  sends "21.4"); anything that isn't a number falls back to its text. */
export function formatStat(
  value: unknown,
  display: { format?: unknown; decimals?: unknown },
  locale?: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (display.format === "number") {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(n)) {
      const d = typeof display.decimals === "number" ? display.decimals : null;
      return n.toLocaleString(locale, d === null ? { maximumFractionDigits: 20 } : { minimumFractionDigits: d, maximumFractionDigits: d });
    }
  }
  return String(value);
}

/** One row of a List, as `GET /api/custom/<module>/widgets/<widget>` sends it. */
export interface ListRow {
  title: string;
  detail: string | null;
  value: unknown;
  status: string | null;
}

/** How many rows a List has room for at each Size. */
const ROOM: Record<string, number> = { S: 1, M: 2, L: 5, XL: 10 };

/** The rows that fit the Size, and how many were left out. */
export function visibleRows(size: string, rows: ListRow[]): { shown: ListRow[]; more: number } {
  const room = ROOM[size] ?? ROOM.M;
  return { shown: rows.slice(0, room), more: Math.max(0, rows.length - room) };
}

/** The background class of a row's status dot, in the existing palette; none for no status. */
export function statusDot(status: string | null): string | null {
  return status === "ok" ? "bg-habits" : status === "warn" ? "bg-money" : status === "bad" ? "bg-due" : null;
}

/** A row's value as text. */
export function rowValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
