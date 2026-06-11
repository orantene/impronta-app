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
 * The System-A reader surfaces repointed in Phase 2, one task each:
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
 *   directory_search — T2.5a — the legacy directory text-search `field_values`
 *     reader. read-source-directory-search.ts (called from
 *     directory-search-legacy.ts).
 *   directory_card_values — T2.5a — the per-profile directory card VALUE reader
 *     (`field_values` by card def-ids). read-source-directory-card-values.ts
 *     (called from fetch-directory-page.ts).
 *   translation      — T2.5b — translation-center i18n adapter value reads
 *     (field-value-text-i18n-adapter.ts). BLOCKED on B schema: B has no
 *     `value_i18n` column yet; defaults to `a`. Seam is wired so the flip
 *     to `b` requires only a schema addition + B-reader completion.
 */
export type FieldEngineReadSurface =
  | "directory_facets"
  | "public_sidebar"
  | "dashboard_nav"
  | "directory_cards"
  | "ai_search_doc"
  | "directory_search"
  | "directory_card_values"
  | "translation";

export const FIELD_ENGINE_READ_SURFACES: readonly FieldEngineReadSurface[] = [
  "directory_facets",
  "public_sidebar",
  "dashboard_nav",
  "directory_cards",
  "ai_search_doc",
  "directory_search",
  "directory_card_values",
  "translation",
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
  // T2.4 ACTIVATES the directory card scalar-metadata catalog repoint: the card
  // attribute catalog (`directory-card-display-catalog.ts`) now defaults to
  // canonical System B (`profile_field_definitions`), via the same
  // `isResolvedFieldVisibleOnDirectoryCard` resolver — proven byte-identical to
  // System A on all 3 card-visible fields across all 101 talents. `fit_labels`
  // `label_es` was corrected in B to "Etiquetas de ajuste" (migration
  // 20260611180515), so the ES card label is now byte-identical to A.
  // `identity.gender` (B-only) is excluded from readB output (column-backed, no
  // card-builder path). Kill switch: FIELD_ENGINE_READ_SOURCE=directory_cards:a.
  directory_cards: "b",
  // T2.5 ACTIVATES the AI search-document field-value reader repoint: the
  // `rebuildAiSearchDocument` + `loadAiSearchDocumentDebug` field-value reads now
  // default to canonical System B (`talent_profile_field_values` joined to
  // `profile_field_definitions`), via the `readAiSearchDocFields` seam. Documented
  // non-regressive diffs: (1) instagram_url/tiktok_url/youtube_url excluded (no
  // canonical B rows; demo handles, low-signal for embedding retrieval);
  // (2) value vocab — B labels ("Dark brown") beat A slugs ("dark_brown") for
  // embedding; (3) 5 field-header renames; toggle fields (travel.willing) emit
  // Yes/No by honoring meta.kind. Kill switch:
  // FIELD_ENGINE_READ_SOURCE=ai_search_doc:a (or =a) reverts to System A; a
  // B-read that throws also safe-falls-back to A at runtime.
  ai_search_doc: "b",
  // T2.5a (this PR) ACTIVATES the legacy directory TEXT-SEARCH value-store
  // repoint: the `field_values.value_text` ILIKE leg of the legacy directory
  // search now defaults to canonical System B (`talent_profile_field_values`),
  // via read-source-directory-search.ts. The 13 BRIDGED searchable keys read B;
  // the 3 UN-BRIDGED social-URL keys (instagram_url/tiktok_url/youtube_url —
  // no canonical B def) keep reading A so search coverage stays byte-identical
  // (proven 0/0 symmetric-diff on 14 sample queries incl. the social-URL ones).
  // display_name/short_bio carry NO field_values data (covered by the
  // talent_profiles column search in the same legacy query). Kill switch:
  // FIELD_ENGINE_READ_SOURCE=directory_search:a (or =a); a B-read that throws
  // also safe-falls-back to A at runtime.
  directory_search: "b",
  // T2.5a (this PR) ACTIVATES the per-profile directory CARD VALUE repoint: the
  // `field_values` read by card def-ids (rendered into card_attributes) now
  // defaults to canonical System B, via read-source-directory-card-values.ts.
  // The reader maps each card def's A `key` → B `field_key` (legacy-mirror
  // bridge) and reads BRIDGED SCALAR keys from `talent_profile_field_values`,
  // projecting back into the SAME `FieldValueRow` shape keyed by the A def-id so
  // `buildCardAttributesForProfile` is unchanged. Taxonomy/location card defs
  // (talent_type, industries, location) are NOT bridged scalars and carry ZERO
  // field_values scalar data under A (proven) — they render from
  // talent_profile_taxonomy assignments either way, so the card output is
  // byte-identical. Kill switch: FIELD_ENGINE_READ_SOURCE=directory_card_values:a
  // (or =a); a B-read that throws also safe-falls-back to A at runtime.
  directory_card_values: "b",
  // T2.5b — Translation i18n adapter (field-value-text-i18n-adapter.ts).
  // BLOCKED at `a`: the B-repoint requires `value_i18n` to be added to
  // `talent_profile_field_values` first (it currently lives only in the legacy
  // `field_values.value_i18n` column). Until that schema addition lands, the
  // B-reader would see every translation unit as health="missing" (no i18n
  // column to read), which is REGRESSIVE. The seam is wired (adapter calls
  // readFieldSurface("translation", ...)) so the flip to `b` requires only:
  //   1. DB: ALTER TABLE talent_profile_field_values ADD COLUMN value_i18n jsonb;
  //   2. Code: complete the B-reader in read-source-translation-i18n.ts to join
  //            value_i18n from the new column; update default here to "b".
  //   3. Write path: admin-translation-quick-edit.ts must also write to the B
  //            column so translated text survives the mirror-stop (T2.6).
  // Kill switch: n/a (already `a`). Setting `translation:b` before the schema
  // migration lands is a no-op fallback — the B-reader throws → falls back to A.
  translation: "a",
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
