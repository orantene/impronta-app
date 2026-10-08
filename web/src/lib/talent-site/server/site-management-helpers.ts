import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import { talentSitePathUrl, talentSitePublicUrl } from "@/lib/talent-site/site-public-url";

/** Columns read for every managed page row (extracted from site-management-actions.ts). */
export const PAGE_COLUMNS =
  "id, slug, title, nav_label, status, is_home, sort_order, published_at, updated_at";

/** Dashboard public address: host when subdomains are on, else `/t/site/<slug>`. */
export function siteUrl(slug: string | null, isDemo = false): string | null {
  if (!slug) return null;
  if (isTalentSiteSubdomainsEnabled()) {
    const hostUrl = talentSitePublicUrl(slug, { isDemo });
    if (hostUrl) return hostUrl;
  }
  return talentSitePathUrl(slug);
}
