/**
 * Shared owner + CAPABILITY gate for the Talent site server actions.
 *
 * Extracted from `site-management-actions.ts` so the logo lane
 * (`site-logo-actions.ts`) can reuse the exact same check rather than
 * duplicating it — that file is a `"use server"` module and every export
 * there becomes a callable server action, so the gate cannot live in it.
 *
 * Phase 1 — `gate()` takes the capability the action actually needs
 * (`personalSiteEdit`, `personalSitePages`, `personalSiteDesignPresets`, …)
 * instead of the one blanket Max check. Every capability is read through
 * `talentPlanGrantsSiteCapability`, so while `TALENT_FREE_WEBSITE_ENABLED` is
 * off they ALL resolve Max-only and each call site behaves exactly as it did
 * before the split — including the refusal copy, which stays on the old
 * "Upgrade to Max…" string until the switch flips.
 *
 * Plain module on purpose (no `"use server"`, no `server-only`): the
 * marker breaks the tsx test lanes that lack the polyfill.
 */

import { isTalentFreeWebsiteEnabled } from "@/lib/access/talent-free-website";
import {
  buildTalentSiteCapabilities,
  talentPlanGrantsSiteCapability,
  type TalentSiteCapabilities,
  type TalentSiteCapability,
} from "@/lib/access/talent-membership";
import { requireTalentSelf, siteCapabilityDeniedMessage } from "@/lib/server/talent-self-guard";
import type { MaxSiteActionResult } from "./site-management-types";

export type GateOk = {
  ok: true;
  talentProfileId: string;
  displayName: string;
  profileCode: string | null;
  userId: string;
  planKey: string;
  /** Every personal-site capability for this talent's plan, resolved once. */
  capabilities: TalentSiteCapabilities;
};
export type GateFail = Extract<MaxSiteActionResult, { ok: false }>;

/** Legacy refusal string, kept verbatim for the flags-off path. */
const LEGACY_PLAN_REQUIRED = "Upgrade to Max to build and manage your website.";

/** Web Office refusal copy per capability (en + es via the guard's helper). */
function deniedMessage(capability: TalentSiteCapability, locale?: string | null): string {
  if (!isTalentFreeWebsiteEnabled()) return LEGACY_PLAN_REQUIRED;
  switch (capability) {
    case "personalSitePages":
      return siteCapabilityDeniedMessage("site_pages", locale);
    case "personalSiteSections":
      return siteCapabilityDeniedMessage("site_sections", locale);
    case "personalSiteSeo":
      return siteCapabilityDeniedMessage("site_seo", locale);
    case "personalSiteAnalytics":
      return siteCapabilityDeniedMessage("site_analytics", locale);
    case "personalSiteCustomDomain":
      return siteCapabilityDeniedMessage("site_custom_domain", locale);
    case "personalSiteDesignPresets":
      return siteCapabilityDeniedMessage("design_presets", locale);
    default:
      return siteCapabilityDeniedMessage("site_edit", locale);
  }
}

/**
 * Resolve the signed-in talent + assert ONE capability. Every management action
 * funnels through this so the owner + plan checks live in one place. A plan
 * without the capability gets `plan_required` (the dashboard shows an upsell,
 * never a 404).
 *
 * The default is `personalSiteSections` — the Web Office key the old blanket
 * gate was equivalent to — so a caller that has not been re-gated yet keeps the
 * strictest behaviour rather than silently opening up.
 */
export async function gate(
  capability: TalentSiteCapability = "personalSiteSections",
  opts?: { locale?: string | null },
): Promise<GateOk | GateFail> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!talentPlanGrantsSiteCapability(scope.planKey, capability)) {
    return {
      ok: false,
      code: "plan_required",
      error: deniedMessage(capability, opts?.locale),
    };
  }
  return {
    ok: true,
    talentProfileId: scope.talentProfile.id,
    displayName: scope.talentProfile.displayName,
    profileCode: scope.talentProfile.profileCode,
    userId: scope.session.user.id,
    planKey: scope.planKey,
    capabilities: buildTalentSiteCapabilities(scope.planKey),
  };
}
