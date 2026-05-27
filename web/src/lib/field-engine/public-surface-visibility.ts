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
//        will add canonical `show_in_card` / `show_in_directory_filter`
//        columns and collapse the AND to canonical-only.
//   R4 — `gender` is column-backed on `talent_profiles`, marked
//        `internal_only=true` in field_definitions, and absent from
//        OLD_TO_NEW_KEY. Permitted via GENDER_ALLOW_LIST_KEYS so the filter
//        chip never silently vanishes. See §5 R4 of the 1.1 delta doc.
//   R6 — Cache tags confirmed: CACHE_TAG_FIELD_CATALOG + CACHE_TAG_DIRECTORY.
//
// Non-bridged keys (fit_labels, skills, languages, industries, event_types,
// tags, language, talent_type, location, gender) have no canonical row in
// profile_field_definitions today. They go through the C2 hybrid path
// (_syntheticLegacyVisibility) as recommended in Phase 1.1 doc §2 "C3".
// Phase 2 will backfill canonical rows and collapse to the bridged-key path.
// NOTE — Phase 2 MUST carry over any per-tenant override rows before disabling
// the synthetic fallback to avoid regression (Phase 1.1 doc §5 R8).
//
// Tenant-disabled taxonomy is Phase 2's job; this module does not consult
// taxonomy term counts or tenant-scoped taxonomy restrictions.

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
// `gender` is column-backed on `talent_profiles.gender`, absent from
// OLD_TO_NEW_KEY, and carries `internal_only=true` in field_definitions (so
// the anon RLS policy hides its row). The service-role read in
// fetchDirectoryFilterCatalogRows surfaces it for the filter sidebar anyway.
// Without this explicit allow-list the gender chip would vanish when the
// canonical path produces no decision for an unknown key — a launch-blocker.
// (Phase 1.1 doc §5 R4.)
//
// Scope: filter sidebar only. Card + sidebar helpers block `gender` via the
// `internal_only=true` guard (correct: gender is never a card trait line or
// profile sidebar section).
const GENDER_ALLOW_LIST_KEYS = new Set<string>(["gender"]);

// ─── Batch loader types ───────────────────────────────────────────────────────

type CanonicalDefDecisionRow = {
  id: string;
  field_key: string;
  default_visibility: string[] | null;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  show_in_directory: boolean | null;
  deprecated_at: string | null;
};

type TenantOverrideDecisionRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  show_in_public_override: boolean | null;
  show_in_directory_override: boolean | null;
  admin_only_override: boolean | null;
  default_visibility_override: string[] | null;
};

/** Per-legacy-key canonical decision (JSON-safe for unstable_cache storage). */
type BridgedKeyDecision = {
  /** true when effectiveFieldVisibility resolves to "public" for this def. */
  isPublic: boolean;
  /** true when canonical show_in_directory is true after tenant override. */
  showInDirectory: boolean;
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

  const canonicalKeys = [...new Set(Object.values(OLD_TO_NEW_KEY))];

  const { data: defs, error: defsErr } = await svc
    .from("profile_field_definitions")
    .select(
      "id, field_key, default_visibility, admin_only, is_sensitive, show_in_public, show_in_directory, deprecated_at",
    )
    .in("field_key", canonicalKeys);

  if (defsErr || !defs) return {};

  const defRows = defs as CanonicalDefDecisionRow[];
  const overrideMap = new Map<string, TenantOverrideDecisionRow>();

  if (tenantId && defRows.length > 0) {
    const { data: overrides } = await svc
      .from("workspace_profile_field_settings")
      .select(
        "field_definition_id, enabled_override, show_in_public_override, show_in_directory_override, admin_only_override, default_visibility_override",
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

    const showInDirectory =
      override?.show_in_directory_override ?? def.show_in_directory ?? false;

    byCanonicalKey.set(def.field_key, {
      isPublic: visibility === "public",
      showInDirectory: Boolean(showInDirectory),
    });
  }

  // Translate canonicalKey → oldKey (the keys that appear in field_definitions).
  const result: BridgedKeyDecisions = {};
  for (const [oldKey, newKey] of Object.entries(OLD_TO_NEW_KEY)) {
    const dec = byCanonicalKey.get(newKey);
    if (dec) result[oldKey] = dec;
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
 *      decision).
 *   3. Gender allow-list (R4): `gender` is column-backed + internal_only=true
 *      and absent from OLD_TO_NEW_KEY; permitted via explicit list.
 *   4. Bridged keys (OLD_TO_NEW_KEY): AND legacy flag (step 2) with canonical
 *      effectiveFieldVisibility + show_in_directory decision (R1).
 *   5. Non-bridged keys: synthetic effectiveFieldVisibility from legacy flags
 *      (C2 hybrid — Phase 2 collapse target; see _syntheticLegacyVisibility).
 *
 * Tenant-disabled taxonomy is Phase 2 scope; not checked here.
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

  // 4. Bridged keys: AND canonical decision with already-satisfied legacy flag.
  if (OLD_TO_NEW_KEY[field.key]) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false; // canonical def missing → safe-fail
    return dec.isPublic && dec.showInDirectory;
  }

  // 5. Non-bridged (language, talent_type, location, skills, fit_labels,
  //    industries, event_types, tags): synthetic C2 path.
  //    Tenant-disabled taxonomy: Phase 2 scope — not gated here.
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
 *      a tenant that set card_visible=false in the legacy system is protected).
 *   3. Bridged keys: AND canonical effectiveFieldVisibility + show_in_directory.
 *   4. Non-bridged keys: synthetic C2 path (Phase 2 collapse target).
 *
 * Note: `gender` has internal_only=true → blocked at step 1. Gender is a
 * filter chip (sourced from talent_profiles.gender), never a card trait.
 * Tenant-disabled taxonomy is Phase 2 scope.
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

  // 3. Bridged keys: canonical decision ANDs with legacy flags already
  //    satisfied above. show_in_directory gates cards (cards are a sub-surface
  //    of directory; show_in_public alone is not sufficient here).
  if (OLD_TO_NEW_KEY[field.key]) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false;
    return dec.isPublic && dec.showInDirectory;
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
 * All six are non-bridged today; all go through the synthetic C2 path until
 * Phase 2 backfills canonical rows for them.
 *
 * Decision flow (in order):
 *   1. Base guards: active + non-archived + !internal_only (invariants 4 + 5).
 *   2. Legacy `public_visible` + `profile_visible` must be true (R1).
 *   3. Bridged keys: AND canonical effectiveFieldVisibility. Note: sidebar
 *      requires show_in_public (profile context) — show_in_directory is NOT
 *      required (sidebar is a public profile surface, not a directory surface).
 *   4. Non-bridged keys: synthetic C2 path (Phase 2 collapse target).
 *
 * Tenant-disabled taxonomy is Phase 2 scope.
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

  // 3. Bridged keys: canonical decision (show_in_public only — sidebar does
  //    not require show_in_directory).
  if (OLD_TO_NEW_KEY[field.key]) {
    const decisions = await _getDecisionsForTenant(ctx.tenantId);
    const dec = decisions.get(field.key);
    if (!dec) return false;
    return dec.isPublic; // show_in_directory NOT required for profile sidebar
  }

  // 4. Non-bridged (the six sidebar taxonomy section keys): synthetic C2 path.
  return _syntheticLegacyVisibility(field);
}
