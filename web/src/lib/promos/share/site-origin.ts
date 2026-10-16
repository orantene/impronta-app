import { talentSitePublicUrl } from "@/lib/talent-site/site-public-url";

/**
 * Origin a promo share link should live on: the talent's published site host
 * (`https://<slug>.tulala.digital`), else null so the caller uses the hub path
 * `/t/<code>/p/<slug>`. Pure.
 */
export function promoSiteOrigin(
  sites: readonly { site_slug: string | null; status: string | null }[],
  isDemo: boolean,
): string | null {
  const published = sites.find((s) => s.status === "published" && s.site_slug?.trim());
  if (!published) return null;
  return talentSitePublicUrl(published.site_slug!.trim(), { isDemo });
}
