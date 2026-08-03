import type { MetadataRoute } from "next";

import { getPublicHostContext } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";

/**
 * Host-aware robots.txt. Marketing and agency storefronts allow indexing;
 * app (app shell), hub, and unknown surfaces disallow all to keep auth flows,
 * tenant admin tooling, and unregistered hosts out of search indexes.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostContext = await getPublicHostContext();
  // Point robots' Sitemap: and Host: at the host serving this request. On a
  // tenant storefront that is the tenant's own subdomain / custom domain, so
  // its sitemap and canonical host resolve to itself (Search Console needs
  // this); off-tenant surfaces fall back to the platform base unchanged.
  const base = publicRequestSiteBase(hostContext);
  const sitemap = new URL("/sitemap.xml", base).toString();

  if (hostContext.kind === "marketing" || hostContext.kind === "agency") {
    return {
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/api/", "/admin/", "/preview/", "/_vercel/"],
        },
      ],
      sitemap,
      host: base.host,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
