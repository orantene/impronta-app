/**
 * Pick the Max-site `<main>` override + SEO for soft-404 / policy pages.
 * Keeps `render-max-site.tsx` under the 800-line gate.
 */

import type { ReactNode } from "react";

import type { PolicyPageModel } from "@/lib/talent-policies/public";

import type { MaxSiteSeo } from "./max-site-seo.server";
import { policyMainNode, policySeo } from "./policy-main";
import { soft404MainNode, soft404Seo } from "./soft-404-main";

export function talentSiteMainOverride(args: {
  soft404: boolean;
  locale: string;
  homeHref: string;
  policyModel: PolicyPageModel | null;
}): ReactNode | undefined {
  if (args.soft404) return soft404MainNode(args.locale, args.homeHref);
  if (args.policyModel) return policyMainNode(args.policyModel, { homeHref: args.homeHref });
  return undefined;
}

export function talentSiteFinalSeo(args: {
  soft404: boolean;
  locale: string;
  seo: MaxSiteSeo;
  policyModel: PolicyPageModel | null;
}): MaxSiteSeo {
  if (args.soft404) return soft404Seo(args.seo, args.locale);
  if (args.policyModel) return policySeo(args.seo, args.policyModel);
  return args.seo;
}
