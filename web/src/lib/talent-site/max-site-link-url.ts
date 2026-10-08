/**
 * Which address the hub links to for a talent's published Max site. PURE.
 *
 * Precedence: primary active custom domain, then the `<slug>.tulala.digital`
 * subdomain (only while `TALENT_SITE_SUBDOMAINS_ENABLED` is on, and only for a
 * usable label), then the `/t/site/<slug>` path. An absolute subdomain URL keeps
 * "Visit my site" and the Book deep link on the talent's own host instead of a
 * relative hub path that the subdomain redirect has to rescue.
 */
import { talentSitePathUrl, talentSitePublicUrl } from "@/lib/talent-site/site-public-url";

export function resolveMaxSiteLinkUrl(input: {
  customDomain: string | null | undefined;
  siteSlug: string | null | undefined;
  isDemo?: boolean;
  subdomainsEnabled: boolean;
}): string | null {
  const domain = input.customDomain?.trim();
  if (domain) return `https://${domain}`;
  if (input.subdomainsEnabled) {
    const hosted = talentSitePublicUrl(input.siteSlug, { isDemo: input.isDemo === true });
    if (hosted) return hosted;
  }
  return talentSitePathUrl(input.siteSlug);
}
