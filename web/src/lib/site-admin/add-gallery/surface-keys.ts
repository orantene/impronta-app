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
 * X6 — the overlay column for the FIFTH, orthogonal axis: visibility in the
 * Builder LAB itself. This is NOT one of the four tenant surfaces and NOT the
 * coarse `target_context` — it is an independent governance toggle that decides
 * whether a component appears in the super-admin Lab Catalog/gallery, separate
 * from where it ships on tenant builders. Default `true` ⇒ every component is
 * Lab-visible (the lossless migration-forward default).
 */
export const LAB_COLUMN: keyof CatalogOverlayRow = "lab_enabled";

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

/**
 * X6 — is `item` enabled in the BUILDER LAB per an overlay row (PURE)? The Lab
 * axis is INDEPENDENT of the four tenant surfaces and of `target_context`: a
 * component can be hidden from every tenant builder yet still authored/previewed
 * in the Lab, or shipped to tenants yet hidden from the Lab inventory. Honors the
 * explicit `lab_enabled` column when the row carries it; absence ⇒ `true` (the
 * table default — there is NO legacy column to fall back to, the migration adds
 * the column defaulting true so every existing component stays Lab-visible). A
 * null/undefined row ⇒ enabled (no overlay = code/template default).
 */
export function labEnabledForRow(
  row: CatalogOverlayRow | null | undefined,
): boolean {
  if (!row) return true;
  const explicit = row.lab_enabled;
  if (typeof explicit === "boolean") return explicit;
  return true;
}

/**
 * X3 — tighten-only invariant predicate (PURE). Returns `true` when a given
 * `surfaceKey` is permitted by `targetContext` — i.e., enabling that surface
 * for this component would NOT widen the component beyond its declared target.
 *
 * Rules:
 *  • `"both"` or `"platform"` ⇒ all four tenant surfaces are permitted.
 *  • `"talent"` ⇒ only `talent_profile` and `talent_shell` are permitted.
 *  • `"workspace"` ⇒ only `workspace_page` and `workspace_shell` are permitted.
 *
 * The `lab_enabled` axis is NEVER target-locked — the Lab authors for every
 * audience, so callers must exclude it from this guard (it is not a
 * `CatalogSurfaceKey`, so the type already prevents passing it here).
 *
 * Import DIRECTLY from `surface-keys.ts`, not the `add-gallery` barrel (the
 * barrel drags a `.css` side-effect that breaks the tsx test runner).
 */
export function surfaceAllowedForTarget(
  targetContext: "talent" | "workspace" | "both" | "platform",
  surfaceKey: CatalogSurfaceKey,
): boolean {
  if (targetContext === "both" || targetContext === "platform") return true;
  const requiredTarget = surfaceKeyToTarget(surfaceKey);
  return requiredTarget === targetContext;
}
