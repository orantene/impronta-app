import type { MetadataRoute } from "next";

import { getPublicHostContext } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { buildRobots } from "@/lib/seo/robots-rules";

/**
 * Host-aware robots.txt. Marketing, agency storefronts and talent site hosts
 * allow indexing (see `lib/seo/robots-rules.ts`); app (app shell), hub, and
 * unknown surfaces disallow all to keep auth flows, tenant admin tooling, and
 * unregistered hosts out of search indexes.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostContext = await getPublicHostContext();
  // Sitemap: and Host: point at the host serving this request (tenant
  // storefront or talent site host); off-tenant surfaces use the platform base.
  return buildRobots(hostContext.kind, publicRequestSiteBase(hostContext));
}
