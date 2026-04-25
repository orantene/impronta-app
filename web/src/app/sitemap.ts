import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicHostContext, getPublicTenantScope } from "@/lib/saas/scope";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteMetadataBase();
  const supabase = await createClient();

  // Each host-kind advertises only the routes its surface-allow-list permits,
  // so we never publish a manifest of dead links. Hub/app/unknown still return
  // empty; agency returns storefront routes; marketing returns its static tree.
  const hostContext = await getPublicHostContext();
  if (hostContext.kind === "marketing") {
    const marketingPaths = [
      "/",
      "/get-started",
      "/operators",
      "/agencies",
      "/organizations",
      "/how-it-works",
      "/network",
      "/pricing",
      "/faq",
      "/legal/privacy",
      "/legal/terms",
    ];
    return marketingPaths.map((path) => ({
      url: new URL(path, base).toString(),
      lastModified: new Date(),
    }));
  }
  if (hostContext.kind !== "agency") {
    return [];
  }

  // Static pages always present on agency storefronts. The homepage ("/")
  // is conditional — included only when the operator has not flagged the
  // homepage row noindex=true. The other paths are framework-owned and
  // always indexable.
  const fixedStaticPaths = ["/contact", "/directory", "/models"];

  const fixedStaticEntries: MetadataRoute.Sitemap = fixedStaticPaths.flatMap(
    (path) => [
      { url: new URL(path, base).toString(), lastModified: new Date() },
      {
        url: new URL(withLocalePath(path, "es"), base).toString(),
        lastModified: new Date(),
      },
    ],
  );

  if (!supabase) {
    return [
      { url: new URL("/", base).toString(), lastModified: new Date() },
      ...fixedStaticEntries,
    ];
  }

  // Non-agency contexts (hub/marketing/app) have no tenant-specific CMS.
  // Only agency storefronts expose cms_pages / cms_posts in their sitemap.
  const publicScope = await getPublicTenantScope();
  if (!publicScope) {
    return [
      { url: new URL("/", base).toString(), lastModified: new Date() },
      ...fixedStaticEntries,
    ];
  }

  // Read the homepage row's noindex flag so the sitemap honours an admin
  // who flipped "hide from search engines" in the homepage SEO panel.
  // Default behaviour (row missing or query failure): include "/" — losing
  // the homepage from the sitemap is worse than over-including it.
  type HomepageSeoRow = {
    noindex: boolean | null;
    updated_at: string | null;
  };
  const { data: homepageRows } = await supabase
    .from("cms_pages")
    .select("noindex,updated_at")
    .eq("tenant_id", publicScope.tenantId)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage");
  const homepageByLocale = new Map<string, HomepageSeoRow>();
  // Per-locale homepage rows; each entry's noindex governs that locale's "/".
  // We don't have locale on this read because the storefront sitemap conflates
  // all locales — use the most-recently-updated row as the conservative gate
  // (any locale being noindex hides the canonical "/").
  if (Array.isArray(homepageRows)) {
    for (const row of homepageRows) {
      homepageByLocale.set(
        row.updated_at ?? String(homepageByLocale.size),
        row as HomepageSeoRow,
      );
    }
  }
  const anyHomepageNoindex = [...homepageByLocale.values()].some(
    (row) => row.noindex === true,
  );

  const homepageEntries: MetadataRoute.Sitemap = anyHomepageNoindex
    ? []
    : [
        { url: new URL("/", base).toString(), lastModified: new Date() },
        {
          url: new URL(withLocalePath("/", "es"), base).toString(),
          lastModified: new Date(),
        },
      ];

  const staticEntries: MetadataRoute.Sitemap = [
    ...homepageEntries,
    ...fixedStaticEntries,
  ];

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
