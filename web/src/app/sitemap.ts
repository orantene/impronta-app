import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicTenantScope } from "@/lib/saas/scope";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteMetadataBase();
  const supabase = await createClient();

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

  const { data: pages } = await supabase
    .from("cms_pages")
    .select("slug,locale,updated_at")
    .eq("tenant_id", publicScope.tenantId)
    .eq("status", "published")
    .eq("include_in_sitemap", true)
    .eq("noindex", false);

  const cmsEntries: MetadataRoute.Sitemap = (pages ?? []).map((row) => {
    const slug = row.slug as string;
    const locale = row.locale as string;
    const path = locale === "es" ? withLocalePath(`/p/${slug}`, "es") : `/p/${slug}`;
    return {
      url: new URL(path, base).toString(),
      lastModified: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    };
  });

  const { data: posts } = await supabase
    .from("cms_posts")
    .select("slug,locale,updated_at")
    .eq("tenant_id", publicScope.tenantId)
    .eq("status", "published")
    .eq("include_in_sitemap", true)
    .eq("noindex", false);

  const postEntries: MetadataRoute.Sitemap = (posts ?? []).map((row) => {
    const slug = row.slug as string;
    const locale = row.locale as string;
    const path = locale === "es" ? withLocalePath(`/posts/${slug}`, "es") : `/posts/${slug}`;
    return {
      url: new URL(path, base).toString(),
      lastModified: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    };
  });

  return [...staticEntries, ...cmsEntries, ...postEntries];
}
