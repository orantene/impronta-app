/**
 * Builder clipboard success-toast copy — CANVAS-7.
 *
 * Pure label resolver for the shared "Copied / Cut / Pasted / Duplicated"
 * toast raised by the EditContext clipboard chokepoints. Kept out of
 * edit-shell.tsx (a 2.6k-line god-file) so the copy is unit-testable on its
 * own and the same string drives every surface — no per-surface clipboard
 * wording. The toast component in edit-shell.tsx consumes `clipboardActionLabel`.
 */

import type { BuilderClipboardAction } from "./edit-context";

const PAST_TENSE: Record<BuilderClipboardAction, string> = {
  copy: "Copied",
  cut: "Cut",
  paste: "Pasted",
  duplicate: "Duplicated",
};

/**
 * "Copied block" / "Pasted 3 blocks". `count` is clamped to ≥1 so a malformed
 * 0/negative count never renders "0 blocks". Single = "block", plural =
 * "N blocks". Cut keeps the same shape ("Cut 2 blocks") for consistency.
 */
export function clipboardActionLabel(
  action: BuilderClipboardAction,
  count: number,
): string {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const verb = PAST_TENSE[action];
  const noun = safeCount === 1 ? "block" : `${safeCount} blocks`;
  return `${verb} ${noun}`;
}
