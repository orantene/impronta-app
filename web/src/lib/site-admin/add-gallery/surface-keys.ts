/**
 * surface-keys.ts — the FOUR real builder surfaces the catalog governs (X1/X4)
 * and the PURE helpers that map the legacy 2-toggle overlay axis onto them.
 *
 * Split out of `registry-db-merge.ts` (which hit the 800-line cap) so the
 * surface-key vocabulary lives in one dependency-light place. NO React, NO
 * Supabase, NO `.css` side-effect import — safe for the tsx test graph. The
 * `CatalogOverlayRow` shape is imported as a TYPE only (erased at compile), so
 * this module stays a leaf the test runner can load directly.
 */

import type { CatalogOverlayRow } from "./registry-db-merge";

/** The four real builder surfaces the catalog governs. */
export type CatalogSurfaceKey =
  | "talent_profile"
  | "talent_shell"
  | "workspace_page"
  | "workspace_shell";

/** Stable ordered list of the four surfaces (matrix column order). */
export const CATALOG_SURFACE_KEYS: readonly CatalogSurfaceKey[] = [
  "talent_profile",
  "talent_shell",
  "workspace_page",
  "workspace_shell",
] as const;

/** Human label per surface (single source for the matrix headers + the X1 cells). */
export const CATALOG_SURFACE_LABEL: Record<CatalogSurfaceKey, string> = {
  talent_profile: "Talent profile",
  talent_shell: "Talent shell",
  workspace_page: "Workspace page",
  workspace_shell: "Workspace shell",
};

/** The four per-surface overlay boolean column names, keyed by surface. */
export const SURFACE_COLUMN: Record<CatalogSurfaceKey, keyof CatalogOverlayRow> = {
  talent_profile: "talent_profile_enabled",
  talent_shell: "talent_shell_enabled",
  workspace_page: "workspace_page_enabled",
  workspace_shell: "workspace_shell_enabled",
};

/**
 * The 2→4 FORWARD migration (PURE) — the lossless mapping the SQL backfill and
 * the live read-path fallback both implement, in ONE place so they can never
 * drift. talent_* ⇐ talent_enabled, workspace_* ⇐ workspace_enabled. Missing
 * legacy values default to `true` (the table default), matching COALESCE(...,true).
 */
export function legacyToFourSurface(legacy: {
  talent_enabled?: boolean | null;
  workspace_enabled?: boolean | null;
}): Record<CatalogSurfaceKey, boolean> {
  const t = legacy.talent_enabled ?? true;
  const w = legacy.workspace_enabled ?? true;
  return {
    talent_profile: t,
    talent_shell: t,
    workspace_page: w,
    workspace_shell: w,
  };
}

/**
 * Is `item` enabled on `surfaceKey` per an overlay row (PURE)? Honors the X4
 * per-surface column when the row carries it; otherwise falls back LOSSLESSLY to
 * the legacy 2-toggle pair via {@link legacyToFourSurface}. A null/undefined row
 * ⇒ enabled (no overlay = code/template default). This is the ONE chokepoint the
 * 4-surface read path uses, so the back-compat fallback lives in exactly one spot.
 */
export function surfaceEnabledForRow(
  row: CatalogOverlayRow | null | undefined,
  surfaceKey: CatalogSurfaceKey,
): boolean {
  if (!row) return true;
  const col = SURFACE_COLUMN[surfaceKey];
  const explicit = row[col];
  if (typeof explicit === "boolean") return explicit;
  return legacyToFourSurface(row)[surfaceKey];
}

/** The coarse target axis a surface key belongs to (for target_context gating —
 *  the ORTHOGONAL visibility axis that stays untouched by the 4-toggle split). */
export function surfaceKeyToTarget(
  surfaceKey: CatalogSurfaceKey,
): "talent" | "workspace" {
  return surfaceKey === "talent_profile" || surfaceKey === "talent_shell"
    ? "talent"
    : "workspace";
}
