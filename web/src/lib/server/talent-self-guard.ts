import "server-only";

import { talentPlanGrantsAccessCapability } from "@/lib/access/talent-membership";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import {
  loadTalentSelfProfile,
  loadTalentSelfProfileByUser,
  type TalentSelfProfile,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { requireSession, type GuardedSession } from "@/lib/server/action-guards";

export type TalentSelfScopeOk = {
  ok: true;
  session: GuardedSession;
  tenantId: string;
  tenantSlug: string;
  talentProfile: TalentSelfProfile;
  planKey: string;
};

export type TalentSelfScopeFail = {
  ok: false;
  code: "not_authenticated" | "workspace_not_found" | "talent_profile_not_found";
  error: string;
};

export type TalentSelfScopeResult = TalentSelfScopeOk | TalentSelfScopeFail;

/** Platform-scoped talent guard — no tenant slug in the URL. */
export async function requireTalentSelf(): Promise<TalentSelfScopeResult> {
  const session = await requireSession();
  if (!session.ok) {
    return {
      ok: false,
      code: "not_authenticated",
      error: session.error,
    };
  }

  const talentProfile = await loadTalentSelfProfileByUser(session.user.id);
  if (!talentProfile) {
    return {
      ok: false,
      code: "talent_profile_not_found",
      error: "Talent profile not found.",
    };
  }

  return {
    ok: true,
    session,
    tenantId: "",
    tenantSlug: "",
    talentProfile,
    planKey: talentProfile.talentPlanKey,
  };
}

export async function requireTalentSelfScope(
  tenantSlug: string,
): Promise<TalentSelfScopeResult> {
  const session = await requireSession();
  if (!session.ok) {
    return {
      ok: false,
      code: "not_authenticated",
      error: session.error,
    };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return {
      ok: false,
      code: "workspace_not_found",
      error: "Workspace not found.",
    };
  }

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) {
    return {
      ok: false,
      code: "talent_profile_not_found",
      error: "Talent profile not found in this workspace.",
    };
  }

  return {
    ok: true,
    session,
    tenantId: scope.tenantId,
    tenantSlug,
    talentProfile,
    planKey: talentProfile.talentPlanKey,
  };
}

export function assertTalentCanEditPersonalSite(planKey: string): boolean {
  return talentPlanGrantsAccessCapability(planKey, "talent.page.edit");
}

export function assertTalentCanPublishPersonalSite(planKey: string): boolean {
  return talentPlanGrantsAccessCapability(planKey, "talent.page.publish");
}
