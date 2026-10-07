/**
 * TUL-78 #11 — decide what a live (debounced) inspector text edit should save.
 * Returns the value to commit, or null when there is nothing to save.
 * Mirrors the rich-text field rule: the default-locale field never saves an
 * empty value; a secondary-locale field may be cleared (allowEmpty).
 */
export function liveTextCommitValue(input: {
  draft: string;
  saved: string;
  allowEmpty: boolean;
}): string | null {
  const next = input.draft.trim();
  if (!input.allowEmpty && next.length === 0) return null;
  if (next === input.saved.trim()) return null;
  return input.allowEmpty ? next : input.draft;
}

export const LIVE_TEXT_DEBOUNCE_MS = 450;
