/**
 * edit-context-toast-types — the transient-feedback payload shapes carried on
 * the EditContext.
 *
 * Peeled out of `edit-context-types.ts` when that file hit its max-lines
 * budget: these are leaf data shapes with no dependency on the rest of the
 * context surface, so they extract cleanly (the alternative — raising the
 * budget — hides growth instead of paying for it). `edit-context-types` re-
 * exports them, so every existing import site is unchanged.
 */

// CANVAS-7 — the four clipboard gestures that earn a transient success toast.
// Stored on the EditContext so the SHARED clipboard chokepoints (copy/cut/
// paste/duplicate) raise the same feedback for every entry point — keyboard,
// the selection-chip "More" menu, and the right-click context menu — with no
// surface branch. The toast component lives in edit-shell.tsx.
export type BuilderClipboardAction = "copy" | "cut" | "paste" | "duplicate";

export interface BuilderClipboardActionToast {
  action: BuilderClipboardAction;
  /** How many blocks the gesture touched (≥1). Drives "Copied 3 blocks". */
  count: number;
  /** Monotonic nonce so a copy→paste burst re-fires the auto-hide timer. */
  nonce: number;
}

/**
 * DEPTH-CAP HONESTY — the draft-save normalizer had to flatten wrapper chains
 * deeper than the shared cap, so the operator's structure changed. Raised at
 * SAVE time with the affected block names; sticky (no auto-hide) because a
 * structural change to the operator's own work has to be acknowledged.
 */
export interface BuilderLayoutFlattenToast {
  /** Names of the restructured blocks, at most three (see `count`). */
  labels: ReadonlyArray<string>;
  /** Total restructured blocks, which may exceed `labels.length`. */
  count: number;
  /** Monotonic nonce so a later, different restructure re-fires the toast. */
  nonce: number;
}
