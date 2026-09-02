import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { withLocalePath } from "@/i18n/pathnames";
import { SPANISH_NAMED_MARKETING_PATHS } from "@/lib/seo/spanish-named-routes";
import { COMPARISONS, comparisonPaths } from "@/lib/marketing/compare";
import { buildLocaleAlternates } from "@/i18n/alternates";
import { getPublicHostContext, getPublicTenantScope } from "@/lib/saas/scope";
import { publicRequestSiteBase } from "@/lib/seo/request-base";
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";
import { isTalentProfilePlatformHost } from "@/lib/talent-site/platform-host";
import { TALENT_CATEGORIES } from "@/lib/marketing/talent-categories";
import { RESOURCE_ARTICLES } from "@/lib/marketing/resources";
import {
  FEATURE_HUB_PATHS,
  MARKETING_FEATURES,
  featurePaths,
} from "@/lib/marketing/features";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

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
const MARKETING_CONTENT_REVISED = new Date("2026-09-02T00:00:00.000Z");

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

    const enUrl = new URL(`/t/${code}`, PLATFORM_TALENT_SITEMAP_BASE).toString();
    const esUrl = new URL(
      withLocalePath(`/t/${code}`, "es"),
      PLATFORM_TALENT_SITEMAP_BASE,
    ).toString();
    // Both locales of one profile are one page in two languages; say so, or
    // Google reads them as unrelated duplicates.
    const languages = { en: enUrl, es: esUrl, "x-default": enUrl };

    return [
      { url: enUrl, lastModified, alternates: { languages } },
      { url: esUrl, lastModified, alternates: { languages } },
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
      // The human support promise page. One path, both locales.
      "/support",
      // Platform contact form. Single slug; /contact and /es/contact both serve.
      // Do not add to SPANISH_NAMED_MARKETING_PATHS.
      "/contact",
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
      // Website-tier landing pair. `/websites` is the EN route and
      // `/sitios-web` the Spanish-first SEO sibling (same relationship as
      // /agencies <-> /agencia-de-talento). Both serve both locales, so the
      // flatMap emits four URLs: /websites, /es/websites, /sitios-web,
      // /es/sitios-web.
      "/websites",
      "/sitios-web",
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
    // The feature hub is emitted separately from `marketingPaths`, because the
    // generic flatMap below assumes both locales share ONE path. These pages
    // do not: the Spanish page lives at a Spanish slug, which is the whole
    // reason it exists. Running them through the flatMap would advertise
    // `/es/features/<en-slug>` twins that redirect away, so the pairs are
    // built explicitly from the catalogue instead.
    const featureEntries: MetadataRoute.Sitemap = [
      FEATURE_HUB_PATHS,
      ...MARKETING_FEATURES.map((f) => featurePaths(f)),
    ].flatMap(({ enPath, esPath }) => {
      const lastModified = MARKETING_CONTENT_REVISED;
      const enUrl = new URL(enPath, base).toString();
      const esUrl = new URL(withLocalePath(esPath, "es"), base).toString();
      const languages = { en: enUrl, es: esUrl, "x-default": enUrl };
      return [
        { url: enUrl, lastModified, alternates: { languages } },
        { url: esUrl, lastModified, alternates: { languages } },
      ];
    });

    // Comparison pages, same cross-slug shape as features: each locale has its
    // own path, so they cannot go through the generic flatMap without
    // advertising twins that redirect away.
    const comparisonEntries: MetadataRoute.Sitemap = COMPARISONS.flatMap((c) => {
      const { enPath, esPath } = comparisonPaths(c);
      const lastModified = MARKETING_CONTENT_REVISED;
      const enUrl = new URL(enPath, base).toString();
      const esUrl = new URL(withLocalePath(esPath, "es"), base).toString();
      const languages = { en: enUrl, es: esUrl, "x-default": enUrl };
      return [
        { url: enUrl, lastModified, alternates: { languages } },
        { url: esUrl, lastModified, alternates: { languages } },
      ];
    });

    const marketingEntries: MetadataRoute.Sitemap = marketingPaths.flatMap(
      (path) => {
        // EN and ES ship together, so both locales share one lastmod.
        const lastModified = marketingLastModified(path);
        const enUrl = new URL(path, base).toString();
        const esUrl = new URL(withLocalePath(path, "es"), base).toString();
        // A Spanish-NAMED route has no English version. It renders Spanish at
        // BOTH URLs (pinned in proxy.ts) and canonicalises to the /es/ form, so
        // advertising the un-prefixed twin would list a URL whose own canonical
        // points elsewhere — that is how an English-at-a-Spanish-URL page
        // became crawlable in the first place. Same principle as the `fr` note
        // below: an hreflang pointing at the wrong language is worse than none.
        if ((SPANISH_NAMED_MARKETING_PATHS as readonly string[]).includes(path)) {
          const esOnly = { es: esUrl, "x-default": esUrl };
          return [{ url: esUrl, lastModified, alternates: { languages: esOnly } }];
        }
        // EN + ES only. `fr` is enabled in the global app_locales registry but
        // has zero translated marketing content, so it must not be annotated
        // here — an hreflang pointing at an untranslated page is a worse signal
        // than no hreflang at all.
        const languages = { en: enUrl, es: esUrl, "x-default": enUrl };
        return [
          { url: enUrl, lastModified, alternates: { languages } },
          { url: esUrl, lastModified, alternates: { languages } },
        ];
      },
    );
    return [...marketingEntries, ...featureEntries, ...comparisonEntries, ...platformTalentEntries];
  }
  if (isTalentProfilePlatformHost(hostContext.kind)) {
    return platformTalentEntries;
  }
  if (hostContext.kind !== "agency") {
    return [];
  }

  // The storefront's OWN language set, not a hardcoded EN/ES pair. Most tenants
  // are solo-language: listing `/es/models` for an English-only agency
  // advertised a URL that only ever serves fallback content, and annotating it
  // as a Spanish alternate would have been a false statement to every crawler.
  const localeSettings = await loadTenantLocaleSettings(hostContext.tenantId);

  /**
   * One sitemap entry per locale a path exists in, each carrying the full
   * alternate set so the `<url>` declares the relationship instead of leaving
   * the locales looking like unrelated duplicates. A solo-language tenant gets
   * exactly one entry with no `alternates` at all.
   */
  function localeEntries(
    pathnameWithoutLocale: string,
    lastModified: Date,
    locales: readonly string[] = localeSettings.supportedLocales,
  ): MetadataRoute.Sitemap {
    return locales.map((locale) => {
      const alt = buildLocaleAlternates({
        origin: base,
        pathnameWithoutLocale,
        currentLocale: locale,
        defaultLocale: localeSettings.defaultLocale,
        supportedLocales: locales,
      });
      return {
        url: alt.canonical,
        lastModified,
        ...(alt.languages ? { alternates: { languages: alt.languages } } : {}),
      };
    });
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
    (path) => localeEntries(path, new Date()),
  );

  if (!supabase) {
    // No DB client, so the homepage row (and its updated_at) is unreadable.
    return [...localeEntries("/", new Date()), ...fixedStaticEntries];
  }

  // Non-agency contexts (hub/marketing/app) have no tenant-specific CMS.
  // Only agency storefronts expose cms_pages / cms_posts in their sitemap.
  const publicScope = await getPublicTenantScope();
  if (!publicScope) {
    // Same as above: without a tenant scope there is no homepage row to date.
    return [...localeEntries("/", new Date()), ...fixedStaticEntries];
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
      : localeEntries("/", homepageLastModified);

  const staticEntries: MetadataRoute.Sitemap = [
    ...homepageEntries,
    ...fixedStaticEntries,
  ];

  type CmsSitemapRow = { slug: string; locale: string; updated_at: string | null };

  /**
   * Sitemap entries for per-locale CMS rows. Rows are grouped by slug so each
   * URL can declare the OTHER translations of the same page; a slug with one
   * row emits one entry and no `alternates`.
   */
  function cmsRowEntries(
    rows: readonly CmsSitemapRow[],
    pathPrefix: string,
  ): MetadataRoute.Sitemap {
    const localesBySlug = new Map<string, string[]>();
    for (const row of rows) {
      const list = localesBySlug.get(row.slug);
      if (list) list.push(row.locale);
      else localesBySlug.set(row.slug, [row.locale]);
    }
    return rows.map((row) => {
      const locales = localesBySlug.get(row.slug) ?? [row.locale];
      const alt = buildLocaleAlternates({
        origin: base,
        pathnameWithoutLocale: `${pathPrefix}/${row.slug}`,
        currentLocale: row.locale,
        defaultLocale: localeSettings.defaultLocale,
        supportedLocales: locales,
      });
      return {
        url: alt.canonical,
        lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
        ...(alt.languages ? { alternates: { languages: alt.languages } } : {}),
      };
    });
  }

  const { data: pagesRaw } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("slug,locale,updated_at,is_system_owned")
    .eq("include_in_sitemap", true)
    .eq("noindex", false);
  // System-owned rows (the legacy homepage row, slug "", and seeded system
  // pages like __directory__ / __site_shell__) are already covered by
  // `homepageEntries` (or aren't real crawlable URLs at all) — without this
  // filter they leak in here as "/p/" and "/p/__directory__" because
  // `include_in_sitemap` defaults TRUE at the column and this RPC doesn't
  // otherwise distinguish system pages from real CMS pages. Filter in
  // TypeScript rather than a migration since the RPC already returns the
  // full row (SETOF cms_pages, including is_system_owned).
  const pages = ((pagesRaw ?? []) as unknown as (CmsSitemapRow & {
    is_system_owned: boolean | null;
  })[]).filter(
    (row) => !row.is_system_owned && row.slug !== "" && !row.slug.startsWith("__"),
  );

  // CMS rows, posts, and talent profiles below all prefer their real
  // updated_at. The `new Date()` fallbacks fire only when a row has no
  // timestamp at all, where there is no honest date to publish.
  //
  // CMS content is per-locale ROWS, so the alternate set for a slug is the
  // locales that actually have a row — never the tenant's full supported list.
  // A page written in English only must not be annotated as having a Spanish
  // version; that URL 404s.
  const cmsEntries: MetadataRoute.Sitemap = cmsRowEntries(pages, "/p");

  const { data: postsRaw } = await supabase
    .rpc("cms_public_posts_for_tenant", { p_tenant_id: publicScope.tenantId })
    .select("slug,locale,updated_at")
    .eq("include_in_sitemap", true)
    .eq("noindex", false);
  const posts = (postsRaw ?? []) as unknown as CmsSitemapRow[];

  const postEntries: MetadataRoute.Sitemap = cmsRowEntries(posts, "/posts");

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
    .neq("profile_kind", "resource")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5000); // Sitemap spec allows 50k; 5k is plenty for a single agency.
  const talents = (talentRows ?? []) as TalentSitemapRow[];

  const talentEntries: MetadataRoute.Sitemap = talents.flatMap((row) => {
    const code = encodeURIComponent(row.profile_code);
    const lastModified = row.updated_at ? new Date(row.updated_at) : new Date();
    // A profile page is framework-rendered, so it exists in every locale the
    // tenant supports.
    return localeEntries(`/t/${code}`, lastModified);
  });

  return [...staticEntries, ...cmsEntries, ...postEntries, ...talentEntries];
}
