/**
 * talent-entitlements.ts — THE talent plan -> feature map (TUL-837).
 *
 * One typed map (`TALENT_ENTITLEMENTS`) and one reader (`hasEntitlement`) for
 * every talent feature that a plan unlocks. Server gates and UI both call
 * `hasEntitlement(plan, feature)`; nothing else compares plan keys to decide a
 * feature.
 *
 * INSTANT UNLOCK: this module is pure and holds no cache. Callers pass the plan
 * key they just read from `talent_profiles.talent_plan_key`, which the TUL-836
 * webhook writer (`applyTalentPlanState`) updates on every Stripe event and
 * follows with `onTalentPlanChanged` (which busts the talent-site cache tags).
 * So an upgrade is visible on the next request, with no stale plan anywhere.
 *
 * The feature set per plan below is a byte-for-byte transcription of what the
 * code granted before consolidation; it is NOT a pricing decision.
 *
 * PURE on purpose: no `server-only`, no Supabase. The two dark-launch switches
 * are read at call time so tests can flip them.
 */

import { isDunningExpired } from "../billing/dunning-grace";
import { isTalentFreeWebsiteEnabled } from "./talent-free-website";
import { isTalentSiteTierExpansionEnabled } from "./talent-site-tier-expansion";

export const TALENT_ENTITLEMENT_PLAN_KEYS = [
  "talent_basic",
  "talent_pro",
  "talent_portfolio",
] as const;

export type TalentEntitlementPlanKey = (typeof TALENT_ENTITLEMENT_PLAN_KEYS)[number];

/** Personal-website features; gated by the free-website dark-launch switch. */
export const TALENT_SITE_ENTITLEMENTS = [
  "personalSiteEdit",
  "personalSitePublish",
  "personalSiteDesignPresets",
  "personalSiteSections",
  "personalSitePages",
  "personalSiteSeo",
  "personalSiteAnalytics",
  "personalSiteCustomDomain",
] as const;

export type TalentSiteEntitlement = (typeof TALENT_SITE_ENTITLEMENTS)[number];

export type TalentEntitlement =
  | TalentSiteEntitlement
  | "profile.basic"
  | "profile.enhanced"
  | "personalSiteTemplate"
  /** Removes the "Powered by Tulala" badge (marketed Pro benefit). */
  | "profile.noPlatformBadge"
  /** Page-level SEO control on the public `/t/` page. */
  | "profile.pageSeo"
  /** Priority placement in Discover / directory. */
  | "discover.priority"
  /** Instant booking: appointments run at the "website" policy tier. */
  | "booking.instant"
  /** Booking-assistant AI credits at the paid band. */
  | "ai.paidCredits"
  /** The Max site link shown on the profile. */
  | "personalSite.link";

export const TALENT_ENTITLEMENTS: Readonly<
  Record<TalentEntitlementPlanKey, ReadonlySet<TalentEntitlement>>
> = {
  talent_basic: new Set<TalentEntitlement>([
    "profile.basic",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteDesignPresets",
  ]),
  talent_pro: new Set<TalentEntitlement>([
    "profile.basic",
    "profile.enhanced",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteTemplate",
    "personalSiteDesignPresets",
    "profile.noPlatformBadge",
    "ai.paidCredits",
  ]),
  talent_portfolio: new Set<TalentEntitlement>([
    "profile.basic",
    "profile.enhanced",
    "personalSiteEdit",
    "personalSitePublish",
    "personalSiteTemplate",
    "personalSiteDesignPresets",
    "personalSiteSections",
    "personalSitePages",
    "personalSiteSeo",
    "personalSiteAnalytics",
    // DB RLS on talent_site_domains enforces the same gate (talent_profile_has_max).
    "personalSiteCustomDomain",
    "profile.noPlatformBadge",
    "profile.pageSeo",
    "discover.priority",
    "booking.instant",
    "ai.paidCredits",
    "personalSite.link",
  ]),
};

/** Site keys that did not exist before the free-website switch: Max-only while it is off. */
const FREE_WEBSITE_ENTITLEMENTS: ReadonlySet<TalentEntitlement> = new Set([
  "personalSiteDesignPresets",
  "personalSiteSections",
  "personalSitePages",
  "personalSiteSeo",
  "personalSiteAnalytics",
]);

export function normalizeEntitlementPlanKey(
  value: string | null | undefined,
): TalentEntitlementPlanKey {
  const v = value?.trim();
  if ((TALENT_ENTITLEMENT_PLAN_KEYS as readonly string[]).includes(v ?? "")) {
    return v as TalentEntitlementPlanKey;
  }
  if (v === "pro") return "talent_pro";
  if (v === "max") return "talent_portfolio";
  return "talent_basic";
}

export type EntitlementScope = "general" | "site";

/**
 * Does `plan` unlock `feature`? The ONE entitlement read.
 *
 * `scope: "site"` is the personal-website reader: while the free-website switch
 * is off every site feature is Max-only. `"general"` (default) keeps the
 * `/t/[code]` discovery-profile behaviour where Free edits and publishes.
 */
export function hasEntitlement(
  plan: string | null | undefined,
  feature: TalentEntitlement,
  scope: EntitlementScope = "general",
): boolean {
  const normalized = normalizeEntitlementPlanKey(plan);
  const isSiteFeature = (TALENT_SITE_ENTITLEMENTS as readonly string[]).includes(feature);
  if (scope === "site" && isSiteFeature) {
    if (!isTalentFreeWebsiteEnabled()) return normalized === "talent_portfolio";
    return TALENT_ENTITLEMENTS[normalized].has(feature);
  }
  if (
    !isTalentSiteTierExpansionEnabled() &&
    (feature === "personalSiteEdit" || feature === "personalSitePublish") &&
    normalized !== "talent_portfolio"
  ) {
    return false;
  }
  if (FREE_WEBSITE_ENTITLEMENTS.has(feature) && !isTalentFreeWebsiteEnabled()) {
    return normalized === "talent_portfolio";
  }
  return TALENT_ENTITLEMENTS[normalized].has(feature);
}

/** Every feature `plan` unlocks right now (for UI that renders a feature list). */
export function entitlementsForPlan(
  plan: string | null | undefined,
  scope: EntitlementScope = "general",
): TalentEntitlement[] {
  const all = new Set<TalentEntitlement>();
  for (const set of Object.values(TALENT_ENTITLEMENTS)) for (const f of set) all.add(f);
  return [...all].filter((f) => hasEntitlement(plan, f, scope));
}

export type TalentBillingSnapshot = {
  status: string | null | undefined;
  pastDueSince: string | null | undefined;
};

/**
 * TUL-835 grace policy. The plan whose entitlements apply right now: the stored
 * plan, except a subscription past_due beyond the 7-day grace window reads as
 * Free (content is kept, features lock). Feed the result to `hasEntitlement`.
 * Pure: pass `now` in tests.
 */
export function effectiveEntitlementPlan(
  plan: string | null | undefined,
  billing: TalentBillingSnapshot | null | undefined,
  now: Date = new Date(),
): string {
  if (billing && isDunningExpired({ status: billing.status, pastDueSince: billing.pastDueSince, now })) {
    return "talent_basic";
  }
  return plan ?? "talent_basic";
}
