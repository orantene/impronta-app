import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicHostContext, getPublicTenantScope } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";
import { isTalentProfilePlatformHost } from "@/lib/talent-site/platform-host";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { TALENT_CATEGORIES } from "@/lib/marketing/talent-categories";
import { RESOURCE_ARTICLES } from "@/lib/marketing/resources";

const PLATFORM_TALENT_SITEMAP_BASE = `https://${TULALA_APEX_HOST}`;

/**
 * Stable revision date for the static marketing tree.
 *
 * These pages are hard-coded copy, so there is no row in the database to read
 * an honest `lastmod` from. Emitting `new Date()` told every crawler that every
 * marketing page changed at crawl time, which is obviously false and gets the
 * whole signal discounted. A pinned constant is both truthful and useful.
 *
 * BUMP THIS when marketing copy materially changes (new page, rewritten
 * positioning, pricing change). Do not bump it for code-only refactors.
 */
const MARKETING_CONTENT_REVISED = new Date("2026-07-23T00:00:00.000Z");

/**
 * Real publication date per resource article, keyed by its sitemap path.
 * Articles carry a `datePublished` in the content model, so they get their own
 * honest date rather than the shared marketing revision.
 */
const RESOURCE_ARTICLE_LAST_MODIFIED = new Map<string, Date>();
for (const article of RESOURCE_ARTICLES) {
  const parsed = new Date(`${article.datePublished}T00:00:00.000Z`);
  // A typo'd datePublished would otherwise emit `Invalid Date` into the XML.
  // Skip it and let the shared marketing revision cover that article.
  if (Number.isNaN(parsed.getTime())) continue;
  RESOURCE_ARTICLE_LAST_MODIFIED.set(`/resources/${article.slug}`, parsed);
}

function marketingLastModified(path: string): Date {
  return RESOURCE_ARTICLE_LAST_MODIFIED.get(path) ?? MARKETING_CONTENT_REVISED;
}

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
    // published_at/updated_at are the honest dates. The fallback stays
    // `new Date()` because a published site row with neither timestamp gives us
    // nothing truthful to assert, and dropping the entry would cost discovery.
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
  const supabase = await createClient();

  // Each host-kind advertises only the routes its surface-allow-list permits,
  // so we never publish a manifest of dead links. Hub/app/unknown still return
  // empty; agency returns storefront routes; marketing returns its static tree.
  const hostContext = await getPublicHostContext();
  // Anchor every emitted URL to the host actually serving this request: a
  // tenant storefront's sitemap must list URLs on the tenant's own host (a
  // Search Console prerequisite), not the fixed platform apex. Off-tenant
  // surfaces fall back to the platform base — unchanged behaviour.
  const base = publicRequestSiteBase(hostContext);
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
      // Company page (who runs Tulala, how support works). Serves EN at /about
      // and Spanish at /es/about, like the rest of this list.
      "/about",
      // Public global talent directory (served at /directory via the
      // proxy.ts rewrite to (marketing)/global-directory) — the demand-side
      // surface, so it belongs in the crawlable manifest.
      "/directory",
      // Spanish-first "agencia de talento" hire landing (Keyword Planner's
      // 100–1K/mo, LOW-competition term). The flatMap emits /agencia-de-talento
      // and /es/agencia-de-talento; the page serves both locales.
      "/agencia-de-talento",
      // "contratar modelos" hire landing — the one client-facing category page
      // the directory actually has supply for (models are the large majority of
      // the discoverable set). One page, both locales: the flatMap emits
      // /contratar-modelos and /es/contratar-modelos.
      "/contratar-modelos",
      // Supporting marketing pages. (/status and /waitlist are deliberately
      // excluded — operational pages, not content we want ranked.)
      "/integrations",
      "/discover-agencies",
      "/help",
      "/legal/privacy",
      "/legal/terms",
      // Talent-category landing pages, derived from the content model so
      // adding a category is a single data edit, not a sitemap edit too.
      ...TALENT_CATEGORIES.map((c) => `/for/${c.slug}`),
      // Resource hub, glossary, and each article, derived the same way.
      "/resources",
      "/resources/glossary",
      ...RESOURCE_ARTICLES.map((a) => `/resources/${a.slug}`),
    ];
    const marketingEntries: MetadataRoute.Sitemap = marketingPaths.flatMap(
      (path) => {
        // EN and ES ship together, so both locales share one lastmod.
        const lastModified = marketingLastModified(path);
        return [
          { url: new URL(path, base).toString(), lastModified },
          {
            url: new URL(withLocalePath(path, "es"), base).toString(),
            lastModified,
          },
        ];
      },
    );
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

  // These routes are framework-rendered from live tenant data (roster, contact
  // details), and no single row owns them, so there is no truthful timestamp to
  // read. Keeping `new Date()` here is deliberate: it is the crawl-time
  // "unknown", not a claim about the marketing tree, which now uses a pinned
  // revision constant.
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
    // No DB client, so the homepage row (and its updated_at) is unreadable.
    return [
      { url: new URL("/", base).toString(), lastModified: new Date() },
      ...fixedStaticEntries,
    ];
  }

  // Non-agency contexts (hub/marketing/app) have no tenant-specific CMS.
  // Only agency storefronts expose cms_pages / cms_posts in their sitemap.
  const publicScope = await getPublicTenantScope();
  if (!publicScope) {
    // Same as above: without a tenant scope there is no homepage row to date.
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

  // The homepage rows carry a real updated_at, so use the most recent one
  // instead of crawl time. Falls back to `new Date()` only when every row is
  // missing the timestamp (or the row itself is missing), where nothing
  // truthful is available.
  const homepageLastModified = [...homepageByLocale.values()].reduce<Date | null>(
    (latest, row) => {
      if (!row.updated_at) return latest;
      const parsed = new Date(row.updated_at);
      if (Number.isNaN(parsed.getTime())) return latest;
      return latest && latest >= parsed ? latest : parsed;
    },
    null,
  ) ?? new Date();

  const homepageEntries: MetadataRoute.Sitemap =
    anyHomepageNoindex || anyHomepageExcludedFromSitemap
    ? []
    : [
        {
          url: new URL("/", base).toString(),
          lastModified: homepageLastModified,
        },
        {
          url: new URL(withLocalePath("/", "es"), base).toString(),
          lastModified: homepageLastModified,
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

  // CMS rows, posts, and talent profiles below all prefer their real
  // updated_at. The `new Date()` fallbacks fire only when a row has no
  // timestamp at all, where there is no honest date to publish.
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
