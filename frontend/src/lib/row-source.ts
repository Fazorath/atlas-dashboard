/* Where Edit week's rows came from: the saved week, a Draft week, or Copy last
   week (which remembers the Draft week it replaced). Only rows from a Draft
   week get the "Filled in from your schedule photo" banner and its Discard;
   Save deletes the Draft week the rows came from or replaced, so one week keeps
   at most one draft. */

export interface DraftRef {
  id: number;
  week_guessed: boolean;
}

export type RowSource =
  | { kind: "saved" }
  | { kind: "draft"; draft: DraftRef }
  | { kind: "copy"; replaced: number | null };

export const SAVED: RowSource = { kind: "saved" };

export const fromDraft = (draft: DraftRef): RowSource => ({ kind: "draft", draft });

export function copied(prev: RowSource, offered: number | null = null): RowSource {
  // An offered Draft week that was never loaded is replaced too.
  return { kind: "copy", replaced: saveDraftId(prev) ?? offered };
}

/** The Draft week the banner is about, or null when the rows aren't from one. */
export function bannerDraft(s: RowSource): DraftRef | null {
  return s.kind === "draft" ? s.draft : null;
}

/** The Draft week Save should delete; also the one not to offer back. */
export function saveDraftId(s: RowSource): number | null {
  return s.kind === "draft" ? s.draft.id : s.kind === "copy" ? s.replaced : null;
}
