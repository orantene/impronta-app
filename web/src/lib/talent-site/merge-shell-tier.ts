import {
  buildTalentMembershipState,
  talentTierToPlanKey,
  type TalentPlanTier,
} from "@/lib/access/talent-membership";
import type { TalentSiteDashboardState } from "@/lib/talent-site/types";

/**
 * Align personal-site gating with the talent shell tier (including dev
 * "Switch to Max" in Compare plans). Site row data still comes from the server.
 */
export function mergeTalentSiteDashboardWithShellTier(
  base: TalentSiteDashboardState,
  shellTier: TalentPlanTier,
): TalentSiteDashboardState {
  const membership = buildTalentMembershipState(talentTierToPlanKey(shellTier));
  return {
    ...base,
    planKey: membership.planKey,
    tier: membership.tier,
    displayName: membership.displayName,
    canBuildPersonalSite: membership.capabilities.canBuildPersonalSite,
    canEditPersonalSite: membership.capabilities.canEditPersonalSite,
    canPublishPersonalSite: membership.capabilities.canPublishPersonalSite,
  };
}
