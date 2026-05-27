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
//   R1 — Legacy `card_visible` / `directory_filter_visible` flags are ANDed
//        with the canonical resolver decision, never replaced by it. Phase 2
//        added canonical `show_in_directory_filter` / `show_in_directory_card`
//        / `show_in_public_profile_sidebar` columns; the AND-ing stays as a
//        safety net during Phase 2 → Phase 5 transition, and is collapsed
//        to canonical-only in Sub-Task 5.
//   R4 — `gender` is column-backed on `talent_profiles`, marked
//        `internal_only=true` in legacy field_definitions. Phase 2 added a
//        canonical `identity.gender` row so the resolver can decide;
//        GENDER_ALLOW_LIST_KEYS still bypasses the legacy `internal_only`
//        guard at step 1 of the filter helper (the canonical row carries
//        the real safety floor via effectiveFieldVisibility).
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
// `gender` is column-backed on `talent_profiles.gender`. Its legacy
// field_definitions row carries `internal_only=true` (so the anon RLS policy
// hides it); the service-role read in fetchDirectoryFilterCatalogRows
// surfaces it for the filter sidebar anyway. Without this explicit
// allow-list the chip would vanish at step 1 of the filter helper, since
// the legacy `internal_only` check fires before the canonical decision.
// (Phase 1.1 doc §5 R4.)
//
// Phase 2 note: the canonical `identity.gender` row added in Sub-Task 0.5
// carries the real safety floor (admin_only=false, is_sensitive=false,
// default_visibility=['public','agency']). After Sub-Task 5 the legacy
// `internal_only` flag is no longer consulted; the allow-list becomes
// dead code at that point — leaving the constant in place keeps the
// decision flow readable.
//
// Scope: filter sidebar only. Card + sidebar helpers don't apply the
// allow-list because gender is rendered as a single column-backed value
// (chip on directory cards via talent_profiles.gender), not as a section.
const GENDER_ALLOW_LIST_KEYS = new Set<string>(["gender"]);

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

// ─── Synthetic visibility (C2 hybrid) ────────────────────────────────────────
//
// Non-bridged keys (fit_labels, skills, language, talent_type, location, etc.)
// have no canonical profile_field_definitions row. This constructs a synthetic
// FieldDefVisibilityInput from legacy flags and routes it through the shared
// effectiveFieldVisibility primitive so the platform floor checks apply.
//
// Phase 2 collapse target: when canonical rows are backfilled for these keys,
// callers of this function collapse to the bridged-key Map path. Override-row
// carry-over per tenant MUST happen before disabling this branch (R8).
//
// When public_visible is absent (the filter query omits it), we cannot run
// the synthetic check; fall back to returning true — this matches the
// pre-migration behavior where non-bridged directory_filter_visible=true rows
// were allowed through unconditionally.
function _syntheticLegacyVisibility(field: {
  public_visible?: boolean | null;
  internal_only?: boolean | null;
}): boolean {
  if (field.internal_only === true) return false;
  if (field.public_visible == null) {
    // public_visible not available in this row shape — trust the upstream
    // directory_filter_visible / card_visible / profile_visible gate that the
    // call site already checked. Matches legacy behavior for non-bridged keys.
    return true;
  }
  const vis = effectiveFieldVisibility({
    default_visibility: field.public_visible ? ["public"] : [],
    show_in_public: field.public_visible,
    admin_only: false,
    is_sensitive: field.internal_only ?? false,
  });
  return vis === "public";
}

// ─── Three public helpers ─────────────────────────────────────────────────────

/**
 * "Is this legacy field_definitions row allowed to appear in the directory
 * FILTER SIDEBAR for a public viewer on this tenant?"
 *
 * Decision flow (in order):
 *   1. Base guards: active + non-archived.
 *   2. Legacy `directory_filter_visible === true` must hold (R1 — the legacy
 *      flag is preserved as a gate on top of, not replaced by, the canonical
 *      decision; Sub-Task 5 removes this gate).
 *   3. Gender allow-list (R4): `gender` legacy row carries internal_only=true.
 *      Phase 2 added a canonical `identity.gender` row so the bridged path
 *      decides; the allow-list short-circuits step 3 so the chip never
 *      vanishes during the Phase 2 → Phase 5 transition.
 *   4. Bridged keys (OLD_TO_NEW_KEY + TAXONOMY_SECTION_CANONICAL_KEYS): AND
 *      legacy flag (step 2) with canonical
 *      effectiveFieldVisibility ∧ show_in_directory_filter (after tenant
 *      override).
 *   5. Truly non-bridged keys (language, talent_type, location): synthetic
 *      effectiveFieldVisibility from legacy flags. After the 7 section-gate
 *      keys moved to canonical in Phase 2, this branch only handles these
 *      three remaining legacy-only keys.
 */
export async function isResolvedFieldVisibleInDirectoryFilter(
  field: {
    key: string;
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
  // 1. Base guards (invariant 4)
  if (!field.active || field.archived_at != null) return false;
  // 2. Legacy filter flag (R1 AND-ing)
  if (field.directory_filter_visible !== true) return false;

  // 3. R4: gender allow-list — column-backed, internal_only=true, not bridged.
  //    directory_filter_visible=true (checked above) is the sole gate.
  if (GENDER_ALLOW_LIST_KEYS.has(field.key)) return true;

  // 4. Bridged keys (value-mirror 17 + section-gate 7): AND canonical decision
  //    with the already-satisfied legacy flag. Phase 2 uses the new canonical
  //    `show_in_directory_filter` column (post tenant override); the
  //    `dec.isPublic` AND remains the safety floor.
  if (bridgedCanonicalKey(field.key)) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false; // canonical def missing → safe-fail
    return dec.isPublic && dec.showInDirectoryFilter;
  }

  // 5. Non-bridged (language, talent_type, location): synthetic C2 path.
  //    After Phase 2 the seven section-gate keys (fit_labels, skills,
  //    languages, industries, event_types, tags, gender) reach step 4.
  return _syntheticLegacyVisibility(field);
}

/**
 * "Is this legacy field_definitions row allowed to appear as a DIRECTORY CARD
 * trait line for a public viewer on this tenant?"
 *
 * Decision flow (in order):
 *   1. Base guards: active + non-archived + !internal_only (invariants 4 + 5).
 *   2. Legacy `public_visible`, `profile_visible`, `card_visible` must all be
 *      true (R1 — the canonical decision ANDs with these, never replaces them;
 *      Sub-Task 5 removes the legacy gate so canonical alone decides).
 *   3. Bridged keys (OLD_TO_NEW_KEY + TAXONOMY_SECTION_CANONICAL_KEYS): AND
 *      canonical effectiveFieldVisibility ∧ show_in_directory_card (after
 *      tenant override).
 *   4. Non-bridged (language, talent_type, location): synthetic C2 path.
 *
 * Note: `gender` legacy row has internal_only=true → blocked at step 1.
 * Gender is a filter chip, never a card trait.
 */
export async function isResolvedFieldVisibleOnDirectoryCard(
  field: {
    key: string;
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
  // 1. Base guards (invariants 4 + 5)
  if (!field.active || field.archived_at != null) return false;
  if (field.internal_only) return false;
  // 2. Legacy surface flags (R1 AND-ing)
  if (!field.public_visible || !field.profile_visible || !field.card_visible) return false;

  // 3. Bridged keys (value-mirror 17 + section-gate 7): canonical decision
  //    ANDs with the legacy flags already satisfied above. Phase 2 uses
  //    the new canonical `show_in_directory_card` column.
  if (bridgedCanonicalKey(field.key)) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false;
    return dec.isPublic && dec.showInDirectoryCard;
  }

  // 4. Non-bridged: synthetic C2 path (Phase 2 collapse target).
  return _syntheticLegacyVisibility(field);
}

/**
 * "Is this legacy field_definitions row allowed to appear as a SIDEBAR SECTION
 * on the public profile page /t/[profileCode] for a public viewer on this
 * tenant?"
 *
 * Covers the six taxonomy section gates used by Lane B:
 *   fit_labels, skills, languages, industries, event_types, tags.
 * Phase 2 (Sub-Task 0.5) added canonical rows for all six, so they take
 * the bridged path at step 3. After Sub-Task 5 removes the legacy gate at
 * step 2, the helper runs on canonical alone.
 *
 * Decision flow (in order):
 *   1. Base guards: active + non-archived + !internal_only (invariants 4 + 5).
 *   2. Legacy `public_visible` + `profile_visible` must be true (R1).
 *   3. Bridged keys: AND canonical effectiveFieldVisibility ∧
 *      show_in_public_profile_sidebar (after tenant override). Sidebar does
 *      NOT require show_in_directory — it's a public profile surface, not
 *      a directory surface.
 *   4. Non-bridged keys: synthetic C2 path (legacy-only).
 */
export async function isResolvedFieldVisibleInPublicProfileSidebar(
  field: {
    key: string;
    active: boolean;
    archived_at: string | null;
    tenant_id: string | null;
    public_visible: boolean;
    profile_visible: boolean;
    internal_only: boolean;
  },
  ctx: PublicSurfaceContext,
): Promise<boolean> {
  // 1. Base guards (invariants 4 + 5)
  if (!field.active || field.archived_at != null) return false;
  if (field.internal_only) return false;
  // 2. Legacy profile flags (R1 AND-ing)
  if (!field.public_visible || !field.profile_visible) return false;

  // 3. Bridged keys (value-mirror 17 + section-gate 7): canonical decision
  //    using the new `show_in_public_profile_sidebar` column (Phase 2).
  //    show_in_directory is NOT required — sidebar is a profile surface,
  //    not a directory surface.
  if (bridgedCanonicalKey(field.key)) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false;
    return dec.isPublic && dec.showInPublicProfileSidebar;
  }

  // 4. Non-bridged: synthetic C2 path (Phase 2 collapse target).
  return _syntheticLegacyVisibility(field);
}
