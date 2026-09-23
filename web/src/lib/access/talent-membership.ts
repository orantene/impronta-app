import type { CapabilityKey } from "./capabilities";
import type { PlanKey } from "./plan-catalog";
import { isTalentFreeWebsiteEnabled } from "./talent-free-website";
import { talentTierLabel } from "./talent-tier-label";
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
  /** @deprecated Alias of `personalSiteSections` — kept so existing callers compile. */
  | "personalSiteCustomBuilder"
  | "personalSiteCustomDomain"
  | TalentSiteCapability;

/**
 * The capability keys that describe the talent's own PERSONAL WEBSITE (the
 * multi-page site engine), as opposed to the `/t/[code]` discovery profile.
 *
 * Every one of these is read through `talentPlanGrantsSiteCapability`, which
 * resolves them Max-only while `TALENT_FREE_WEBSITE_ENABLED` is off.
 *
 *   personalSiteEdit        edit page/shell content, slug, publish the site
 *   personalSitePublish     the PUBLIC read-time gate (the site serves at all)
 *   personalSiteDesignPresets  pick + switch Design and Look (FREE, all tiers)
 *   personalSiteSections    insert / paste / duplicate nested blocks + sections
 *   personalSitePages       add, delete, reorder, set-home extra pages
 *   personalSiteSeo         per-page SEO columns (write AND render)
 *   personalSiteAnalytics   the site analytics surface
 *   personalSiteCustomDomain  connect / verify a custom domain
 */
export const TALENT_SITE_CAPABILITY_KEYS = [
  "personalSiteEdit",
  "personalSitePublish",
  "personalSiteDesignPresets",
  "personalSiteSections",
  "personalSitePages",
  "personalSiteSeo",
  "personalSiteAnalytics",
  "personalSiteCustomDomain",
] as const;

export type TalentSiteCapability = (typeof TALENT_SITE_CAPABILITY_KEYS)[number];

/** One boolean per personal-site capability, for a single plan. */
export type TalentSiteCapabilities = Readonly<Record<TalentSiteCapability, boolean>>;

/**
 * Deprecated capability keys and the key each now resolves to. Callers that
 * still ask for `personalSiteCustomBuilder` keep compiling and keep getting the
 * same answer they always did (it was Max-only; `personalSiteSections` is too).
 */
const CAPABILITY_ALIASES: Partial<Record<TalentPlanCapability, TalentPlanCapability>> = {
  personalSiteCustomBuilder: "personalSiteSections",
};

/** Capability keys introduced by Phase 1 — never read before the switch existed. */
const FREE_WEBSITE_CAPABILITIES: ReadonlySet<TalentPlanCapability> = new Set([
  "personalSiteDesignPresets",
  "personalSiteSections",
  "personalSitePages",
  "personalSiteSeo",
  "personalSiteAnalytics",
]);

export type TalentMembershipState = {
  planKey: TalentPlanKey;
  tier: TalentPlanTier;
  /**
   * The tier label a talent reads. Resolved through `talentTierLabel`, so it
   * is "Free" / "Pro" / "Portfolio" while `TALENT_FREE_WEBSITE_ENABLED` is off
   * and "Free" / "Web Office" / "Web Office" once it is on (Pro fold,
   * 2026-09-23). Never a plan key, never "Max".
   */
  displayName: "Free" | "Pro" | "Portfolio" | "Web Office";
  capabilities: {
    /** @deprecated Use canUseCustomBuilder — Portfolio custom section composer only */
    canBuildPersonalSite: boolean;
    canEditPersonalSite: boolean;
    canPublishPersonalSite: boolean;
    canUseTemplateGallery: boolean;
    canUseCustomBuilder: boolean;
    /** @deprecated Alias of canUseTemplateGallery */
    canSetPersonalSiteTemplate: boolean;
    canConnectPersonalSiteDomain: boolean;
  };
  /** Phase 1 — the per-capability record every personal-site surface reads. */
  siteCapabilities: TalentSiteCapabilities;
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

/**
 * The tier label, read at CALL time (never captured at module load) so the
 * Pro fold flips with `TALENT_FREE_WEBSITE_ENABLED` and tests can exercise
 * both positions. `talent-tier-label.ts` is the single source of truth.
 */
function displayNameForTier(tier: TalentPlanTier): TalentMembershipState["displayName"] {
  return talentTierLabel(tier) as TalentMembershipState["displayName"];
}

const TALENT_PLAN_CAPABILITIES: Record<TalentPlanKey, ReadonlySet<TalentPlanCapability>> = {
  talent_basic: new Set<TalentPlanCapability>([
    "profile.basic",
    "personalSiteEdit",
    "personalSitePublish",
    // Free = a real site: pick and later switch Design, colours and fonts.
    "personalSiteDesignPresets",
  ]),
  talent_pro: new Set<TalentPlanCapability>([
    "profile.basic",
    "profile.enhanced",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteTemplate",
    "personalSiteDesignPresets",
  ]),
  talent_portfolio: new Set<TalentPlanCapability>([
    "profile.basic",
    "profile.enhanced",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteTemplate",
    "personalSiteDesignPresets",
    // Web Office — the paid half of the personal website.
    "personalSiteSections",
    "personalSitePages",
    "personalSiteSeo",
    "personalSiteAnalytics",
    // Portfolio-only — connect / verify / manage a custom domain for the
    // Portfolio site. The DB RLS on `talent_site_domains` enforces the same
    // gate (`talent_profile_has_max`) as a defense-in-depth backstop.
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
  const resolved = CAPABILITY_ALIASES[capability] ?? capability;
  const normalized = normalizeTalentPlanKey(planKey);
  if (
    !isTalentSiteTierExpansionEnabled() &&
    (resolved === "personalSiteEdit" || resolved === "personalSitePublish") &&
    normalized !== "talent_portfolio"
  ) {
    return false;
  }
  // Phase 1 keys are brand new: while the free website is dark, they resolve
  // Max-only so nothing they gate can widen before the switch flips.
  if (FREE_WEBSITE_CAPABILITIES.has(resolved) && !isTalentFreeWebsiteEnabled()) {
    return normalized === "talent_portfolio";
  }
  return TALENT_PLAN_CAPABILITIES[normalized].has(resolved);
}

/**
 * The SITE-scoped capability reader — the only one the personal-website gates,
 * the builder config and the public render path may use.
 *
 * It differs from `talentPlanGrantsCapability` in exactly one way: while
 * `TALENT_FREE_WEBSITE_ENABLED` is off, EVERY site capability resolves Max-only,
 * including `personalSiteEdit`, `personalSitePublish` and
 * `personalSiteCustomDomain`. That reproduces today's behaviour byte for byte —
 * only `talent_portfolio` renders a personal site or reaches its builder — while
 * leaving the general reader untouched for the `/t/[code]` discovery-profile
 * path, where Free talents legitimately edit and publish.
 */
export function talentPlanGrantsSiteCapability(
  planKey: string | null | undefined,
  capability: TalentSiteCapability,
): boolean {
  const normalized = normalizeTalentPlanKey(planKey);
  if (!isTalentFreeWebsiteEnabled()) {
    return normalized === "talent_portfolio";
  }
  return TALENT_PLAN_CAPABILITIES[normalized].has(capability);
}

/**
 * One boolean record for every personal-site capability on `planKey`. This is
 * the single shape threaded into the builder config, the site manager state and
 * the theme gallery, so a surface never re-derives a gate of its own.
 */
export function buildTalentSiteCapabilities(
  planKey: string | null | undefined,
): TalentSiteCapabilities {
  const out = {} as Record<TalentSiteCapability, boolean>;
  for (const key of TALENT_SITE_CAPABILITY_KEYS) {
    out[key] = talentPlanGrantsSiteCapability(planKey, key);
  }
  return out;
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
    displayName: displayNameForTier(tier),
    capabilities: {
      canBuildPersonalSite: canUseCustomBuilder,
      canEditPersonalSite,
      canPublishPersonalSite,
      canUseTemplateGallery,
      canUseCustomBuilder,
      canSetPersonalSiteTemplate: canUseTemplateGallery,
      canConnectPersonalSiteDomain: talentPlanGrantsCapability(planKey, "personalSiteCustomDomain"),
    },
    siteCapabilities: buildTalentSiteCapabilities(planKey),
  };
}

/**
 * Does the TALENT's own subscription tier remove the "Powered by Tulala" badge
 * from their public profile?
 *
 * Marketed on /pricing as a Pro benefit ("removes the Tulala badge"), so it
 * holds for Pro AND Max (Max is a superset of Pro). Free stays badged.
 *
 * Deliberately INDEPENDENT of the hosting tenant's whitelabel plan — the two
 * are separate grants and either one suffices. See the badge condition in
 * `app/t/[profileCode]/profile-view.tsx`.
 */
export function talentPlanRemovesPlatformBadge(
  planKey: string | null | undefined,
): boolean {
  const normalized = normalizeTalentPlanKey(planKey);
  return normalized === "talent_pro" || normalized === "talent_portfolio";
}

/**
 * Is this talent on the Max (Portfolio) tier? Gates the marketed Max-only
 * benefits that are not expressed as a `TalentPlanCapability` — page-level SEO
 * control on the public talent page, and priority Discover placement.
 */
export function isTalentPortfolioTier(
  planKey: string | null | undefined,
): boolean {
  return normalizeTalentPlanKey(planKey) === "talent_portfolio";
}
