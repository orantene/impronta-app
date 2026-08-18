import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { listPagesForStaff } from "@/lib/site-admin/server/pages-reads";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";
import {
  loadWebsiteAnalytics,
  emptyWebsiteAnalytics,
  loadWebsiteConversionMetrics,
  emptyWebsiteConversionMetrics,
  type WebsiteAnalyticsData,
  type WebsiteConversionMetrics,
} from "@/lib/analytics/website-analytics";
import { readTenantPageRoles } from "@/lib/site-admin/server/page-roles";
import { EMPTY_PAGE_ROLES } from "@/lib/site-admin/server/page-roles-shape";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  loadWorkspaceDomainSummary,
  type WorkspaceDomainSummary,
} from "./workspace-config";

/**
 * _data-bridge/website.ts — canonical Website settings page loader.
 *
 * Split out of `_data-bridge.ts` (rev 13). Single Promise.all fan-out for
 * pages, posts, redirects, SEO identity, and the domain summary so the
 * page renders in one round-trip.
 */

export type WebsitePageItem = {
  id: string;
  slug: string;
  title: string;
  status: string; // 'published' | 'draft' | 'archived'
  updatedAt: string | null;
  updatedBy: string | null;
  /** cms_pages.template_key — drives the Website surface card label. */
  templateKey: string | null;
  /**
   * `cms_pages.scheduled_publish_at` — future fire time set from the
   * editor's Schedule drawer, null when unscheduled. `status` above stays
   * whatever it already was until the cron sweep flips it; the Website →
   * Pages grid derives a UI-only "scheduled" status from this column (see
   * `state/website-page-status.ts`).
   */
  scheduledPublishAt: string | null;
  /** cms_pages.locale — a bilingual tenant seeds one row per locale per
   *  page, so the same slug can appear once per supported language. */
  locale: string;
  /** cms_pages.version — optimistic-concurrency counter, bumped on save. */
  version: number;
  /** cms_pages.noindex — robots noindex flag set from the SEO panel. */
  noindex: boolean;
  /** cms_pages.include_in_sitemap. */
  includeInSitemap: boolean;
  /**
   * True when `cms_pages.meta_description` is set (non-empty after trim).
   * Deliberately a presence flag, not the text itself — this bridge feeds
   * list/grid surfaces that only need to badge "SEO description missing",
   * not render the description. The full identity/SEO editors read
   * `cms_pages` directly when they need the text.
   */
  hasMetaDescription: boolean;
  /** cms_pages.published_at — null until the page has ever been published. */
  publishedAt: string | null;
  /**
   * cms_pages.system_template_key — used (alongside `homeSlug` below) to
   * detect the built-in homepage row when the tenant hasn't assigned a
   * `home` page-role override. NOT the same as `templateKey` above (the
   * staff-chosen section template).
   */
  systemTemplateKey: string | null;
};

export type WebsitePostItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string | null;
};

export type WebsiteRedirectItem = {
  id: string;
  oldPath: string;
  newPath: string;
  statusCode: number;
  active: boolean;
};

export type WebsiteData = {
  pages: WebsitePageItem[];
  posts: WebsitePostItem[];
  redirects: WebsiteRedirectItem[];
  seoTitle: string | null;
  seoDescription: string | null;
  /** `agency_business_identity.public_name` — the tenant's real display
   *  name. Used to derive SEO defaults (title / title template) instead of
   *  a hardcoded placeholder. Null when identity hasn't been set up yet. */
  tenantName: string | null;
  domainSummary: WorkspaceDomainSummary;
  /**
   * ANALYTICS-2 — real first-party page-view analytics for this tenant
   * (view_site_page rows grouped by page_slug / referrer). Replaces the Phase-C
   * fixture zero; `mergeWebsiteStateFromBridge` projects it into the panel shape.
   */
  analytics: WebsiteAnalyticsData;
  /**
   * ANALYTICS-1 — real tenant conversion metrics (inquiries / confirmed
   * bookings / settled revenue) for the 7d + 30d windows, read from
   * `inquiries` / `agency_bookings` / `booking_transactions`. Un-zeros the
   * money tiles in the WebsitePerformance panel.
   */
  conversion: WebsiteConversionMetrics;
  /**
   * P1-B — per-tenant page ROLE pointers (`agencies.settings.pageRoles`,
   * read via `readTenantPageRoles`). A null role means "use the built-in
   * default" (see `page-roles-shape.ts`); the `home` pointer in particular
   * lets `mergeWebsiteStateFromBridge` compute `WebsitePageRow.isHomepage`
   * without a second query — all three roles come back from one
   * `agencies.settings` read, so all three are exposed here even though
   * only `home` is consumed today.
   */
  homeSlug: string | null;
  directorySlug: string | null;
  notFoundSlug: string | null;
  /**
   * Tenant's primary language (`agency_business_identity.default_locale`
   * via `loadTenantLocaleSettings`). Exposed for a future Pages list
   * redesign to flag pages whose locale differs from the tenant default;
   * not consumed by any UI yet.
   */
  defaultLocale: string;
};

/**
 * Load all data needed for the canonical workspace Website page:
 * CMS pages, posts, redirects, SEO identity, and the live storefront URL.
 *
 * Returns a safe empty state on any error — the page renders gracefully.
 */
export async function loadWebsiteData(tenantId: string): Promise<WebsiteData> {
  const emptyDomainSummary: WorkspaceDomainSummary = {
    primaryHost: null,
    primaryHostKind: null,
    primaryHostStatus: null,
    subdomainHost: null,
    customDomainHost: null,
    customDomainStatus: null,
    customDomainVerifiedAt: null,
    verificationToken: null,
    failureReason: null,
    customDomains: [],
    subdomains: [],
  };
  const empty: WebsiteData = {
    pages: [], posts: [], redirects: [],
    seoTitle: null,
    seoDescription: null,
    tenantName: null,
    domainSummary: emptyDomainSummary,
    analytics: emptyWebsiteAnalytics(),
    conversion: emptyWebsiteConversionMetrics(),
    homeSlug: null,
    directorySlug: null,
    notFoundSlug: null,
    defaultLocale: "en",
  };
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const [pagesRaw, postsRes, redirectsRes, identity, domainSummary, analytics, conversion, pageRoles, localeSettings] = await Promise.all([
      listPagesForStaff(supabase, tenantId).catch(() => []),
      supabase
        .from("cms_posts")
        .select("id, slug, title, status, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("cms_redirects")
        .select("id, old_path, new_path, status_code, active, updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(50),
      loadIdentityForStaff(supabase, tenantId).catch(() => null),
      loadWorkspaceDomainSummary(tenantId).catch(() => emptyDomainSummary),
      loadWebsiteAnalytics(tenantId).catch(() => emptyWebsiteAnalytics()),
      loadWebsiteConversionMetrics(tenantId).catch(() => emptyWebsiteConversionMetrics()),
      readTenantPageRoles(supabase, tenantId).catch(() => EMPTY_PAGE_ROLES),
      loadTenantLocaleSettings(tenantId).catch(() => null),
    ]);

    type PostRow = { id: string; slug: string; title: string; status: string; updated_at: string | null };
    type RedirectRow = { id: string; old_path: string; new_path: string; status_code: number; active: boolean };

    return {
      // The site shell (`system_template_key = 'site_shell'`, slug
      // `__site_shell__`) is a header/footer composition row, not a
      // navigable page — one is seeded per supported locale, so a
      // bilingual tenant would otherwise show 2+ duplicate "site shell"
      // cards in the Website → Pages grid. Exclude it here so it never
      // reaches the grid, counts, or analytics matching.
      pages: pagesRaw
        .filter((p) => p.system_template_key !== "site_shell")
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          status: p.status,
          updatedAt: p.updated_at ?? null,
          updatedBy: p.updated_by ?? null,
          templateKey: p.template_key ?? null,
          scheduledPublishAt: p.scheduled_publish_at ?? null,
          locale: p.locale,
          version: p.version,
          noindex: p.noindex,
          includeInSitemap: p.include_in_sitemap,
          hasMetaDescription: !!p.meta_description?.trim(),
          publishedAt: p.published_at ?? null,
          systemTemplateKey: p.system_template_key ?? null,
        })),
      posts: ((postsRes.data ?? []) as unknown as PostRow[]).map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        updatedAt: p.updated_at,
      })),
      redirects: ((redirectsRes.data ?? []) as unknown as RedirectRow[]).map((r) => ({
        id: r.id,
        oldPath: r.old_path,
        newPath: r.new_path,
        statusCode: r.status_code,
        active: r.active,
      })),
      seoTitle: identity?.seo_default_title ?? null,
      seoDescription: identity?.seo_default_description ?? null,
      tenantName: identity?.public_name?.trim() || null,
      domainSummary,
      analytics,
      conversion,
      homeSlug: pageRoles.home,
      directorySlug: pageRoles.directory,
      notFoundSlug: pageRoles.notFound,
      defaultLocale: localeSettings?.defaultLocale ?? "en",
    };
  } catch (err) {
    logServerError("workspace.loadWebsiteData", err);
    return empty;
  }
}
