"use server";

import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { talentPlanGrantsAccessCapability } from "@/lib/access/talent-membership";
import { loadTalentSelfProfile } from "../../_data-bridge";

export type TalentPersonalSiteAccessResult =
  | {
      ok: true;
      talentProfileId: string;
      planKey: string;
      publicPath: string | null;
    }
  | {
      ok: false;
      reason:
        | "not_authenticated"
        | "workspace_not_found"
        | "talent_profile_not_found"
        | "plan_not_eligible";
    };

export async function assertTalentPersonalSiteBuilderAccess(
  tenantSlug: string,
): Promise<TalentPersonalSiteAccessResult> {
  const session = await getCachedActorSession();
  if (!session.user) {
    return { ok: false, reason: "not_authenticated" };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false, reason: "workspace_not_found" };
  }

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) {
    return { ok: false, reason: "talent_profile_not_found" };
  }

  if (!talentPlanGrantsAccessCapability(talentProfile.talentPlanKey, "talent.page.edit")) {
    return { ok: false, reason: "plan_not_eligible" };
  }

  return {
    ok: true,
    talentProfileId: talentProfile.id,
    planKey: talentProfile.talentPlanKey,
    publicPath: talentProfile.profileCode ? `/t/${talentProfile.profileCode}` : null,
  };
}
