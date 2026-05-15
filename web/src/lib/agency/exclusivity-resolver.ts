/**
 * agency/exclusivity-resolver — auto-exclusivity decision when an admin
 * adds talent to their agency roster.
 *
 * Per `project_agency_exclusivity_model.md`:
 *   - Studio / Agency / Network / Hub-Network plans: auto-exclusive
 *     (set is_primary=TRUE) UNLESS the talent is already exclusive
 *     somewhere else (rule: one exclusive at a time).
 *   - Free plan: never exclusive (friend-link case, 0% commission).
 *
 * Symmetric with `web/src/lib/inquiry/owning-party-resolver.ts` — both
 * gate on the same exclusive-tier plan set:
 *   EXCLUSIVE_PLAN_TIERS = { studio, agency, network, hub-network }
 *
 * Talent-initiated self-provision flows should NOT call this: when a
 * talent joins their own profile to an existing agency, they're
 * choosing to JOIN — exclusivity is a separate decision they make
 * later from the Reach surface.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const EXCLUSIVE_PLAN_TIERS = new Set<string>([
  "studio",
  "agency",
  "network",
  "hub-network",
]);

export type ExclusivityResolution = {
  /** True when the new roster row should be inserted with is_primary=TRUE. */
  shouldBeExclusive: boolean;
  /** Plan tier we observed; useful for logging or downstream UI nudges. */
  planTier: string | null;
  /** When false, the reason explains why exclusivity was not granted. */
  reason: "set_exclusive" | "free_plan" | "already_exclusive_elsewhere" | "unknown_plan";
  /**
   * exclusivity_status to stamp on the roster row insert.
   * 'auto_assigned' when admin is auto-flagging (talent gets a prompt to
   * confirm/decline). 'confirmed' otherwise (back-compat default). Maps
   * to the public.exclusivity_status enum on the column.
   */
  exclusivityStatus: "confirmed" | "auto_assigned";
  /**
   * exclusivity_auto_assigned_at to stamp on the row insert. Only set
   * when status='auto_assigned' so the talent UI can compute "N days
   * remaining to decline" countdown copy.
   */
  autoAssignedAt: string | null;
};

/**
 * Decide whether a new roster row should be is_primary=TRUE.
 *
 * Defaults conservatively: if the plan tier can't be resolved, or the
 * talent already has an exclusive row elsewhere, we return shouldBeExclusive
 * = false. The roster insert proceeds either way; only the flag changes.
 */
export async function resolveExclusivityForRosterAdd(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<ExclusivityResolution> {
  // 1. Tenant plan tier (NOT exclusive on Free).
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .maybeSingle();
  const planTier = (agencyError ? null : (agency?.plan_tier as string | null)) ?? null;

  if (!planTier || !EXCLUSIVE_PLAN_TIERS.has(planTier)) {
    return {
      shouldBeExclusive: false,
      planTier,
      reason: planTier === "free" ? "free_plan" : "unknown_plan",
      exclusivityStatus: "confirmed",
      autoAssignedAt: null,
    };
  }

  // 2. Is the talent already exclusive somewhere else (one-exclusive-at-a-time
  // rule)? An existing is_primary=TRUE on a non-removed row on a DIFFERENT
  // tenant blocks new auto-exclusivity.
  const { data: existing, error: existingError } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .eq("is_primary", true)
    .in("status", ["active", "pending"])
    .neq("tenant_id", tenantId)
    .limit(1);

  if (existingError) {
    // Read error → conservative: don't auto-exclusive.
    return {
      shouldBeExclusive: false,
      planTier,
      reason: "already_exclusive_elsewhere",
      exclusivityStatus: "confirmed",
      autoAssignedAt: null,
    };
  }

  if (existing && existing.length > 0) {
    return {
      shouldBeExclusive: false,
      planTier,
      reason: "already_exclusive_elsewhere",
      exclusivityStatus: "confirmed",
      autoAssignedAt: null,
    };
  }

  // Auto-exclusive: talent gets a confirmation prompt in their inbox.
  // is_primary lands as TRUE immediately; the prompt lets them flip it
  // back to FALSE within the N-day window via declineAgencyExclusivity.
  return {
    shouldBeExclusive: true,
    planTier,
    reason: "set_exclusive",
    exclusivityStatus: "auto_assigned",
    autoAssignedAt: new Date().toISOString(),
  };
}
