import type { MetadataRoute } from "next";

import { applyAiCrawlerToggle } from "@/lib/cms/posts-public-model";
import { loadAiCrawlersAllowed, resolveAnyPostSite } from "@/lib/cms/posts-public-site";
import { getPublicHostContext } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { buildRobots } from "@/lib/seo/robots-rules";

/**
 * Host-aware robots.txt. Marketing, agency storefronts and talent site hosts
 * allow indexing (see `lib/seo/robots-rules.ts`); app (app shell), hub, and
 * unknown surfaces disallow all to keep auth flows, tenant admin tooling, and
 * unregistered hosts out of search indexes.
 *
 * Posts v1 (TUL-1010): on an agency or talent site whose "IA puede leer mi
 * sitio" toggle is OFF (`agency_branding` / `talent_sites.ai_crawlers_allowed`),
 * the AI crawlers get `Disallow: /` (`applyAiCrawlerToggle`).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostContext = await getPublicHostContext();
  // Sitemap: and Host: point at the host serving this request (tenant
  // storefront or talent site host); off-tenant surfaces use the platform base.
  const base = buildRobots(hostContext.kind, publicRequestSiteBase(hostContext));
  if (hostContext.kind !== "agency" && hostContext.kind !== "talent_site") return base;
  const site = await resolveAnyPostSite().catch(() => null);
  if (!site) return base;
  const allowed = await loadAiCrawlersAllowed(site.scope).catch(() => true);
  return applyAiCrawlerToggle(base, allowed);
}
