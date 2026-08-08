import "server-only";

import { unstable_cache } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { EXCLUSIVE_PLAN_TIERS } from "@/lib/inquiry/owning-party-resolver";

/**
 * READ-side answer to "is this talent exclusively represented by this agency?"
 *
 * The public talent profile shows a quiet "Exclusively represented by {agency}"
 * line, which must agree with the routing the money path already performs:
 * `owning-party-resolver.rowIsExclusive` decides that an inquiry from anywhere
 * on the platform belongs to the primary agency. This helper mirrors that
 * predicate exactly and imports the SAME `EXCLUSIVE_PLAN_TIERS` set, so the
 * sentence on the page can never claim something the router disagrees with.
 *
 * The predicate is three-part and ALL of it matters:
 *   - `is_primary = true`  — the load-bearing bit. A talent can sit on several
 *     rosters; only the primary one is exclusive. (The platform hub carries a
 *     row for nearly every talent with `exclusivity_status='confirmed'` but
 *     `is_primary=false` — keying on the status alone would wrongly announce
 *     "exclusively represented by Tulala" on every profile.)
 *   - `exclusivity_status NOT IN (declined, notice_period)` — the talent
 *     opted out, or is serving notice; the badge must drop immediately.
 *   - the agency's `plan_tier` is an exclusive tier — Free-tier rosters never
 *     hold exclusivity.
 *
 * Degrades to `false` on any error or missing row: an un-shown line is a
 * cosmetic loss, a wrongly-shown one is a false claim about a commercial
 * relationship.
 *
 * Uses the SERVICE-ROLE client because `agencies.plan_tier` is not readable by
 * the anon client — an embedded `agencies ( plan_tier )` join silently returns
 * null under RLS and every talent reads as non-exclusive. Same pattern, and
 * same reason, as `loadTenantWhitelabel`. Only a boolean escapes this module.
 */
const NON_EXCLUSIVE_STATUSES = new Set<string>(["declined", "notice_period"]);

type RosterExclusivityRow = {
  is_primary: boolean | null;
  exclusivity_status: string | null;
  agencies: { plan_tier: string | null } | { plan_tier: string | null }[] | null;
};

function loadExclusivity(
  talentProfileId: string,
  tenantId: string,
): Promise<boolean> {
  return unstable_cache(
    async (): Promise<boolean> => {
      const admin = createServiceRoleClient();
      if (!admin) return false;
      const { data, error } = await admin
        .from("agency_talent_roster")
        .select("is_primary, exclusivity_status, agencies:tenant_id ( plan_tier )")
        .eq("talent_profile_id", talentProfileId)
        .eq("tenant_id", tenantId)
        .is("removed_at", null)
        .maybeSingle<RosterExclusivityRow>();
      if (error || !data) return false;

      if (data.is_primary !== true) return false;
      if (
        data.exclusivity_status &&
        NON_EXCLUSIVE_STATUSES.has(data.exclusivity_status)
      ) {
        return false;
      }
      const agency = Array.isArray(data.agencies) ? data.agencies[0] : data.agencies;
      const planTier = agency?.plan_tier ?? null;
      return !!planTier && EXCLUSIVE_PLAN_TIERS.has(planTier);
    },
    ["agency:talent-exclusivity", talentProfileId, tenantId],
    {
      revalidate: 300,
      tags: [`tenant:${tenantId}:roster`],
    },
  )();
}

/**
 * True when `talentProfileId` is exclusively represented by `tenantId`.
 * Returns false for an empty id pair without touching the network — the
 * public profile calls this on every host, including those with no tenant.
 */
export async function isTalentExclusiveToTenant(
  talentProfileId: string | null | undefined,
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!talentProfileId || !tenantId) return false;
  return loadExclusivity(talentProfileId, tenantId);
}
