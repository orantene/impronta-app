import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicHostContext, getPublicTenantScope } from "@/lib/saas/scope";
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";
import { isTalentProfilePlatformHost } from "@/lib/talent-site/platform-host";
import { pickLocale } from "@/lib/i18n/pick-locale";

const PLATFORM_TALENT_SITEMAP_BASE = `https://${TULALA_APEX_HOST}`;

async function loadPlatformTalentSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  type PlatformTalentSitemapRow = {
    published_at: string | null;
    updated_at: string | null;
    talent_profiles:
      | {
          profile_code: string | null;
          visibility: string | null;
          deleted_at: string | null;
          is_publicly_hidden: boolean | null;
        }
      | {
          profile_code: string | null;
          visibility: string | null;
          deleted_at: string | null;
          is_publicly_hidden: boolean | null;
        }[]
      | null;
  };

  const { data: rowsRaw } = await admin
    .from("talent_sites")
    .select(
      "published_at, updated_at, talent_profiles!inner(profile_code, visibility, deleted_at, is_publicly_hidden)",
    )
    .eq("status", "published")
    .not("published_snapshot", "is", null)
    .eq("talent_profiles.visibility", "public")
    .is("talent_profiles.deleted_at", null)
    .eq("talent_profiles.is_publicly_hidden", false)
    .order("published_at", { ascending: false })
    .limit(5000);

  const rows = (rowsRaw ?? []) as unknown as PlatformTalentSitemapRow[];
  return rows.flatMap((row) => {
    const profile = Array.isArray(row.talent_profiles)
      ? row.talent_profiles[0]
      : row.talent_profiles;
    const profileCode = profile?.profile_code?.trim();
    if (!profileCode) return [];

    const code = encodeURIComponent(profileCode);
    const lastModified = row.published_at || row.updated_at
      ? new Date(row.published_at ?? row.updated_at!)
      : new Date();

    return [
      {
        url: new URL(`/t/${code}`, PLATFORM_TALENT_SITEMAP_BASE).toString(),
        lastModified,
      },
      {
        url: new URL(
          withLocalePath(`/t/${code}`, "es"),
          PLATFORM_TALENT_SITEMAP_BASE,
        ).toString(),
        lastModified,
      },
    ];
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicSiteMetadataBase();
  const supabase = await createClient();

  // Each host-kind advertises only the routes its surface-allow-list permits,
  // so we never publish a manifest of dead links. Hub/app/unknown still return
  // empty; agency returns storefront routes; marketing returns its static tree.
  const hostContext = await getPublicHostContext();
  const platformTalentEntries = isTalentProfilePlatformHost(hostContext.kind)
    ? await loadPlatformTalentSitemapEntries()
    : [];

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
    const marketingEntries: MetadataRoute.Sitemap = marketingPaths.map((path) => ({
      url: new URL(path, base).toString(),
      lastModified: new Date(),
    }));
    return [...marketingEntries, ...platformTalentEntries];
  }
  if (isTalentProfilePlatformHost(hostContext.kind)) {
    return platformTalentEntries;
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

  // Read the homepage row's noindex + sitemap flags so the sitemap honours an
  // admin who flipped "hide from search engines" or "Show in sitemap" in the
  // homepage SEO panel. Default behaviour (row missing or query failure):
  // include "/" — losing the homepage from the sitemap is worse than over-
  // including it.
  type HomepageSeoRow = {
    noindex: boolean | null;
    include_in_sitemap: boolean | null;
    updated_at: string | null;
  };
  // Read via cms_public_pages_for_tenant (sets the app.current_tenant_id GUC so
  // the cms_pages RLS policy admits the row for the anon sitemap request) — a
  // direct .from("cms_pages") read returns ZERO rows here, exactly like the page
  // + post reads below already avoid. Published-only is fine: a live site's
  // homepage is published, and an unpublished one safely defaults to included.
  const { data: homepageRows } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("noindex,include_in_sitemap,updated_at")
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
  // include_in_sitemap defaults TRUE at the column; only an explicit `false`
  // removes "/" from the manifest (matches the non-home page gate below).
  const anyHomepageExcludedFromSitemap = [...homepageByLocale.values()].some(
    (row) => row.include_in_sitemap === false,
  );

  const homepageEntries: MetadataRoute.Sitemap =
    anyHomepageNoindex || anyHomepageExcludedFromSitemap
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
    const path = pickLocale(locale, { en: `/p/${slug}`, es: withLocalePath(`/p/${slug}`, "es") });
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
    const path = pickLocale(locale, { en: `/posts/${slug}`, es: withLocalePath(`/posts/${slug}`, "es") });
    return {
      url: new URL(path, base).toString(),
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  });

  // Phase G PR 1 — include the agency's published roster in the sitemap.
  // Without this, talent profile pages (`/t/<profileCode>`) are crawlable
  // but undiscoverable through any manifest. We scope to talents whose
  // provenance points at THIS tenant (created_by_agency_id) so the
  // agency's sitemap doesn't accidentally advertise the entire platform.
  // Both EN and ES paths are listed; the talent page emits hreflang
  // alternates so duplicate-content signals consolidate on the canonical.
  type TalentSitemapRow = { profile_code: string; updated_at: string | null };
  const rosterClient = createServiceRoleClient() ?? supabase;
  const { data: talentRows } = await rosterClient
    .from("talent_profiles")
    .select("profile_code, updated_at")
    .eq("created_by_agency_id", publicScope.tenantId)
    .in("workflow_status", ["approved", "published"])
    .eq("visibility", "public")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5000); // Sitemap spec allows 50k; 5k is plenty for a single agency.
  const talents = (talentRows ?? []) as TalentSitemapRow[];

  const talentEntries: MetadataRoute.Sitemap = talents.flatMap((row) => {
    const code = encodeURIComponent(row.profile_code);
    const lastModified = row.updated_at ? new Date(row.updated_at) : new Date();
    return [
      { url: new URL(`/t/${code}`, base).toString(), lastModified },
      {
        url: new URL(withLocalePath(`/t/${code}`, "es"), base).toString(),
        lastModified,
      },
    ];
  });

  return [...staticEntries, ...cmsEntries, ...postEntries, ...talentEntries];
}
