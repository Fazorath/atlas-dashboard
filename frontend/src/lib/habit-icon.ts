/* A Habit icon is one emoji or character (the server rejects more). The
   Manage square runs every keystroke and paste through this, so typing a
   word or pasting two emoji keeps only the first symbol. Segmenter counts a
   flag, a skin-tone emoji or a ZWJ family as one, the way you see them. */

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The first symbol of `text`, ignoring leading spaces, or "" when blank. */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? "";
}
