/**
 * Per-tenant coachmark persistence (Builder 2026 M7).
 */

const STORAGE_KEY = "impronta.editChrome.coachmarks.v1";

export type CoachmarkId =
  | "cmd-k-tip"
  | "pin-workspace"
  | "outline-tab"
  | "multi-select-toolbar"
  // CANVAS-3 — first-run coachmarks for the 3 core canvas gestures.
  | "double-click-edit"
  | "move-grip"
  | "plus-line-insert";

/**
 * Ordered sequence for the CANVAS-3 core-gesture coachmarks.
 * Only the first undismissed id in this list is shown — tips surface
 * one-at-a-time so the canvas never shows all three simultaneously.
 */
export const CANVAS_GESTURE_COACHMARK_SEQUENCE: ReadonlyArray<CoachmarkId> = [
  "double-click-edit",
  "move-grip",
  "plus-line-insert",
];

/**
 * Returns the first coachmark in `sequence` that has not yet been dismissed,
 * or `null` when all have been seen. Used to enforce one-at-a-time display.
 */
export function nextUndismissedCoachmark(
  sequence: ReadonlyArray<CoachmarkId>,
): CoachmarkId | null {
  for (const id of sequence) {
    if (!isCoachmarkDismissed(id)) return id;
  }
  return null;
}

export function isCoachmarkDismissed(id: CoachmarkId): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return false;
    return parsed.includes(id);
  } catch {
    return false;
  }
}

export function dismissCoachmark(id: CoachmarkId): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(id)) list.push(id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}
