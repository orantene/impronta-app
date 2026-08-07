"use server";

// ============================================================================
// admin-talent-metrics.ts — Phase 5 server actions for earned-trust signals.
//
// Reads the 3 metrics columns added to talent_profiles in field_architecture_v1:
//   - last_active_at
//   - profile_completeness_pct
//   - total_completed_bookings
//
// Plus aggregates:
//   - Verified skill count (from talent_skills_resolved)
//   - Trust badge count (from talent_profile_trust_badges where status='verified')
//
// V1.5 only READS metrics — populator job (Phase 5.1) writes them.
// For now last_active_at is updated on profile edit via touchTalentLastActive
// (already shipped in admin-talent-extras.ts).
// ============================================================================

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type TalentMetrics = {
  talent_profile_id: string;
  last_active_at: string | null;
  profile_completeness_pct: number | null;
  total_completed_bookings: number;
  verified_skill_count: number;
  total_skills: number;
  verified_badge_count: number;
};

export async function getTalentMetrics(input: {
  talent_profile_id: string;
}): Promise<
  { ok: true; metrics: TalentMetrics } | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Verify roster access.
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // Fetch base metrics from talent_profiles.
  const { data: profile, error: profErr } = await supabase
    .from("talent_profiles")
    .select(
      "id, last_active_at, profile_completeness_pct, total_completed_bookings",
    )
    .eq("id", input.talent_profile_id)
    .maybeSingle();

  if (profErr || !profile) {
    logServerError("getTalentMetrics.profile", profErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Skills aggregates.
  const { count: totalSkills } = await supabase
    .from("talent_skills_resolved")
    .select("*", { count: "exact", head: true })
    .eq("talent_profile_id", input.talent_profile_id);

  const { count: verifiedSkills } = await supabase
    .from("talent_skills_resolved")
    .select("*", { count: "exact", head: true })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("is_verified", true);

  // Trust badge count (status='verified', either platform or this tenant).
  const { count: verifiedBadges } = await supabase
    .from("talent_profile_trust_badges")
    .select("*", { count: "exact", head: true })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("status", "verified")
    .or(`scope.eq.platform,scope_tenant_id.eq.${tenantId}`);

  return {
    ok: true,
    metrics: {
      talent_profile_id: profile.id,
      last_active_at: profile.last_active_at,
      profile_completeness_pct: profile.profile_completeness_pct,
      total_completed_bookings: profile.total_completed_bookings ?? 0,
      verified_skill_count: verifiedSkills ?? 0,
      total_skills: totalSkills ?? 0,
      verified_badge_count: verifiedBadges ?? 0,
    },
  };
}
