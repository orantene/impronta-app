// src/lib/field-engine/directory-facet-category-gate.ts
//
// "Does this tenant's roster contain anybody these fields were designed for?"
//
// ─── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
// The profile EDITOR already scopes fields by talent category. The
// `physical-casting` field group (height, weight, bust/waist/hips, inseam,
// dress size, suit size, three shoe-size scales, hair, eyes, skin tone,
// tattoos, piercings) is mapped through `parent_category_field_groups` to
// exactly four parent categories — models, hosts-promo, performers,
// sports-fitness. A chef, a DJ, a driver, a photographer or a massage
// therapist is never asked for their bust measurement. That part is correct
// and long-standing.
//
// The DIRECTORY did not honour any of it. `show_in_directory_filter` and
// `show_in_directory_card` live on `profile_field_definitions` and are
// GLOBAL — one boolean per field for the entire platform. So an agency whose
// roster is chefs and DJs still rendered "Dress size", "Body type", "Hair
// colour" and "Shoe size (EU)" as public facets, every one of which could
// only ever return nothing for their roster. The 2026-09-01 engine audit
// found the same class of defect five times over
// (web/docs/directory-profile-engine-audit-2026-09-01.md).
//
// The fix is not to switch those flags off platform-wide: for a modelling
// agency they are correct, expected, and the whole point of the product. The
// fix is to make the directory ask the question the editor already asks —
// is this field for anyone we actually represent?
//
// ─── THE RULE ───────────────────────────────────────────────────────────────
// A facet survives when ANY of these holds:
//
//   1. Its field has no `field_group_id`. Ungrouped fields are universal by
//      construction (identity, admin, bio) and were never category-scoped.
//   2. Its group has no rows in `parent_category_field_groups`. An unmapped
//      group is not "scoped to nothing", it is "not yet scoped" — gating on
//      it would silently delete working facets the day someone adds a group.
//   3. Its group is mapped to at least one parent category present on the
//      tenant's own publicly-listed roster.
//
// ─── WHY ROSTER COMPOSITION, NOT THE LIVE RESULT SET ────────────────────────
// Gating on the currently-filtered results would make facets appear and
// vanish as a visitor filters, which reads as a broken sidebar. Roster
// composition is stable per tenant, cacheable, and answers the question an
// agency would actually ask: "do we represent any models?" Impronta, whose
// roster is models, keeps every casting facet. A chef-only agency loses them
// without anyone configuring anything.
//
// ─── FAIL-OPEN, ALWAYS ──────────────────────────────────────────────────────
// Every uncertain path returns "visible": no tenant scope (the platform hub),
// an empty roster, a read error, a category we cannot resolve. Showing a facet
// that matches nothing is a small wart; blanking a working agency's filter
// sidebar because one query hiccuped is an outage. The existing
// `check:dead-facets` operator script catches the former.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";

/** Max ancestor hops when walking a term up to its level-1 parent category. */
const MAX_PARENT_WALK_DEPTH = 6;

export interface FacetCategoryGate {
  /** Canonical field keys the tenant's roster does NOT justify surfacing. */
  suppressedFieldKeys: ReadonlySet<string>;
}

const EMPTY_GATE: FacetCategoryGate = { suppressedFieldKeys: new Set() };

type TermRow = { id: string; parent_id: string | null; level: number | null };

/**
 * Resolve every level-1 parent category represented on a tenant's publicly
 * listed roster.
 *
 * Talent are tagged at level 2 or 3 far more often than level 1 (live data:
 * 83 level-2 and 75 level-3 terms in use versus 8 at level 1), so the assigned
 * term is walked UP to its root rather than read directly. The walk is bounded
 * — a cycle in the taxonomy must not hang a page render.
 */
async function resolveTenantParentCategories(
  tenantId: string,
): Promise<Set<string>> {
  const admin = createServiceRoleClient();
  if (!admin) return new Set();

  const { data: roster, error: rosterErr } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id, talent_profiles!inner(id, is_publicly_listed, deleted_at)")
    .eq("tenant_id", tenantId);
  if (rosterErr || !roster) return new Set();

  const profileIds = (
    roster as unknown as {
      talent_profile_id: string;
      talent_profiles: { is_publicly_listed: boolean | null; deleted_at: string | null } | null;
    }[]
  )
    .filter((r) => r.talent_profiles?.is_publicly_listed && !r.talent_profiles?.deleted_at)
    .map((r) => r.talent_profile_id);
  if (profileIds.length === 0) return new Set();

  const { data: assigned, error: assignedErr } = await admin
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .in("talent_profile_id", profileIds);
  if (assignedErr || !assigned) return new Set();

  const seedIds = [...new Set(assigned.map((a) => a.taxonomy_term_id as string))];
  if (seedIds.length === 0) return new Set();

  // Pull the whole active term graph once; walking it in memory beats up to
  // MAX_PARENT_WALK_DEPTH round trips per distinct term.
  const { data: terms, error: termsErr } = await admin
    .from("taxonomy_terms")
    .select("id, parent_id, level");
  if (termsErr || !terms) return new Set();

  const byId = new Map<string, TermRow>(
    (terms as TermRow[]).map((t) => [t.id, t]),
  );

  const roots = new Set<string>();
  for (const seed of seedIds) {
    let cur = byId.get(seed);
    let hops = 0;
    while (cur && hops < MAX_PARENT_WALK_DEPTH) {
      if (cur.level === 1 || cur.parent_id == null) {
        roots.add(cur.id);
        break;
      }
      cur = byId.get(cur.parent_id);
      hops += 1;
    }
  }
  return roots;
}

/**
 * Build the suppression set for one tenant: canonical field keys whose group
 * is category-scoped and whose categories are absent from this roster.
 */
async function _buildGateUncached(tenantId: string): Promise<FacetCategoryGate> {
  const admin = createServiceRoleClient();
  if (!admin) return EMPTY_GATE;

  const rosterCategories = await resolveTenantParentCategories(tenantId);
  // No resolvable roster composition → gate nothing. See FAIL-OPEN above.
  if (rosterCategories.size === 0) return EMPTY_GATE;

  const { data: mappings, error: mapErr } = await admin
    .from("parent_category_field_groups")
    .select("parent_category_id, field_group_id");
  if (mapErr || !mappings) return EMPTY_GATE;

  /** field_group_id → the parent categories that group serves. */
  const categoriesByGroup = new Map<string, Set<string>>();
  for (const m of mappings as { parent_category_id: string; field_group_id: string }[]) {
    if (!categoriesByGroup.has(m.field_group_id)) {
      categoriesByGroup.set(m.field_group_id, new Set());
    }
    categoriesByGroup.get(m.field_group_id)!.add(m.parent_category_id);
  }
  if (categoriesByGroup.size === 0) return EMPTY_GATE;

  const { data: defs, error: defsErr } = await admin
    .from("profile_field_definitions")
    .select("field_key, field_group_id")
    .is("deprecated_at", null)
    .not("field_group_id", "is", null);
  if (defsErr || !defs) return EMPTY_GATE;

  const suppressed = new Set<string>();
  for (const d of defs as { field_key: string; field_group_id: string }[]) {
    const groupCategories = categoriesByGroup.get(d.field_group_id);
    // Rule 2 — an unmapped group is "not yet scoped", never "scoped to none".
    if (!groupCategories || groupCategories.size === 0) continue;
    let served = false;
    for (const c of groupCategories) {
      if (rosterCategories.has(c)) {
        served = true;
        break;
      }
    }
    if (!served) suppressed.add(d.field_key);
  }

  return { suppressedFieldKeys: suppressed };
}

/**
 * Cached gate, keyed by tenant. Mirrors the two-layer memoization used by
 * public-surface-visibility.ts: unstable_cache for cross-request reuse (tagged
 * so a catalog or directory write invalidates it) under React cache() for
 * per-render dedup, because a single sidebar render asks about ~30 fields.
 */
const _getCachedGate = cache(
  async (tenantId: string): Promise<FacetCategoryGate> => {
    const load = unstable_cache(
      async () => {
        const gate = await _buildGateUncached(tenantId);
        // unstable_cache serializes its payload, and a Set does not survive
        // that round trip — hand it an array and rebuild on the way out.
        return [...gate.suppressedFieldKeys];
      },
      ["directory-facet-category-gate", tenantId],
      {
        revalidate: 120,
        tags: [CACHE_TAG_FIELD_CATALOG, CACHE_TAG_DIRECTORY],
      },
    );
    return { suppressedFieldKeys: new Set(await load()) };
  },
);

/**
 * Is `canonicalKey` justified by this tenant's roster?
 *
 * `tenantId === null` is the platform hub, which aggregates every agency, so
 * nothing is gated there.
 */
export async function isFacetRelevantToTenantRoster(
  canonicalKey: string,
  tenantId: string | null,
): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const gate = await _getCachedGate(tenantId);
    return !gate.suppressedFieldKeys.has(canonicalKey);
  } catch {
    // FAIL-OPEN. A cache or network fault must not blank the filter sidebar.
    return true;
  }
}

/** Exported for tests — bypasses both cache layers. */
export const __buildFacetCategoryGateUncached = _buildGateUncached;
