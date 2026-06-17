import type { CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";
import { isTalentSiteTierExpansionEnabled } from "./talent-site-tier-expansion";

export const TALENT_PLAN_KEYS = [
  "talent_basic",
  "talent_pro",
  "talent_portfolio",
] as const;

export type TalentPlanKey = (typeof TALENT_PLAN_KEYS)[number];
export type TalentPlanTier = "free" | "pro" | "max";

export type TalentPlanCapability =
  | "profile.basic"
  | "profile.enhanced"
  | "personalSiteEdit"
  | "personalSitePublish"
  | "personalSiteTemplate"
  | "personalSiteCustomBuilder"
  | "personalSiteCustomDomain";

export type TalentMembershipState = {
  planKey: TalentPlanKey;
  tier: TalentPlanTier;
  displayName: "Free" | "Pro" | "Max";
  capabilities: {
    /** @deprecated Use canUseCustomBuilder — Max custom section composer only */
    canBuildPersonalSite: boolean;
    canEditPersonalSite: boolean;
    canPublishPersonalSite: boolean;
    canUseTemplateGallery: boolean;
    canUseCustomBuilder: boolean;
    /** @deprecated Alias of canUseTemplateGallery */
    canSetPersonalSiteTemplate: boolean;
    canConnectPersonalSiteDomain: boolean;
  };
};

const PLAN_TO_TIER: Record<TalentPlanKey, TalentPlanTier> = {
  talent_basic: "free",
  talent_pro: "pro",
  talent_portfolio: "max",
};

const TIER_TO_PLAN: Record<TalentPlanTier, TalentPlanKey> = {
  free: "talent_basic",
  pro: "talent_pro",
  max: "talent_portfolio",
};

const DISPLAY_NAME: Record<TalentPlanTier, TalentMembershipState["displayName"]> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
};

const TALENT_PLAN_CAPABILITIES: Record<TalentPlanKey, ReadonlySet<TalentPlanCapability>> = {
  talent_basic: new Set<TalentPlanCapability>([
    "profile.basic",
    "personalSiteEdit",
    "personalSitePublish",
  ]),
  talent_pro: new Set<TalentPlanCapability>([
    "profile.basic",
    "profile.enhanced",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteTemplate",
  ]),
  talent_portfolio: new Set<TalentPlanCapability>([
    "profile.basic",
    "profile.enhanced",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteTemplate",
    "personalSiteCustomBuilder",
    // Max-only — connect / verify / manage a custom domain for the Max site.
    // The DB RLS on `talent_site_domains` enforces the same Max gate
    // (`talent_profile_has_max`) as a defense-in-depth backstop.
    "personalSiteCustomDomain",
  ]),
};

const TALENT_MONETIZATION_CAPABILITY_MAP: Partial<Record<CapabilityKey, TalentPlanCapability>> = {
  "talent.page.edit": "personalSiteEdit",
  "talent.page.publish": "personalSitePublish",
  "talent.page.set_template": "personalSiteTemplate",
  "talent.page.enable_module": "personalSiteCustomBuilder",
  "talent.page.connect_custom_domain": "personalSiteCustomDomain",
};

export function isTalentPlanKey(value: string | null | undefined): value is TalentPlanKey {
  return (TALENT_PLAN_KEYS as readonly string[]).includes(value ?? "");
}

export function normalizeTalentPlanKey(value: string | null | undefined): TalentPlanKey {
  if (isTalentPlanKey(value)) return value;
  if (value === "free") return "talent_basic";
  if (value === "pro") return "talent_pro";
  if (value === "max") return "talent_portfolio";
  return "talent_basic";
}

export function talentPlanToTier(planKey: string | null | undefined): TalentPlanTier {
  return PLAN_TO_TIER[normalizeTalentPlanKey(planKey)];
}

export function talentTierToPlanKey(tier: TalentPlanTier): TalentPlanKey {
  return TIER_TO_PLAN[tier];
}

export function talentPlanGrantsCapability(
  planKey: string | null | undefined,
  capability: TalentPlanCapability,
): boolean {
  const normalized = normalizeTalentPlanKey(planKey);
  if (
    !isTalentSiteTierExpansionEnabled() &&
    (capability === "personalSiteEdit" || capability === "personalSitePublish") &&
    normalized !== "talent_portfolio"
  ) {
    return false;
  }
  return TALENT_PLAN_CAPABILITIES[normalized].has(capability);
}

export function talentPlanGrantsAccessCapability(
  planKey: string | null | undefined,
  capabilityKey: CapabilityKey,
): boolean {
  const talentCapability = TALENT_MONETIZATION_CAPABILITY_MAP[capabilityKey];
  if (!talentCapability) return false;
  return talentPlanGrantsCapability(planKey, talentCapability);
}

export function isTalentAudiencePlan(planKey: PlanKey | string | null | undefined): boolean {
  return isTalentPlanKey(planKey);
}

export function buildTalentMembershipState(
  rawPlanKey: string | null | undefined,
): TalentMembershipState {
  const planKey = normalizeTalentPlanKey(rawPlanKey);
  const tier = PLAN_TO_TIER[planKey];

  const canUseCustomBuilder = talentPlanGrantsCapability(planKey, "personalSiteCustomBuilder");
  const canUseTemplateGallery = talentPlanGrantsCapability(planKey, "personalSiteTemplate");
  const canEditPersonalSite = talentPlanGrantsCapability(planKey, "personalSiteEdit");
  const canPublishPersonalSite = talentPlanGrantsCapability(planKey, "personalSitePublish");

  return {
    planKey,
    tier,
    displayName: DISPLAY_NAME[tier],
    capabilities: {
      canBuildPersonalSite: canUseCustomBuilder,
      canEditPersonalSite,
      canPublishPersonalSite,
      canUseTemplateGallery,
      canUseCustomBuilder,
      canSetPersonalSiteTemplate: canUseTemplateGallery,
      canConnectPersonalSiteDomain: talentPlanGrantsCapability(planKey, "personalSiteCustomDomain"),
    },
  };
}
