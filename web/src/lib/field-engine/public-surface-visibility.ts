// src/lib/field-engine/public-surface-visibility.ts
//
// Three helpers that answer "is this legacy field_definitions row visible on
// the requested public surface for this tenant?". Used by:
//   Lane A — directory filter sidebar + directory cards
//   Lane B — public profile sidebar /t/[profileCode]
//
// Memoization — two layers:
//   1. next/cache unstable_cache (cross-request, 120 s) tagged with BOTH
//      CACHE_TAG_FIELD_CATALOG and CACHE_TAG_DIRECTORY so admin changes to
//      the canonical catalog OR directory settings both invalidate it (R6).
//   2. React cache() (per-request dedup) sits on top of unstable_cache so
//      iterating 30 filter rows in one render incurs only one cache machinery
//      entry + one Map construction, not 30 (Q3). Keyed on tenantId — the
//      caller's supabase client is not used as a key because (a) service role
//      is created internally and (b) client instances are not stable across
//      concurrent server components (WeakMap-per-client rejected for this
//      reason).
//
// Phase 1.x risk mitigations:
//   R1 — RESOLVED (Sub-Task 5, 2026-05-27): the legacy `card_visible` /
//        `directory_filter_visible` / `profile_visible` AND-ing was removed.
//        Canonical `show_in_directory_filter` / `show_in_directory_card` /
//        `show_in_public_profile_sidebar` carry the equivalent decision
//        after the Sub-Task 0 backfill, and per-tenant overrides flow
//        through workspace_profile_field_settings.*_override.
//   R4 — `gender` is column-backed on `talent_profiles`. Phase 2 added a
//        canonical `identity.gender` row; the bridged path decides.
//        GENDER_ALLOW_LIST_KEYS now documents that fact rather than gating
//        anything (legacy internal_only is no longer consulted).
//   R6 — Cache tags confirmed: CACHE_TAG_FIELD_CATALOG + CACHE_TAG_DIRECTORY.
//
// Phase 2 (2026-05-27):
//   • Bridged-keys map widened to include the seven taxonomy section gates
//     (fit_labels, skills, languages, industries, event_types, tags, gender).
//     `gender` → canonical `identity.gender`; the other six are
//     self-mapping (canonical key == legacy key).
//   • Each decision now carries the three sub-surface canonical flags so the
//     filter / card / sidebar helpers can gate on the right column per
//     surface (replacing the coarser canonical `show_in_directory`).
//   • Tenant overrides for the three sub-surfaces are read from
//     workspace_profile_field_settings.show_in_*_override.
//
// Tenant-disabled taxonomy TERMS (per-row, not per-key) is handled by the
// existing readers — `taxonomy-tenant-safety.ts`, `taxonomy-filters.ts`,
// and `talent-taxonomy-service.ts` — and propagates through value-presence,
// not through these visibility helpers.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveFieldVisibility } from "@/lib/field-engine/effective-visibility";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isFacetRelevantToTenantRoster } from "@/lib/field-engine/directory-facet-category-gate";

/** Common context passed to all three helpers. tenantId null = hub surface. */
export interface PublicSurfaceContext {
  /**
   * Caller's Supabase client. Reserved for future use (e.g. tenant-scoped
   * reads in Lane B); the batch canonical loader uses service role internally
   * so this client is not used for the catalog fetch.
   */
  supabase: SupabaseClient;
  /** Scoping tenant. Null = hub / cross-agency directory. */
  tenantId: string | null;
}

// ─── Gender allow-list (R4) ───────────────────────────────────────────────────
//
// `gender` legacy field_definitions row carries `internal_only=true` (so the
// anon RLS policy hides it). Even after Sub-Task 5 removes the legacy
// internal_only pre-check, this allow-list documents which keys are
// column-backed and routed through canonical without further legacy
// inspection.
//
// Phase 2 note: the canonical `identity.gender` row added in Sub-Task 0.5
// carries the real safety floor (admin_only=false, is_sensitive=false,
// default_visibility=['public','agency']). The directory_filter chip is
// fed from talent_profiles.gender (not field_values), but visibility is
// canonical alone. Scope: filter sidebar only.
const GENDER_ALLOW_LIST_KEYS = new Set<string>(["gender"]);

// ─── Sub-Task 5: legacy-only filter chips ────────────────────────────────────
//
// Two keys appear as directory filter chips today but have no canonical
// profile_field_definitions row:
//   - talent_type  — top-bar facet; sourced from talent_profile_taxonomy
//     primary. buildDirectoryFilterBlocks already strips it from the
//     sidebar render so this allow-list is defence-in-depth.
//   - location     — value_type=location row; sourced from
//     talent_profiles.residence_city_id + locations lookup. No per-field-
//     value concept, so no canonical equivalent.
//
// After Sub-Task 5 removes _syntheticLegacyVisibility, these two keys
// would otherwise return false from the filter helper. The allow-list
// preserves their existing public visibility on the directory filter
// sidebar; cards + sidebar always returned false for them anyway (they
// are filter-only).
//
// Phase 3 TODO: add canonical rows for talent_type + location and remove
// this allow-list. They each have a clear semantic equivalent.
const LEGACY_ONLY_DIRECTORY_FILTER_KEYS = new Set<string>([
  "talent_type",
  "location",
]);

// ─── Phase 2: section-gate canonical keys ────────────────────────────────────
//
// Seven legacy keys whose canonical row was added in Sub-Task 0.5. Six are
// self-mapping (canonical key == legacy key); only `gender` is namespaced
// to `identity.gender` to live in the canonical identity section. Held
// separately from OLD_TO_NEW_KEY because OLD_TO_NEW_KEY is the *value*
// mirror map — extending it would cause the legacy-mirror to spuriously
// try to mirror these section-gate value sets between two tables. Visibility
// is a different concern, so it gets its own bridge.
const TAXONOMY_SECTION_CANONICAL_KEYS: Record<string, string> = {
  fit_labels: "fit_labels",
  industries: "industries",
  event_types: "event_types",
  tags: "tags",
  skills: "skills",
  languages: "languages",
  gender: "identity.gender",
};

/** Combined legacy → canonical map for the public-surface visibility
 *  decision. Union of value-bridge OLD_TO_NEW_KEY (17 keys, P5-γ) +
 *  the 7 section-gate keys (Phase 2 Sub-Task 0.5). */
function bridgedCanonicalKey(legacyKey: string): string | undefined {
  return OLD_TO_NEW_KEY[legacyKey] ?? TAXONOMY_SECTION_CANONICAL_KEYS[legacyKey];
}

// ─── Batch loader types ───────────────────────────────────────────────────────

type CanonicalDefDecisionRow = {
  id: string;
  field_key: string;
  default_visibility: string[] | null;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  show_in_directory: boolean | null;
  /** Phase 2 sub-surface flags — backfilled from legacy in migration
   *  20260527063534. Null-tolerant in the row type for forward-compat
   *  with older schemas; the helpers coerce missing to `false`. */
  show_in_directory_filter: boolean | null;
  show_in_directory_card: boolean | null;
  show_in_public_profile_sidebar: boolean | null;
  deprecated_at: string | null;
};

type TenantOverrideDecisionRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  show_in_public_override: boolean | null;
  show_in_directory_override: boolean | null;
  admin_only_override: boolean | null;
  default_visibility_override: string[] | null;
  /** Phase 2 tenant overrides for the three sub-surfaces (nullable =
   *  inherit canonical). */
  show_in_directory_filter_override: boolean | null;
  show_in_directory_card_override: boolean | null;
  show_in_public_profile_sidebar_override: boolean | null;
};

/** Per-legacy-key canonical decision (JSON-safe for unstable_cache storage).
 *  Phase 2: three sub-surface flags carry post-override booleans (canonical
 *  ∧ tenant override). `isPublic` is the safety-floor decision from
 *  effectiveFieldVisibility — every helper ANDs on it as the trust floor. */
type BridgedKeyDecision = {
  /** true when effectiveFieldVisibility resolves to "public" for this def. */
  isPublic: boolean;
  /** Phase 1 coarser flag, kept for back-compat with the filter helper's
   *  legacy AND-ing until Sub-Task 5 collapses it. */
  showInDirectory: boolean;
  /** Phase 2: canonical show_in_directory_filter ∧ tenant override. */
  showInDirectoryFilter: boolean;
  /** Phase 2: canonical show_in_directory_card ∧ tenant override. */
  showInDirectoryCard: boolean;
  /** Phase 2: canonical show_in_public_profile_sidebar ∧ tenant override. */
  showInPublicProfileSidebar: boolean;
};

/** Plain Record of oldKey → decision; JSON-serializable for unstable_cache. */
type BridgedKeyDecisions = Record<string, BridgedKeyDecision>;

// ─── Batch canonical loader (uncached) ───────────────────────────────────────

async function _loadBridgedKeyDecisionsUncached(
  tenantId: string | null,
): Promise<BridgedKeyDecisions> {
  const svc = createServiceRoleClient();
  // No service client → safe-fail: callers fall through to legacy flags.
  if (!svc) return {};

  // Phase 2: query canonical for the value-bridge keys AND the seven
  // section-gate keys (Sub-Task 0.5). The union is deduped because nothing
  // appears in both maps today, but the Set guards against future overlap.
  const canonicalKeys = [
    ...new Set([
      ...Object.values(OLD_TO_NEW_KEY),
      ...Object.values(TAXONOMY_SECTION_CANONICAL_KEYS),
    ]),
  ];

  const { data: defs, error: defsErr } = await svc
    .from("profile_field_definitions")
    .select(
      "id, field_key, default_visibility, admin_only, is_sensitive, show_in_public, show_in_directory, show_in_directory_filter, show_in_directory_card, show_in_public_profile_sidebar, deprecated_at",
    )
    .in("field_key", canonicalKeys);

  if (defsErr || !defs) return {};

  const defRows = defs as CanonicalDefDecisionRow[];
  const overrideMap = new Map<string, TenantOverrideDecisionRow>();

  if (tenantId && defRows.length > 0) {
    const { data: overrides } = await svc
      .from("workspace_profile_field_settings")
      .select(
        "field_definition_id, enabled_override, show_in_public_override, show_in_directory_override, admin_only_override, default_visibility_override, show_in_directory_filter_override, show_in_directory_card_override, show_in_public_profile_sidebar_override",
      )
      .eq("tenant_id", tenantId)
      .in(
        "field_definition_id",
        defRows.map((r) => r.id),
      );
    for (const row of (overrides ?? []) as TenantOverrideDecisionRow[]) {
      overrideMap.set(row.field_definition_id, row);
    }
  }

  // Build canonicalKey → decision using the shared effectiveFieldVisibility
  // primitive (same call as the per-talent resolver, just without a talent).
  const byCanonicalKey = new Map<string, BridgedKeyDecision>();
  for (const def of defRows) {
    if (def.deprecated_at) continue;
    const override = overrideMap.get(def.id) ?? null;
    if (override?.enabled_override === false) continue;

    const visibility = effectiveFieldVisibility(
      {
        default_visibility: def.default_visibility,
        admin_only: def.admin_only,
        is_sensitive: def.is_sensitive,
        show_in_public: def.show_in_public,
      },
      override
        ? {
            show_in_public_override: override.show_in_public_override,
            admin_only_override: override.admin_only_override,
            default_visibility_override: override.default_visibility_override,
          }
        : null,
    );

    // Sub-surface decisions — tenant override (when present) wins over
    // canonical default. Null override (the common case) inherits canonical.
    const showInDirectory =
      override?.show_in_directory_override ?? def.show_in_directory ?? false;
    const showInDirectoryFilter =
      override?.show_in_directory_filter_override
      ?? def.show_in_directory_filter
      ?? false;
    const showInDirectoryCard =
      override?.show_in_directory_card_override
      ?? def.show_in_directory_card
      ?? false;
    const showInPublicProfileSidebar =
      override?.show_in_public_profile_sidebar_override
      ?? def.show_in_public_profile_sidebar
      ?? false;

    byCanonicalKey.set(def.field_key, {
      isPublic: visibility === "public",
      showInDirectory: Boolean(showInDirectory),
      showInDirectoryFilter: Boolean(showInDirectoryFilter),
      showInDirectoryCard: Boolean(showInDirectoryCard),
      showInPublicProfileSidebar: Boolean(showInPublicProfileSidebar),
    });
  }

  // Translate canonicalKey → legacyKey, walking BOTH bridge maps (value mirror
  // + section gates). A canonical key that backs multiple legacy keys would
  // appear under each legacy key with the same decision (no such case today).
  const result: BridgedKeyDecisions = {};
  for (const [legacyKey, canonicalKey] of Object.entries(OLD_TO_NEW_KEY)) {
    const dec = byCanonicalKey.get(canonicalKey);
    if (dec) result[legacyKey] = dec;
  }
  for (const [legacyKey, canonicalKey] of Object.entries(
    TAXONOMY_SECTION_CANONICAL_KEYS,
  )) {
    const dec = byCanonicalKey.get(canonicalKey);
    if (dec) result[legacyKey] = dec;
  }
  return result;
}

// ─── Layer 1: cross-request cache (R6) ───────────────────────────────────────
//
// unstable_cache with BOTH tags so either a field-catalog admin action OR a
// directory setting change busts this entry. 120 s TTL matches the tenant
// field catalog. Returns a plain BridgedKeyDecisions Record (JSON-safe).

async function _getCachedBridgedDecisions(
  tenantId: string | null,
): Promise<BridgedKeyDecisions> {
  return unstable_cache(
    () => _loadBridgedKeyDecisionsUncached(tenantId),
    ["public-surface-canonical-decisions", "v1", tenantId ?? "__null__"],
    { tags: [CACHE_TAG_FIELD_CATALOG, CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}

// ─── Layer 2: per-request dedup (Q3 — React cache()) ─────────────────────────
//
// Converts the JSON-safe BridgedKeyDecisions Record back to a Map for O(1)
// per-row lookups, and deduplicates the unstable_cache entry so iterating
// the filter or card catalog rows in one render pass calls the cache machinery
// once, not once-per-row.

const _getDecisionsForTenant = cache(
  async (tenantId: string | null): Promise<Map<string, BridgedKeyDecision>> => {
    const record = await _getCachedBridgedDecisions(tenantId);
    return new Map(Object.entries(record));
  },
);

// Sub-Task 5 (2026-05-27): _syntheticLegacyVisibility was removed. The
// Phase 1 C2 hybrid path for non-bridged keys is no longer needed — the
// seven taxonomy section gates (fit_labels, skills, languages, industries,
// event_types, tags, gender→identity.gender) gained canonical rows in
// Sub-Task 0.5 and now route through the bridged-canonical path. The two
// remaining legacy-only keys (talent_type, location) are handled by the
// LEGACY_ONLY_DIRECTORY_FILTER_KEYS allow-list inside the filter helper.
//
// TODO (Phase 3, after Sub-Task 5's 7-day quiet window):
//   - Delete web/src/lib/directory/legacy-directory-policy.ts (the bridge
//     this module replaced).
//   - Delete web/src/lib/public-profile-field-visibility.ts (Lane B replacement
//     already used here).
//   - Add canonical rows for talent_type + location → drop
//     LEGACY_ONLY_DIRECTORY_FILTER_KEYS.
//   - Drop `directory_filter_visible`, `card_visible`, `profile_visible`
//     from the row shape parameters since none of the helpers consult them.

// ─── Three public helpers ─────────────────────────────────────────────────────

/**
 * "Is this legacy field_definitions row allowed to appear in the directory
 * FILTER SIDEBAR for a public viewer on this tenant?"
 *
 * Decision flow (canonical-alone post-Sub-Task 5):
 *   1. Base guards: active + non-archived.
 *   2. Gender allow-list (R4): legacy `gender` ↔ canonical `identity.gender`.
 *      Routes through canonical at step 4 just like any bridged key; this
 *      block is documentation, kept for readability.
 *   3. Legacy-only filter chips (talent_type, location): defence-in-depth
 *      allow-list. These have no canonical row; field_definitions.
 *      directory_filter_visible=true is the sole gate. See Phase 3 TODO
 *      in the dead-code block above.
 *   4. Bridged keys (OLD_TO_NEW_KEY + TAXONOMY_SECTION_CANONICAL_KEYS):
 *      canonical effectiveFieldVisibility ∧ show_in_directory_filter
 *      (after tenant override). isPublic remains the trust-floor AND.
 *
 * Sub-Task 5 (2026-05-27): legacy `directory_filter_visible` AND-ing
 * removed — the canonical column carries the same decision after the
 * Sub-Task 0 backfill, and tenant overrides now flow through
 * workspace_profile_field_settings.show_in_directory_filter_override.
 */
export async function isResolvedFieldVisibleInDirectoryFilter(
  field: {
    key: string;
    /** Legacy column — retained on the row shape for back-compat with
     *  call sites that pass it. Sub-Task 5 stopped consulting it; Phase 3
     *  TODO drops it from the type when call sites stop passing it. */
    directory_filter_visible: boolean | null;
    active: boolean;
    archived_at: string | null;
    tenant_id: string | null;
    public_visible?: boolean | null;
    profile_visible?: boolean | null;
    internal_only?: boolean | null;
  },
  ctx: PublicSurfaceContext,
): Promise<boolean> {
  // 1. Base guards.
  if (!field.active || field.archived_at != null) return false;

  // 2. Legacy-only filter chips with no canonical row. directory_filter_visible
  //    is the sole gate for these (defence-in-depth — buildDirectoryFilterBlocks
  //    handles top-bar talent_type extraction separately).
  if (LEGACY_ONLY_DIRECTORY_FILTER_KEYS.has(field.key)) {
    return field.directory_filter_visible === true;
  }

  // 3. Bridged keys (value-mirror 17 + section-gate 7, including
  //    gender → identity.gender).
  if (bridgedCanonicalKey(field.key) || GENDER_ALLOW_LIST_KEYS.has(field.key)) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false; // canonical def missing → safe-fail
    if (!dec.isPublic || !dec.showInDirectoryFilter) return false;
    // 4. Roster relevance. show_in_directory_filter is a single GLOBAL flag,
    //    so without this an agency of chefs and DJs still rendered the
    //    casting facets (dress size, body type, hair colour…) that the
    //    profile editor already refuses to show them. Fails open.
    return isFacetRelevantToTenantRoster(
      bridgedCanonicalKey(field.key) ?? field.key,
      ctx.tenantId,
    );
  }

  // No canonical, not allow-listed → not visible. Phase 3 audits the legacy
  // row population to confirm no other keys reach this branch.
  return false;
}

/**
 * "Is this legacy field_definitions row allowed to appear as a DIRECTORY CARD
 * trait line for a public viewer on this tenant?"
 *
 * Decision flow (canonical-alone post-Sub-Task 5):
 *   1. Base guards: active + non-archived.
 *   2. Bridged keys: canonical effectiveFieldVisibility ∧
 *      show_in_directory_card (after tenant override).
 *
 * Sub-Task 5 (2026-05-27): legacy `public_visible` / `profile_visible` /
 * `card_visible` / `internal_only` pre-checks removed — canonical
 * show_in_directory_card carries the equivalent decision after Sub-Task 0
 * backfill, and canonical admin_only / is_sensitive carry the
 * `internal_only` floor (via effectiveFieldVisibility).
 */
export async function isResolvedFieldVisibleOnDirectoryCard(
  field: {
    key: string;
    /** Legacy column — Sub-Task 5 stopped consulting. Kept on the row
     *  shape for back-compat; Phase 3 TODO drops it from the type. */
    card_visible: boolean;
    active: boolean;
    archived_at: string | null;
    tenant_id: string | null;
    public_visible: boolean;
    profile_visible: boolean;
    internal_only: boolean;
  },
  ctx: PublicSurfaceContext,
): Promise<boolean> {
  // 1. Base guards.
  if (!field.active || field.archived_at != null) return false;

  // 2. Bridged keys (value-mirror 17 + section-gate 7). `gender` is a
  //    filter chip only — canonical identity.gender.show_in_directory_card
  //    is true, but card display also requires the talent's gender column
  //    to be set; that's handled upstream by the card DTO, not here.
  if (bridgedCanonicalKey(field.key)) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false;
    if (!dec.isPublic || !dec.showInDirectoryCard) return false;
    // 3. Roster relevance — same global-flag problem as the filter surface.
    //    A card trait line for a category this tenant does not represent is
    //    dead space on the conversion asset. Fails open.
    return isFacetRelevantToTenantRoster(
      bridgedCanonicalKey(field.key) ?? field.key,
      ctx.tenantId,
    );
  }

  // Non-bridged keys never reach cards today (talent_type/location are
  // filter-only). Safe-fail to false.
  return false;
}

/**
 * "Is this legacy field_definitions row allowed to appear as a SIDEBAR SECTION
 * on the public profile page /t/[profileCode] for a public viewer on this
 * tenant?"
 *
 * Covers the six taxonomy section gates used by Lane B (fit_labels, skills,
 * languages, industries, event_types, tags). Phase 2 (Sub-Task 0.5) added
 * canonical rows for all six, so they reach the bridged path here.
 *
 * Decision flow (canonical-alone post-Sub-Task 5):
 *   1. Base guards: active + non-archived.
 *   2. Bridged keys: canonical effectiveFieldVisibility ∧
 *      show_in_public_profile_sidebar (after tenant override). Sidebar does
 *      NOT require show_in_directory — it's a public profile surface, not
 *      a directory surface.
 *
 * Sub-Task 5 (2026-05-27): legacy `public_visible` / `profile_visible` /
 * `internal_only` pre-checks removed; canonical carries the equivalent
 * decision after Sub-Task 0 backfill.
 */
export async function isResolvedFieldVisibleInPublicProfileSidebar(
  field: {
    key: string;
    active: boolean;
    archived_at: string | null;
    tenant_id: string | null;
    /** Legacy columns — Sub-Task 5 stopped consulting. Kept on the row
     *  shape for back-compat; Phase 3 TODO drops them from the type. */
    public_visible: boolean;
    profile_visible: boolean;
    internal_only: boolean;
  },
  ctx: PublicSurfaceContext,
): Promise<boolean> {
  // 1. Base guards.
  if (!field.active || field.archived_at != null) return false;

  // 2. Bridged keys (value-mirror 17 + section-gate 7).
  if (bridgedCanonicalKey(field.key)) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false;
    return dec.isPublic && dec.showInPublicProfileSidebar;
  }

  // No canonical → not visible. talent_type/location never render in the
  // sidebar; safe-fail.
  return false;
}
