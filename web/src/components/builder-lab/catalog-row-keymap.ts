/**
 * catalog-row-keymap.ts — PURE roving-tabindex + key→action logic for the
 * Catalog row table's O8 keyboard affordances.
 *
 * NO React, NO DOM, NO `.css` side-effect import — a leaf the tsx test runner
 * loads directly (mirrors catalog-bulk-selection.ts). The table component owns
 * the focused-row-id in local state and the keydown listener; it calls these
 * helpers to move focus (j/k) and to map a key press to a semantic action that
 * it then dispatches against the existing row handlers
 * (`onRowClick`/`onToggleSurface`/`onPreview`).
 *
 * Keeping the movement + key map here (a) makes the off-by-one roving math
 * (wrap? clamp? empty list? focus dropped out of view?) unit-testable away from
 * the DOM, and (b) keeps the single documented "t/w map to the two PRIMARY
 * surfaces" decision in one obvious place.
 */

import type { CatalogSurfaceKey } from "@/lib/site-admin/add-gallery/registry-db-merge";

/**
 * The two PRIMARY tenant surfaces the `t` / `w` shortcuts toggle on the focused
 * row. The row table has five surface toggle columns (X4/X6); rather than bind
 * five awkward chords, the keyboard exposes the two surfaces an operator gates
 * most: the talent freeform profile (`t`) and the agency storefront page (`w`).
 * The other three stay mouse/checkbox-driven. Documented intentionally simple.
 */
export const PRIMARY_SURFACE_FOR_KEY: Readonly<
  Record<"t" | "w", CatalogSurfaceKey>
> = {
  t: "talent_profile",
  w: "workspace_page",
};

/** The semantic actions the row-table keymap can produce. */
export type CatalogRowKeyAction =
  | { type: "focus-next" }
  | { type: "focus-prev" }
  | { type: "edit" }
  | { type: "preview" }
  | { type: "toggle-surface"; surface: CatalogSurfaceKey }
  | { type: "focus-search" }
  | { type: "collapse" };

/**
 * Map a raw key (already lowercased by the caller) to a semantic row action, or
 * `null` if the key is not a row-table shortcut. The caller decides whether a
 * focused row is required (move/edit/preview/toggle need one; search/collapse
 * don't) — see {@link actionNeedsFocusedRow}.
 *
 *   j → focus-next      k → focus-prev
 *   e → edit            p → preview
 *   t → toggle talent_profile   w → toggle workspace_page
 *   / → focus-search    Escape → collapse
 */
export function keyToRowAction(key: string): CatalogRowKeyAction | null {
  switch (key) {
    case "j":
      return { type: "focus-next" };
    case "k":
      return { type: "focus-prev" };
    case "e":
      return { type: "edit" };
    case "p":
      return { type: "preview" };
    case "t":
      return { type: "toggle-surface", surface: PRIMARY_SURFACE_FOR_KEY.t };
    case "w":
      return { type: "toggle-surface", surface: PRIMARY_SURFACE_FOR_KEY.w };
    case "/":
      return { type: "focus-search" };
    case "escape":
      return { type: "collapse" };
    default:
      return null;
  }
}

/** True iff the action operates on the currently focused row (so the handler
 *  should no-op when nothing is focused). `/` and Escape are global. */
export function actionNeedsFocusedRow(action: CatalogRowKeyAction): boolean {
  return (
    action.type !== "focus-search" &&
    action.type !== "collapse" &&
    action.type !== "focus-next" &&
    action.type !== "focus-prev"
  );
}

/**
 * The next focused row id after pressing `j`, given the current focus and the
 * full visible-id list (across every group). Rules:
 *
 *  • empty list            → null (nothing to focus)
 *  • no current focus      → first row (j enters the table at the top)
 *  • focus not in list     → first row (the focused row scrolled out of view)
 *  • at the last row       → stays on the last row (clamp, no wrap)
 *  • otherwise             → the following row
 */
export function nextRowId(
  current: string | null,
  visibleIds: readonly string[],
): string | null {
  if (visibleIds.length === 0) return null;
  if (current === null) return visibleIds[0];
  const idx = visibleIds.indexOf(current);
  if (idx === -1) return visibleIds[0];
  if (idx >= visibleIds.length - 1) return visibleIds[idx];
  return visibleIds[idx + 1];
}

/**
 * The previous focused row id after pressing `k`. Mirror of {@link nextRowId}:
 *
 *  • empty list            → null
 *  • no current focus      → last row (k enters the table at the bottom)
 *  • focus not in list     → first row
 *  • at the first row      → stays on the first row (clamp, no wrap)
 *  • otherwise             → the preceding row
 */
export function prevRowId(
  current: string | null,
  visibleIds: readonly string[],
): string | null {
  if (visibleIds.length === 0) return null;
  if (current === null) return visibleIds[visibleIds.length - 1];
  const idx = visibleIds.indexOf(current);
  if (idx === -1) return visibleIds[0];
  if (idx <= 0) return visibleIds[0];
  return visibleIds[idx - 1];
}

/**
 * Should a keydown be ignored because the user is typing in a form control?
 * Mirrors the standard "don't hijack while an input is focused" guard. The ONE
 * exception is `/` (focus-search): it works even from another input so the
 * operator can always jump to search. The caller passes the lowercased key and
 * the event target's tag name (lowercased).
 */
export function shouldIgnoreKeyForTarget(
  key: string,
  targetTag: string,
): boolean {
  if (key === "/") return false;
  return (
    targetTag === "input" ||
    targetTag === "textarea" ||
    targetTag === "select"
  );
}
