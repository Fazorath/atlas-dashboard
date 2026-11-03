/* What's new — the notes shown after an update.

   One source of truth: CHANGELOG.md. The build embeds its text (vite.config.ts)
   and this parses it, using the same heading rule as the release job's
   .github/scripts/changelog_section.py, so a version's notes are never written
   twice. What a device has already seen is one localStorage value, the last
   version it showed or recorded. */

export type Entry = { version: string; date: string | null; bullets: string[] };

/** The slice of Storage this needs, so tests can pass a plain object. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

const SEEN_KEY = "atlas.whats-new.seen";

// Same rule as changelog_section.py: "## [0.1.0] - 2026-11-03".
const HEADING = /^##\s+\[?v?([^\]\s]+)\]?(?:\s+-\s+(\S+))?/;
const BULLET = /^\s*[-*]\s+(.*)$/;

/** Markdown out of a bullet: links keep their text, emphasis and code lose marks. */
function plain(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .trim();
}

/** Released versions, newest first as written. Unreleased and bullet-less sections are left out. */
export function parseChangelog(text: string): Entry[] {
  const entries: Entry[] = [];
  let current: Entry | null = null;
  let bullet: string | null = null;
  const flush = () => {
    if (current && bullet !== null) current.bullets.push(plain(bullet));
    bullet = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const h = HEADING.exec(line);
    if (h) {
      flush();
      current = h[1].toLowerCase() === "unreleased" ? null : { version: h[1], date: h[2] ?? null, bullets: [] };
      if (current) entries.push(current);
      continue;
    }
    if (!current) continue;
    const b = BULLET.exec(line);
    if (b) {
      flush();
      bullet = b[1];
    } else if (bullet !== null && /^\s+\S/.test(line)) {
      bullet += ` ${line.trim()}`; // a wrapped bullet
    } else {
      flush();
    }
  }
  flush();
  return entries.filter((e) => e.bullets.length > 0);
}

/** The build's version ("v0.1.0" or "0.1.0"), or "" for a dev build. */
export function cleanVersion(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(/^v/, "");
}

/** The entry to show on open, or null. The first open ever records the version silently. */
export function sheetToShow(store: KeyValueStore, current: string, entries: Entry[]): Entry | null {
  if (!current) return null;
  try {
    const seen = store.getItem(SEEN_KEY);
    if (seen === null) {
      store.setItem(SEEN_KEY, current);
      return null;
    }
    if (seen === current) return null;
  } catch {
    return null;
  }
  // A release candidate (0.1.0-rc1) shows the notes of the version it previews,
  // like changelog_section.py does for the GitHub Release.
  const base = current.replace(/-rc\d+$/, "");
  const entry =
    entries.find((e) => e.version === current) ?? entries.find((e) => e.version === base) ?? null;
  // A version with no notes shows nothing, but counts as seen so a later
  // rollback or update compares against this one.
  if (!entry) markSeen(store, current);
  return entry;
}

export function markSeen(store: KeyValueStore, version: string): void {
  try {
    store.setItem(SEEN_KEY, version);
  } catch {
    /* private mode: the sheet may show again next open */
  }
}
