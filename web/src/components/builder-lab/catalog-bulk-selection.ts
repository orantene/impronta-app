/**
 * catalog-bulk-selection.ts — PURE selection-set + batch-input derivation logic
 * for the Catalog row table's O2 bulk action bar.
 *
 * NO React, NO Supabase, NO `.css` side-effect import — a leaf the tsx test
 * runner loads directly (mirrors surface-keys.ts). The table component owns the
 * `Set<string>` of selected ids in local state and calls these helpers to mutate
 * it and to shape the `SetCatalogOverlayInput[]` / ref-list the O1 batch server
 * actions (`setComponentOverlayBatch` / `clearComponentOverlayBatch`) consume.
 *
 * Why the derivation lives here, not inline: the per-surface batch payload must
 * (a) skip rows whose `target_context` forbids the surface (subtract-only — never
 * widen a component beyond its declared target), and (b) dual-write the legacy
 * `talent_enabled` / `workspace_enabled` pair as the AND of the two surfaces
 * sharing that target, exactly like the single-row `toggleSurface` does, so a
 * rollback to pre-X4 code still reads sane visibility. That is fiddly enough to
 * deserve unit coverage away from the DOM.
 */

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type { SetCatalogOverlayInput } from "@/lib/site-admin/add-gallery/registry-db-merge";
import {
  CATALOG_SURFACE_KEYS,
  SURFACE_COLUMN,
  surfaceAllowedForTarget,
  surfaceEnabledForRow,
  type CatalogSurfaceKey,
} from "@/lib/site-admin/add-gallery/surface-keys";

// ── selection-set primitives (PURE) ─────────────────────────────────────────

/** Toggle one id in the selection set, returning a NEW set (never mutates). */
export function toggleSelected(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Select every currently-visible row id (union with the existing selection so a
 * "select all" on a filtered view never drops a selection made on another view).
 */
export function selectAllVisible(
  selected: ReadonlySet<string>,
  visibleIds: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(selected);
  for (const id of visibleIds) next.add(id);
  return next;
}

/**
 * Clear the visible rows from the selection (union-aware inverse of
 * {@link selectAllVisible}); ids selected on other views are preserved.
 */
export function clearVisible(
  selected: ReadonlySet<string>,
  visibleIds: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(selected);
  for (const id of visibleIds) next.delete(id);
  return next;
}

/** Empty the whole selection. */
export function clearSelection(): Set<string> {
  return new Set<string>();
}

/** True when EVERY visible id is selected (and there is at least one visible). */
export function allVisibleSelected(
  selected: ReadonlySet<string>,
  visibleIds: ReadonlyArray<string>,
): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

/** The selected rows, in the order they appear in `rows`. */
export function selectedRows(
  rows: ReadonlyArray<CatalogAdminItem>,
  selected: ReadonlySet<string>,
): CatalogAdminItem[] {
  return rows.filter((r) => selected.has(r.id));
}

// ── batch-input derivation (PURE) ────────────────────────────────────────────

/** The current four-surface enabled state for a row, read from its overlay. */
function currentFourSurface(
  item: CatalogAdminItem,
): Record<CatalogSurfaceKey, boolean> {
  return CATALOG_SURFACE_KEYS.reduce(
    (acc, key) => {
      acc[key] = surfaceEnabledForRow(item.overlay, key);
      return acc;
    },
    {} as Record<CatalogSurfaceKey, boolean>,
  );
}

/**
 * Build the `SetCatalogOverlayInput[]` that flips ONE surface to `enabled` for
 * every selected row whose `target_context` permits that surface. Rows the
 * surface can't widen onto are SKIPPED (subtract-only). Each input writes the
 * targeted surface column plus the legacy mirror (AND of the two surfaces that
 * share the surface's coarse target), matching the single-row toggle writer.
 */
export function deriveSurfaceBatchInputs(
  rows: ReadonlyArray<CatalogAdminItem>,
  surfaceKey: CatalogSurfaceKey,
  enabled: boolean,
): SetCatalogOverlayInput[] {
  const column = SURFACE_COLUMN[surfaceKey] as keyof SetCatalogOverlayInput;
  const inputs: SetCatalogOverlayInput[] = [];
  for (const r of rows) {
    if (!surfaceAllowedForTarget(r.targetContext, surfaceKey)) continue;
    const nextFour = { ...currentFourSurface(r), [surfaceKey]: enabled };
    const legacyTalent = nextFour.talent_profile && nextFour.talent_shell;
    const legacyWorkspace = nextFour.workspace_page && nextFour.workspace_shell;
    inputs.push({
      item_ref: r.id,
      source: r.source,
      [column]: enabled,
      talent_enabled: legacyTalent,
      workspace_enabled: legacyWorkspace,
    } as SetCatalogOverlayInput);
  }
  return inputs;
}

/**
 * Build the `SetCatalogOverlayInput[]` that sets `availability_override` for
 * every selected row — the overlay-level Publish (`available`) / Archive
 * (`hidden`) flip the live galleries honor globally. Applies to BOTH code and
 * template rows (the batch action writes the overlay column either way).
 */
export function deriveAvailabilityBatchInputs(
  rows: ReadonlyArray<CatalogAdminItem>,
  availability: "available" | "hidden",
): SetCatalogOverlayInput[] {
  return rows.map((r) => ({
    item_ref: r.id,
    source: r.source,
    availability_override: availability,
  }));
}

/** The item_refs to clear (Reset overlay) for the selected rows. */
export function deriveResetRefs(
  rows: ReadonlyArray<CatalogAdminItem>,
): string[] {
  return rows.map((r) => r.id);
}
