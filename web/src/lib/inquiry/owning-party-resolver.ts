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
 * Roster exclusivity_status values that mean the talent is NOT (or no longer)
 * exclusively bound, even on an exclusive-tier agency: they declined the
 * auto-assigned exclusivity, or they're serving notice to leave. Such a row is
 * treated as non-exclusive so a hub inquiry can self-coordinate.
 */
const NON_EXCLUSIVE_STATUSES = new Set<string>(["declined", "notice_period"]);

/**
 * Open-marketplace source channels: the inquiry was brokered by the Tulala hub
 * (Discover, public directory, a talent's public hub profile), NOT through a
 * specific agency's own storefront/admin. A non-exclusive rostered talent
 * self-coordinates these (owning_party = talent); an exclusive talent still
 * routes to their agency. Agency-brokered channels (agency_site, admin_*, pitch,
 * form, phone) are NOT hub-sourced — they keep the workspace as owner.
 *
 * Prefix matches (`discover_`, `directory_`) catch current + future variants;
 * the explicit set covers the rest. New hub channels should match a prefix or be
 * added here, else a non-exclusive talent inquired via that channel will wrongly
 * route to the workspace instead of self-coordinating.
 */
export function isHubSourcedChannel(sourceChannel: string | null | undefined): boolean {
  if (!sourceChannel) return false;
  const c = sourceChannel.toLowerCase();
  return (
    c.startsWith("discover_") ||
    c.startsWith("directory_") ||
    c === "public_directory" ||
    c === "public_talent_profile" ||
    c === "hub"
  );
}

type AgencyEmbed =
  | { id?: string; plan_tier: string | null }
  | { id?: string; plan_tier: string | null }[]
  | null;

/**
 * A roster row confers exclusivity when the talent is the agency's PRIMARY
 * roster member, the agency is on an exclusive-tier plan, and the exclusivity
 * relationship hasn't been declined / isn't in its notice period.
 */
function rowIsExclusive(
  isPrimary: boolean,
  exclusivityStatus: string | null | undefined,
  agencies: AgencyEmbed,
): boolean {
  if (!isPrimary) return false;
  if (exclusivityStatus && NON_EXCLUSIVE_STATUSES.has(exclusivityStatus)) return false;
  const agency = Array.isArray(agencies) ? agencies[0] : agencies;
  const planTier = agency?.plan_tier ?? null;
  return !!planTier && EXCLUSIVE_PLAN_TIERS.has(planTier);
}

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
  /**
   * The inquiry's tenant (`inquiries.tenant_id`). When provided, the resolver
   * is SOURCE-AWARE for non-exclusive talents: an inquiry that arrived through
   * a tenant the talent is rostered on (an agency's own storefront) is owned by
   * that workspace; an inquiry that arrived through any other tenant — the open
   * Tulala hub — is owned by the talent (self-coordinate). Omit for the legacy
   * source-blind behavior (first active roster row wins).
   */
  inquiryTenantId?: string | null,
  /** See {@link resolveOwningPartiesForTalents}. Open-hub source → non-exclusive
   *  talents self-coordinate regardless of tenant. Takes precedence over
   *  inquiryTenantId. */
  hubSourced?: boolean,
): Promise<OwningParty | null> {
  // 1 + 2: any active roster row for this talent.
  const { data: rosterRows, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, is_primary, status, exclusivity_status, agencies:tenant_id ( id, plan_tier )")
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
    exclusivity_status: string | null;
    agencies: AgencyEmbed;
  };
  const rows = (rosterRows ?? []) as Row[];

  // 3: no rosters at all → independent talent.
  if (rows.length === 0) {
    return { type: "talent", id: talentProfileId };
  }

  // 1. Exclusive agency — source-independent (the VIP manager always owns it).
  for (const row of rows) {
    if (rowIsExclusive(row.is_primary, row.exclusivity_status, row.agencies)) {
      return { type: "agency", id: row.tenant_id };
    }
  }

  // 2. Hub-sourced: non-exclusive talent self-coordinates regardless of which
  // workspace they're rostered on (single-tenant setups share tenant_id between
  // hub + agency, so source_channel is the only reliable signal).
  if (hubSourced) {
    return { type: "talent", id: talentProfileId };
  }

  // 3. Non-exclusive. When the inquiry source (its tenant) is known, route by
  // it: an agency's own storefront (a tenant the talent is rostered on) owns
  // the relationship; the open hub (any other tenant) hands it to the talent.
  if (inquiryTenantId) {
    if (rows.some((r) => r.tenant_id === inquiryTenantId)) {
      return { type: "workspace", id: inquiryTenantId };
    }
    return { type: "talent", id: talentProfileId };
  }

  // Legacy (no source context). Pick the first active row as the workspace
  // owner — the single-tenant "friend link" case where a Free workspace
  // operationally owns the relationship without exclusivity.
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
  /** The inquiry's tenant — see `resolveOwningPartyForTalent`. When provided,
   *  the resolver is source-aware for non-exclusive talents. */
  inquiryTenantId?: string | null,
  /**
   * When true the inquiry arrived via the open Tulala hub (Discover / shortlist /
   * direct-hub link), NOT through any specific agency's own storefront. Non-exclusive
   * rostered talents self-coordinate on hub-sourced inquiries regardless of which
   * workspace they're rostered on — the same as if they had no roster at all.
   * Exclusive agency talents are unaffected (the agency always owns them).
   * Takes precedence over inquiryTenantId for non-exclusive resolution.
   */
  hubSourced?: boolean,
): Promise<Map<string, OwningParty>> {
  const out = new Map<string, OwningParty>();
  if (talentProfileIds.length === 0) return out;

  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id, talent_profile_id, is_primary, status, exclusivity_status, agencies:tenant_id ( id, plan_tier )")
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
    exclusivity_status: string | null;
    agencies: AgencyEmbed;
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
    // 1. Exclusive agency — source-independent.
    const exclusive = myRows.find((row) =>
      rowIsExclusive(row.is_primary, row.exclusivity_status, row.agencies),
    );
    if (exclusive) {
      out.set(talentId, { type: "agency", id: exclusive.tenant_id });
      continue;
    }
    // 2. Hub-sourced: non-exclusive talent self-coordinates regardless of which
    // workspace they're rostered on. In single-tenant setups the hub shares the
    // same tenant_id as the agency, so source_channel is the only reliable
    // signal — which the caller translates into this flag.
    if (hubSourced) {
      out.set(talentId, { type: "talent", id: talentId });
      continue;
    }
    // 3. Non-exclusive — source-aware when the inquiry's tenant is known:
    // rostered on it (agency storefront) → workspace; else (open hub) → talent.
    if (inquiryTenantId) {
      out.set(
        talentId,
        myRows.some((r) => r.tenant_id === inquiryTenantId)
          ? { type: "workspace", id: inquiryTenantId }
          : { type: "talent", id: talentId },
      );
      continue;
    }
    // Legacy (no source context) — first active row.
    const firstActive = myRows.find((r) => r.status === "active") ?? myRows[0];
    out.set(talentId, { type: "workspace", id: firstActive.tenant_id });
  }

  return out;
}
