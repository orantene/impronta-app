/**
 * The `<main>` of a talent policy page, for `renderMaxSiteDocument`. The site
 * shell (header, theme tokens, footer and its socket) wraps it exactly as it
 * wraps any page, so the page is themed by construction.
 */

import type { ReactNode } from "react";

import { TalentPolicyDocument } from "@/components/public-booking/TalentPolicyDocument";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildPolicyPage, loadPolicyPage, type PolicyDoc, type PolicyPageModel } from "@/lib/talent-policies/public";

import type { MaxSiteSeo } from "./render-max-site";

export async function loadTalentPolicyModel(talentProfileId: string, doc: PolicyDoc, locale: string): Promise<PolicyPageModel> {
  const admin = createServiceRoleClient();
  if (!admin) return buildPolicyPage({ doc, locale, published: null });
  return loadPolicyPage(admin, { talentProfileId, doc, locale });
}

export function policyMainNode(
  model: PolicyPageModel,
  opts: { homeHref?: string } = {},
): ReactNode {
  return (
    <div
      data-talent-policy-page=""
      style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 132px", width: "100%", boxSizing: "border-box" }}
    >
      <TalentPolicyDocument model={model} homeHref={opts.homeHref} />
    </div>
  );
}

/** Title the policy page on its own; the canonical and alternates stay as built. */
export function policySeo(seo: MaxSiteSeo, model: PolicyPageModel): MaxSiteSeo {
  return { ...seo, title: model.title, description: undefined, ogTitle: model.title, ogDescription: undefined, jsonLd: undefined };
}
