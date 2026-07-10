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
  };
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const [pagesRaw, postsRes, redirectsRes, identity, domainSummary, analytics, conversion] = await Promise.all([
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
    };
  } catch (err) {
    logServerError("workspace.loadWebsiteData", err);
    return empty;
  }
}
