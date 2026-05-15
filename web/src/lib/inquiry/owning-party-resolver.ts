/**
 * owning-party-resolver — D0 (Discover funnel convergence).
 *
 * Resolves which "owning party" a given talent belongs to at inquiry-
 * submit time. The resolution is FROZEN onto `inquiry_participants`
 * (`owning_party_type`, `owning_party_id`) so that:
 *
 *   1. Commission resolution (per-booking-row) stays coherent even if
 *      the talent later changes agency exclusivity.
 *   2. Multi-tenant thread fan-out routes each row to the correct inbox.
 *   3. Lineup view shows correct per-row owning party for the lifetime
 *      of the inquiry.
 *
 * Decision tree (per `project_discover_unified.md` §3.2 +
 * `project_agency_exclusivity_model.md`):
 *
 *   1. Talent has a `is_primary=true` roster row on an agency whose
 *      plan_tier ∈ {studio, agency, network, hub-network}
 *      → owning_party = ('agency', agency_id)
 *      → exclusive agency case. Inquiry routes to agency admin.
 *
 *   2. Talent has any active roster row on a *Free*-plan workspace
 *      → owning_party = ('workspace', tenant_id)
 *      → friend-link case. No exclusivity, but the workspace is the
 *      operational party.
 *
 *   3. Talent has no active roster row anywhere
 *      → owning_party = ('talent', talent_profile_id)
 *      → independent talent. Routes direct to talent's own inbox.
 *
 * In the single-tenant Discover-pre-launch reality, every active talent
 * has at least one roster row (tenant #1 = Impronta Models Tulum), so
 * case 1 + 2 dominate. The independent-talent branch is reserved for
 * the Discover D5 fan-out scenario where Tulala accepts talent who
 * have no agency relationship.
 *
 * NOTE: This resolver runs at submit time only. The frozen result on
 * `inquiry_participants` is the source of truth thereafter. If the
 * talent's exclusivity changes after submit, this row does NOT
 * auto-update — that's the whole point of freezing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OwningPartyType = "agency" | "workspace" | "talent";

export type OwningParty = {
  /** The owning-party type frozen onto `inquiry_participants.owning_party_type`. */
  type: OwningPartyType;
  /**
   * The owning-party id frozen onto `inquiry_participants.owning_party_id`.
   *   - type='agency'    → `agencies.id`
   *   - type='workspace' → `agencies.id` (Free-plan workspace = agency row)
   *   - type='talent'    → `talent_profiles.id`
   */
  id: string;
};

/**
 * Plan tiers that get exclusive-agency status when they primary-claim
 * a talent. Free is intentionally excluded — Free workspaces are the
 * "friend link" tier with no commission and no exclusivity.
 */
const EXCLUSIVE_PLAN_TIERS = new Set<string>(["studio", "agency", "network", "hub-network"]);

/**
 * Resolve the owning party for a single talent.
 *
 * Returns null only on infrastructure failure (DB error). Callers
 * should default to `{ type: 'workspace', id: fallbackTenantId }` on
 * null — matches the trigger behavior on `inquiry_participants` and
 * keeps the single-tenant case working when the resolver can't reach
 * Supabase.
 */
export async function resolveOwningPartyForTalent(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<OwningParty | null> {
  // 1 + 2: any active roster row for this talent.
  const { data: rosterRows, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, is_primary, status, agencies:tenant_id ( id, plan_tier )")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"]);

  if (error) {
    // Don't throw — caller falls back to workspace+tenant_id.
    return null;
  }

  type Row = {
    tenant_id: string;
    is_primary: boolean;
    status: string;
    // Supabase typed-select returns either a single row or an array
    // depending on the FK direction. We accept both.
    agencies:
      | { id: string; plan_tier: string | null }
      | { id: string; plan_tier: string | null }[]
      | null;
  };
  const rows = (rosterRows ?? []) as Row[];

  // 3: no rosters at all → independent talent.
  if (rows.length === 0) {
    return { type: "talent", id: talentProfileId };
  }

  // Look for a primary on an exclusive-tier plan.
  for (const row of rows) {
    if (!row.is_primary) continue;
    const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
    const planTier = agency?.plan_tier ?? null;
    if (planTier && EXCLUSIVE_PLAN_TIERS.has(planTier)) {
      return { type: "agency", id: row.tenant_id };
    }
  }

  // No primary on an exclusive tier. Pick the first active row as the
  // workspace owner. This matches the single-tenant "friend link" case
  // where a Free workspace operationally owns the relationship without
  // exclusivity.
  const firstActive = rows.find((r) => r.status === "active") ?? rows[0];
  return { type: "workspace", id: firstActive.tenant_id };
}

/**
 * Batch resolve owning parties for multiple talents. One DB round-trip
 * instead of N. Used by `submitInquiry` when an inquiry targets several
 * talents at once (shortlist case from D5).
 *
 * Returns a Map keyed by talent_profile_id. Talents missing from the
 * roster fall back to independent-talent.
 */
export async function resolveOwningPartiesForTalents(
  supabase: SupabaseClient,
  talentProfileIds: string[],
): Promise<Map<string, OwningParty>> {
  const out = new Map<string, OwningParty>();
  if (talentProfileIds.length === 0) return out;

  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, talent_profile_id, is_primary, status, agencies:tenant_id ( id, plan_tier )")
    .in("talent_profile_id", talentProfileIds)
    .in("status", ["active", "pending"]);

  if (error) {
    // Default to independent for every input — caller will catch this
    // via the explicit null check on `resolveOwningPartyForTalent`.
    for (const tid of talentProfileIds) {
      out.set(tid, { type: "talent", id: tid });
    }
    return out;
  }

  type Row = {
    tenant_id: string;
    talent_profile_id: string;
    is_primary: boolean;
    status: string;
    agencies:
      | { id: string; plan_tier: string | null }
      | { id: string; plan_tier: string | null }[]
      | null;
  };
  const rows = (data ?? []) as Row[];

  // Group rows per talent.
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const list = grouped.get(r.talent_profile_id) ?? [];
    list.push(r);
    grouped.set(r.talent_profile_id, list);
  }

  for (const talentId of talentProfileIds) {
    const myRows = grouped.get(talentId) ?? [];
    if (myRows.length === 0) {
      out.set(talentId, { type: "talent", id: talentId });
      continue;
    }
    // Primary on exclusive tier?
    let placed = false;
    for (const row of myRows) {
      if (!row.is_primary) continue;
      const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
      const planTier = agency?.plan_tier ?? null;
      if (planTier && EXCLUSIVE_PLAN_TIERS.has(planTier)) {
        out.set(talentId, { type: "agency", id: row.tenant_id });
        placed = true;
        break;
      }
    }
    if (placed) continue;

    // Fall back to workspace = first active row.
    const firstActive = myRows.find((r) => r.status === "active") ?? myRows[0];
    out.set(talentId, { type: "workspace", id: firstActive.tenant_id });
  }

  return out;
}
