/**
 * Pure projection of agency branding tokens onto the CSS vars `/account` reads
 * (TUL-158). Talent sites set `--site-*-font` in `loadAccountSite`; agency hosts
 * already project `--token-color-*` from root layout, but without these aliases
 * `ClientAccountArea` falls through to platform fonts / neutral fallbacks.
 */

import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";

export type AgencyAccountSiteProjection = {
  tokens: Record<string, string>;
  cssVars: Record<string, string>;
  dataAttrs: Record<string, string>;
};

/** Map resolved design tokens → html css vars + `--site-*-font` aliases. */
export function projectAgencyAccountSiteTokens(
  tokens: Record<string, string>,
): AgencyAccountSiteProjection {
  const hasTokens = Object.keys(tokens).length > 0;
  if (!hasTokens) return { tokens: {}, cssVars: {}, dataAttrs: {} };
  const cssVars = designTokensToCssVars(tokens);
  const heading = tokens["typography.heading-font-family"]?.trim();
  const body = tokens["typography.body-font-family"]?.trim();
  if (heading) cssVars["--site-heading-font"] = heading;
  if (body) cssVars["--site-body-font"] = body;
  return {
    tokens,
    cssVars,
    dataAttrs: designTokensToDataAttrs(tokens),
  };
}
