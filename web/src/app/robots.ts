import type { MetadataRoute } from "next";

import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { getPublicHostContext } from "@/lib/saas/scope";

/**
 * Host-aware robots.txt. Marketing and agency storefronts allow indexing;
 * app (app shell), hub, and unknown surfaces disallow all to keep auth flows,
 * tenant admin tooling, and unregistered hosts out of search indexes.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = publicSiteMetadataBase();
  const hostContext = await getPublicHostContext();
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
