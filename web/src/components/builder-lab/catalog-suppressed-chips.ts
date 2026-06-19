/**
 * D2 — Pure count + filter-predicate helpers for the "Hidden (N)" /
 * "Archived (N)" chips in CatalogRowTable. Kept in a leaf module so the
 * tsx test runner can load it without any .css side-effect imports.
 *
 * Definitions
 * -----------
 * • **Hidden** — the row is suppressed on at least one surface: either
 *   `availability_override === 'hidden'` (drops it from ALL galleries) OR at
 *   least one of the two coarse surface toggles (`talentVisible` /
 *   `workspaceVisible`) is off.  Mirrors the existing `filterMode === 'hidden'`
 *   predicate in component-catalog.tsx so the chip count matches what that
 *   filter would show.
 *
 * • **Archived** — the row's derived `status` is `'archived'`.  For code rows
 *   this is inferred from `availability_override === 'hidden'`; for DB-template
 *   rows it is the real lifecycle status.  A row can be archived without any
 *   surface toggle being off (the parent's filterMode=hidden catches it via the
 *   `archived` branch — we match that here).
 */

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";

/** True iff the row is suppressed on at least one surface. */
export function isHiddenRow(r: CatalogAdminItem): boolean {
  const archived = r.overlay?.availability_override === "hidden";
  const fullyVisible = r.talentVisible && r.workspaceVisible;
  return archived || !fullyVisible;
}

/** True iff the row's lifecycle/derived status is 'archived'. */
export function isArchivedRow(r: CatalogAdminItem): boolean {
  return r.status === "archived";
}

/** The two chip filters this module drives. */
export type SuppressedFilter = "hidden" | "archived" | null;

/**
 * Derive the counts and the filter predicate from a flat list of admin-view
 * rows.  Both counts are computed over the FULL `rows` list (before any chip
 * filter is applied) so the numbers are stable regardless of the active chip.
 *
 * Returns:
 *   • `hiddenCount`  — rows where `isHiddenRow` is true
 *   • `archivedCount` — rows where `isArchivedRow` is true
 *   • `filterRows`  — apply the current chip filter and return only matching
 *                     rows (identity when `filter` is null)
 */
export function deriveSuppressedChipState(
  rows: ReadonlyArray<CatalogAdminItem>,
  filter: SuppressedFilter,
): {
  hiddenCount: number;
  archivedCount: number;
  filterRows: (input: CatalogAdminItem[]) => CatalogAdminItem[];
} {
  let hiddenCount = 0;
  let archivedCount = 0;
  for (const r of rows) {
    if (isHiddenRow(r)) hiddenCount++;
    if (isArchivedRow(r)) archivedCount++;
  }
  const filterRows =
    filter === "hidden"
      ? (input: CatalogAdminItem[]) => input.filter(isHiddenRow)
      : filter === "archived"
        ? (input: CatalogAdminItem[]) => input.filter(isArchivedRow)
        : (input: CatalogAdminItem[]) => input;
  return { hiddenCount, archivedCount, filterRows };
}
