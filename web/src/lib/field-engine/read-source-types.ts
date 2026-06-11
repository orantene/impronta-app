// src/lib/field-engine/read-source-types.ts
//
// PURE TYPES + the per-surface flag for the Phase 2 field-engine unification:
// repoint each System-A reader (`field_definitions` + `field_values`) to the
// canonical System B (`profile_field_definitions` + `talent_profile_field_values`)
// ONE SURFACE AT A TIME, behind a per-surface flag that defaults to reading A.
//
// This module is intentionally dependency-free (no server-only imports, no
// React, no Supabase) so it can be imported by:
//   • the per-surface SERVER readers (each a thin A-reader + B-reader pair),
//   • the shared dispatch seam (`read-source.ts`), and
//   • the unit test (`read-source.test.ts`).
//
// MODELLED ON `client-field-source-types.ts` (the P1 precedent):
//   - parsed from a single env var into typed per-surface flags,
//   - a global kill switch,
//   - pure parser → trivially unit-testable.
//
// DIFFERENCE FROM P1: P1's flag chose static-catalog vs DB for the *client*
// field surfaces. This flag chooses which *value/config store* a SERVER reader
// pulls from — legacy System A (`a`, today's behaviour, the default) or
// canonical System B (`b`). Every surface defaults to `a`, so merging the
// scaffold is 100% behaviour-neutral; T2.1–T2.5 flip one surface at a time
// once its B-reader ships with a parity proof.

// ── Source + surface vocabulary ──────────────────────────────────────────────

/** Which value/config store a surface reads from. `a` = legacy System A
 *  (field_definitions + field_values), `b` = canonical System B
 *  (profile_field_definitions + talent_profile_field_values). */
export type FieldEngineReadSource = "a" | "b";

/**
 * The five System-A reader surfaces being repointed in Phase 2, one task each:
 *   directory_facets — T2.1 — directory facet filtering (value reads +
 *     field_definitions facet config). apply-directory-field-facet-filters.ts,
 *     fetch-directory-page.ts, directory-filter-catalog.ts.
 *   public_sidebar   — T2.2 — /t/[profileCode] sidebar section labels/order +
 *     visibility. page.tsx, public-profile-field-order.ts,
 *     public-profile-field-visibility.ts.
 *   dashboard_nav    — T2.3 — talent dashboard nav groups + taxonomy editor
 *     field governance. talent-nav-groups.ts, talent-dashboard-data.ts.
 *   directory_cards  — T2.4 — directory card attribute catalog.
 *     directory-card-display-catalog.ts.
 *   ai_search_doc    — T2.5 — AI search-doc field reader.
 *     rebuild-ai-search-document.ts, ai-search-document-debug.ts.
 */
export type FieldEngineReadSurface =
  | "directory_facets"
  | "public_sidebar"
  | "dashboard_nav"
  | "directory_cards"
  | "ai_search_doc";

export const FIELD_ENGINE_READ_SURFACES: readonly FieldEngineReadSurface[] = [
  "directory_facets",
  "public_sidebar",
  "dashboard_nav",
  "directory_cards",
  "ai_search_doc",
] as const;

export type FieldEngineReadSourceFlags = Record<
  FieldEngineReadSurface,
  FieldEngineReadSource
>;

/**
 * The default per-surface flags when `FIELD_ENGINE_READ_SOURCE` is unset.
 * EVERY surface defaults to `a` (read legacy System A) — so the scaffold is
 * behaviour-neutral on merge. T2.1–T2.5 each flip ONE surface to `b` after
 * shipping that surface's B-reader + a parity proof.
 *
 * Kill switch: `FIELD_ENGINE_READ_SOURCE=a` forces every surface back to A
 * (instant rollback). Per-surface rollback: name just that surface, e.g.
 * `FIELD_ENGINE_READ_SOURCE=directory_facets:a`.
 */
export const DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS: FieldEngineReadSourceFlags = {
  // T2.1 (this PR) ACTIVATES the directory facet value-store repoint: the facet
  // VALUE reads now default to canonical System B, proven at result-set parity
  // (see read-source-directory-facets.ts + the PR's per-facet-option table).
  // Kill switch: FIELD_ENGINE_READ_SOURCE=directory_facets:a (or =a) reverts to
  // System A; a B-read that throws also safe-falls-back to A at runtime.
  directory_facets: "b",
  // T2.2 (this PR) ACTIVATES the public-profile sidebar VISIBILITY repoint: the
  // /t/[profileCode] sidebar section gates now default to the canonical System B
  // row shape (`profile_field_definitions`), routed through the same already-
  // canonical visibility resolver — proven byte-identical to System A on the 12
  // sampled profiles (see read-source-public-sidebar.ts + the PR parity table;
  // the deprecated `skills` row stays hidden under both stores). ORDER is NOT
  // repointed (hard-coded JSX render; the two stores' order columns diverge but
  // never reach the render — see HAZARD #1 in read-source-public-sidebar.ts).
  // Kill switch: FIELD_ENGINE_READ_SOURCE=public_sidebar:a (or =a) reverts to
  // System A; a B-read that throws also safe-falls-back to A at runtime.
  public_sidebar: "b",
  // T2.3 (this PR) ACTIVATES the talent dashboard nav-groups + fieldCatalog +
  // fieldValues + taxonomy-editor editableFields repoint: these reads now default
  // to canonical System B (`profile_field_definitions` /
  // `talent_profile_field_values`), behind the read-source-dashboard-nav.ts
  // reader pair. Documented diffs vs A (all non-regressive):
  //   1. `classification` group absent in B: talent_type has no B definition.
  //   2. `skills` absent from `abilities` group in B: deprecated in B catalog.
  //   3. instagram_url, tiktok_url, youtube_url absent from `social_external`: no
  //      B canonical definitions for these social URLs yet.
  // Kill switch: FIELD_ENGINE_READ_SOURCE=dashboard_nav:a (or =a) reverts to
  // System A instantly; a B-read that throws also safe-falls-back to A.
  dashboard_nav: "b",
  directory_cards: "a",
  ai_search_doc: "a",
};

/**
 * Parse `FIELD_ENGINE_READ_SOURCE` into per-surface flags.
 *
 * Accepted forms (case-insensitive, whitespace-tolerant):
 *   - unset / ""                       → all `a` (the default — behaviour-neutral)
 *   - "a"                              → all `a` (the global kill switch / rollback)
 *   - "b"                              → all `b` (flip every surface; rare — used
 *                                         only once all five are proven)
 *   - "directory_facets:b"             → that surface `b`, others keep their default
 *   - "public_sidebar:b,ai_search_doc:b" → explicit per-surface list
 *   - "public_sidebar:a"               → revert just that surface (per-surface rollback)
 *
 * Per-surface tokens layer on top of the default flags (naming one surface does
 * not reset the others). Unknown tokens are ignored. Pure — no env access — so
 * it is trivially testable and import-safe everywhere.
 *
 * MIRRORS `parseFieldEngineClientSourceFlags` exactly (same grammar), so the
 * two flags behave identically for operators.
 */
export function parseFieldEngineReadSourceFlags(
  raw: string | null | undefined,
): FieldEngineReadSourceFlags {
  const flags: FieldEngineReadSourceFlags = {
    ...DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS,
  };
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return flags;
  if (value === "a" || value === "b") {
    for (const s of FIELD_ENGINE_READ_SURFACES) flags[s] = value;
    return flags;
  }
  for (const part of value.split(",")) {
    const [surfaceRaw, sourceRaw] = part.split(":").map((x) => x.trim());
    const surface = surfaceRaw as FieldEngineReadSurface;
    const source = sourceRaw as FieldEngineReadSource;
    if (
      FIELD_ENGINE_READ_SURFACES.includes(surface) &&
      (source === "a" || source === "b")
    ) {
      flags[surface] = source;
    }
  }
  return flags;
}

/** Pure helper — which source is active for a surface, given pre-parsed flags. */
export function readSourceForSurface(
  flags: FieldEngineReadSourceFlags,
  surface: FieldEngineReadSurface,
): FieldEngineReadSource {
  return flags[surface];
}

/** True when the surface is flipped to B (canonical). Pure. */
export function surfaceReadsCanonical(
  flags: FieldEngineReadSourceFlags,
  surface: FieldEngineReadSource extends never ? never : FieldEngineReadSurface,
): boolean {
  return flags[surface] === "b";
}
