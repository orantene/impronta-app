import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicHostContext, getPublicTenantScope } from "@/lib/saas/scope";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteMetadataBase();
  const supabase = await createClient();

  // Only the agency storefront surface advertises routes in sitemap.xml.
  // Hub/marketing/app/unknown hosts would list storefront paths (/directory,
  // /contact, /models) that the surface-allow-list 404s on those kinds —
  // returning them here would publish a manifest of dead links. Return an
  // empty sitemap instead.
  const hostContext = await getPublicHostContext();
  if (hostContext.kind !== "agency") {
    return [];
  }

  const staticPaths = ["/", "/contact", "/directory", "/models"];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.flatMap((path) => [
    { url: new URL(path, base).toString(), lastModified: new Date() },
    { url: new URL(withLocalePath(path, "es"), base).toString(), lastModified: new Date() },
  ]);

  if (!supabase) {
    return staticEntries;
  }

  // Non-agency contexts (hub/marketing/app) have no tenant-specific CMS.
  // Only agency storefronts expose cms_pages / cms_posts in their sitemap.
  const publicScope = await getPublicTenantScope();
  if (!publicScope) {
    return staticEntries;
  }

  type CmsSitemapRow = { slug: string; locale: string; updated_at: string | null };

  const { data: pagesRaw } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("slug,locale,updated_at")
    .eq("include_in_sitemap", true)
    .eq("noindex", false);
  const pages = (pagesRaw ?? []) as unknown as CmsSitemapRow[];

  const cmsEntries: MetadataRoute.Sitemap = pages.map((row) => {
    const slug = row.slug;
    const locale = row.locale;
    const path = locale === "es" ? withLocalePath(`/p/${slug}`, "es") : `/p/${slug}`;
    return {
      url: new URL(path, base).toString(),
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  });

  const { data: postsRaw } = await supabase
    .rpc("cms_public_posts_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("slug,locale,updated_at")
    .eq("include_in_sitemap", true)
    .eq("noindex", false);
  const posts = (postsRaw ?? []) as unknown as CmsSitemapRow[];

  const postEntries: MetadataRoute.Sitemap = posts.map((row) => {
    const slug = row.slug;
    const locale = row.locale;
    const path = locale === "es" ? withLocalePath(`/posts/${slug}`, "es") : `/posts/${slug}`;
    return {
      url: new URL(path, base).toString(),
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  });

  return [...staticEntries, ...cmsEntries, ...postEntries];
}
