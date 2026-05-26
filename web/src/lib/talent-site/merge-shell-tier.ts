import {
  buildTalentMembershipState,
  talentTierToPlanKey,
  type TalentPlanTier,
} from "@/lib/access/talent-membership";
import { listTemplatesForTier } from "@/lib/talent-site/templates/registry";
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
  const availableTemplates = listTemplatesForTier(membership.tier).map((t) => ({
    key: t.key,
    label: t.label,
    blurb: t.blurb,
    thumbnailUrl: t.thumbnailUrl,
  }));

  return {
    ...base,
    planKey: membership.planKey,
    tier: membership.tier,
    displayName: membership.displayName,
    canBuildPersonalSite: membership.capabilities.canUseCustomBuilder,
    canEditPersonalSite: membership.capabilities.canEditPersonalSite,
    canPublishPersonalSite: membership.capabilities.canPublishPersonalSite,
    canUseTemplateGallery: membership.capabilities.canUseTemplateGallery,
    canUseCustomBuilder: membership.capabilities.canUseCustomBuilder,
    availableTemplates,
  };
}
