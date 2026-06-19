/**
 * catalog-undo — PURE logic that turns a just-applied governance mutation into an
 * UNDO descriptor: a human label + the exact revert operation that restores the
 * pre-mutation state. Split out of component-catalog.tsx so it is unit-testable
 * and carries no React / server-action dependency.
 *
 * The Lab's governance writes (per-surface toggle, status change, save edit,
 * reset) all go through `setComponentOverlay` / `clearComponentOverlay`. Before
 * each write the catalog captures the row's overlay as it stood (`before`); this
 * module reads that snapshot and decides how to put it back:
 *
 *   • `before` was a real overlay row  → re-APPLY it verbatim via
 *     `setComponentOverlay` (restores every field, including the toggled one).
 *   • `before` was null (no overlay)    → the row had table defaults, so undo
 *     CLEARS the overlay via `clearComponentOverlay` (back to code/template
 *     defaults).
 *
 * This re-applies the captured `before` rather than building a new revert
 * mechanism — the same round-trip a normal edit takes, so undo can't drift from
 * what a fresh write would produce.
 */

import type {
  CatalogOverlayRow,
  SetCatalogOverlayInput,
} from "@/lib/site-admin/add-gallery";

/** The governance mutations that are undoable from the toast. */
export type UndoMutationKind = "toggle" | "status" | "save" | "reset";

/** Captured at the moment of mutation — enough to reconstruct the revert. */
export interface UndoSource {
  kind: UndoMutationKind;
  itemRef: string;
  source: "code" | "template";
  /** The row's overlay BEFORE the write (null ⇒ the row had no overlay). */
  before: CatalogOverlayRow | null;
  /** Human label for the row (used in the toast copy). */
  itemLabel: string;
}

/** What the toast's "Undo" button should do. */
export type UndoRevert =
  | { mode: "apply"; input: SetCatalogOverlayInput }
  | { mode: "clear"; itemRef: string };

export interface UndoDescriptor {
  /** The success message for the mutation (e.g. "Hidden on Talent"). */
  message: string;
  /** Whether this mutation can be undone (DB-template status changes can't, see
   *  below). When false the toast shows no Undo action. */
  undoable: boolean;
  /** Present only when `undoable` — the operation that restores `before`. */
  revert?: UndoRevert;
  /** The label shown on the Undo button (always "Undo"; here for symmetry/test). */
  undoLabel: string;
}

/** Turn a `CatalogOverlayRow` snapshot into the full `setComponentOverlay`
 *  patch that reproduces it. Every overlay-owned field is written explicitly so
 *  re-applying it is a TOTAL restore (a missing key would leave the live value
 *  in place, which is not what "undo" means). */
export function overlayToInput(
  overlay: CatalogOverlayRow,
): SetCatalogOverlayInput {
  const input: SetCatalogOverlayInput = {
    item_ref: overlay.item_ref,
    source: overlay.source,
    talent_enabled: overlay.talent_enabled,
    workspace_enabled: overlay.workspace_enabled,
    label_override: overlay.label_override,
    icon_override: overlay.icon_override,
    category_override: overlay.category_override,
    required_plan_override: overlay.required_plan_override,
    availability_override: overlay.availability_override,
    default_variant: overlay.default_variant ?? null,
    default_props: overlay.default_props ?? null,
    data_source_defaults: overlay.data_source_defaults ?? null,
    locked_props: overlay.locked_props ?? [],
  };
  // X4 — restore the four independent surface toggles when the snapshot carried
  // them (the DB always supplies them post-migration). Only assigned when
  // present so a pre-X4 fixture's `before` re-applies through the legacy pair.
  if (overlay.talent_profile_enabled !== undefined)
    input.talent_profile_enabled = overlay.talent_profile_enabled;
  if (overlay.talent_shell_enabled !== undefined)
    input.talent_shell_enabled = overlay.talent_shell_enabled;
  if (overlay.workspace_page_enabled !== undefined)
    input.workspace_page_enabled = overlay.workspace_page_enabled;
  if (overlay.workspace_shell_enabled !== undefined)
    input.workspace_shell_enabled = overlay.workspace_shell_enabled;
  // X6 — restore the independent Builder-Lab visibility axis.
  if (overlay.lab_enabled !== undefined) input.lab_enabled = overlay.lab_enabled;
  return input;
}

/** Default success copy per mutation kind. The caller may override `message`. */
function defaultMessage(kind: UndoMutationKind): string {
  switch (kind) {
    case "toggle":
      return "Updated ✓";
    case "status":
      return "Status updated ✓";
    case "save":
      return "Saved ✓";
    case "reset":
      return "Reset ✓";
  }
}

/**
 * Build the undo descriptor for a mutation (PURE).
 *
 * Undoability rules:
 *  • `code`-source rows write through `setComponentOverlay`/`clearComponentOverlay`
 *    for EVERY mutation kind (toggle/status/save/reset), so the captured `before`
 *    overlay fully restores them — all four kinds are undoable.
 *  • `template`-source STATUS changes dispatch the registry lifecycle actions
 *    (publish/archive/…), NOT the overlay — re-applying the overlay would not
 *    move the lifecycle back. So template status changes are NOT undoable here
 *    (the toast shows no Undo). Template toggle/save/reset still ride the overlay
 *    and remain undoable.
 *
 * @param message Optional override for the success copy (the caller usually
 *                passes its surface-specific message, e.g. "Hidden on Talent").
 */
export function buildUndoDescriptor(
  src: UndoSource,
  message?: string,
): UndoDescriptor {
  const undoLabel = "Undo";
  const msg = message ?? defaultMessage(src.kind);

  const undoable = !(src.source === "template" && src.kind === "status");
  if (!undoable) {
    return { message: msg, undoable: false, undoLabel };
  }

  const revert: UndoRevert = src.before
    ? { mode: "apply", input: overlayToInput(src.before) }
    : { mode: "clear", itemRef: src.itemRef };

  return { message: msg, undoable: true, revert, undoLabel };
}
