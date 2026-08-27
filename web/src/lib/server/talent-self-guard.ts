import "server-only";

import {
  talentPlanGrantsAccessCapability,
  talentPlanGrantsCapability,
  talentPlanToTier,
  type TalentPlanKey,
} from "@/lib/access/talent-membership";
import { isTalentSiteTierExpansionEnabled } from "@/lib/access/talent-site-tier-expansion";
import {
  isTemplateAllowedForTier,
  type TalentSiteTemplateKey,
} from "@/lib/talent-site/templates/registry";
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

function siteExpansionBlocked(planKey: string): boolean {
  return (
    !isTalentSiteTierExpansionEnabled() &&
    talentPlanToTier(planKey) !== "max"
  );
}

export function assertTalentCanEditPersonalSite(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsAccessCapability(planKey, "talent.page.edit");
}

export function assertTalentCanPublishPersonalSite(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsAccessCapability(planKey, "talent.page.publish");
}

export function assertTalentCanApplyTemplate(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsCapability(planKey, "personalSiteTemplate");
}

export function assertTalentCanUseCustomBuilder(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsCapability(planKey, "personalSiteCustomBuilder");
}

export function assertTalentCanSaveComposition(planKey: string): boolean {
  return assertTalentCanUseCustomBuilder(planKey);
}

/**
 * Max-only — connect / verify / manage a custom domain for the personal Max
 * site. Mirrors the agency "manage custom domains" gate. The DB RLS on
 * `talent_site_domains` re-enforces the same Max requirement, so this is the
 * outer (UX-facing) half of a defense-in-depth pair.
 */
export function assertTalentCanConnectCustomDomain(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsAccessCapability(planKey, "talent.page.connect_custom_domain");
}

/**
 * Pro AND Portfolio — the public-profile extras the paid plans market: social /
 * video embeds and the press band. Both are `profile.enhanced` in the talent
 * plan catalog, so this reads the catalog rather than hard-coding plan keys;
 * the DB RLS on `talent_profile_embeds` / `talent_press_items` re-enforces the
 * same Pro-or-Max requirement via `talent_profile_has_pro_or_max()`, making
 * this the outer (UX-facing) half of a defense-in-depth pair.
 *
 * Deliberately NOT behind `siteExpansionBlocked` — that flag gates the personal
 * SITE builder, not the /t/[code] profile these extras render on.
 */
export function assertTalentCanManageProfileExtras(planKey: string): boolean {
  return talentPlanGrantsCapability(planKey, "profile.enhanced");
}

/**
 * Pro+ — generate / download the media kit (EPK) PDF.
 *
 * Rides on `profile.enhanced`, the capability already held by exactly
 * `talent_pro` and `talent_portfolio`, rather than minting a parallel gate
 * that could drift away from the marketed lineup. Deliberately NOT coupled to
 * `siteExpansionBlocked` — the kit is a profile export, not a personal-site
 * feature, so the site-tier kill switch has no say over it.
 */
export function assertTalentCanGenerateMediaKit(planKey: string): boolean {
  return talentPlanGrantsCapability(planKey, "profile.enhanced");
}

export function assertTemplateAllowedForPlan(
  planKey: string,
  templateKey: TalentSiteTemplateKey,
): boolean {
  if (!assertTalentCanApplyTemplate(planKey)) return false;
  return isTemplateAllowedForTier(templateKey, talentPlanToTier(planKey));
}

export function planDeniedMessage(
  capability: "template" | "custom_builder" | "edit" | "profile_extras" | "media_kit",
): string {
  if (capability === "profile_extras") {
    return "Upgrade to Pro to add social and video embeds and a press band to your profile.";
  }
  if (capability === "template") {
    return "Upgrade to Pro to choose premium templates.";
  }
  if (capability === "media_kit") {
    return "Upgrade to Pro to download your media kit.";
  }
  if (capability === "custom_builder") {
    return "Upgrade to Portfolio to customize sections and build your service website.";
  }
  if (!isTalentSiteTierExpansionEnabled()) {
    return "Personal site editing is temporarily unavailable. Please try again later.";
  }
  return "Upgrade to Max to customize sections and build your service website.";
}

export type { TalentPlanKey };
