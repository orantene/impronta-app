import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import {
  groupTopPages,
  groupTopReferrers,
  type SitePageViewRow,
  type TopPageRow,
  type TopReferrerRow,
} from "@/lib/analytics/website-analytics-group";

/**
 * loadWebsiteAnalytics — the REAL first-party website-analytics loader
 * (ANALYTICS-2). Reads `analytics_events` rows where `name = view_site_page`,
 * scoped to one tenant and bounded by a date range (Supabase free-tier: the
 * window keeps the scan small), then groups them into top-pages (by
 * `payload.page_slug`) and top-referrers (by `payload.referrer`).
 *
 * This is the SHARED loader every public surface feeds via SitePageViewAnalytics
 * — storefront, talent-profile, and talent-site all write `view_site_page`, so
 * one loader aggregates all of them into the same admin WebsitePerformance panel
 * (replacing the Phase-C fixture zero in `mergeWebsiteStateFromBridge`).
 *
 * Best-effort: any failure returns the all-zero shape so the panel renders
 * cleanly (its top-performer tables already filter to `visits > 0`).
 */

export type WebsiteAnalyticsBucket = {
  visits: number;
  topPages: TopPageRow[];
  topReferrers: TopReferrerRow[];
};

export type WebsiteAnalyticsData = {
  refreshedAt: string;
  /** Visits + grouped top-pages/top-referrers for the trailing 7-day window. */
  last7d: WebsiteAnalyticsBucket;
  /** Visits + grouped top-pages/top-referrers for the trailing 30-day window. */
  last30d: WebsiteAnalyticsBucket;
};

const EMPTY_BUCKET: WebsiteAnalyticsBucket = {
  visits: 0,
  topPages: [],
  topReferrers: [],
};

export function emptyWebsiteAnalytics(): WebsiteAnalyticsData {
  return {
    refreshedAt: new Date().toISOString(),
    last7d: { ...EMPTY_BUCKET },
    last30d: { ...EMPTY_BUCKET },
  };
}

/** Bound the grouped scan to a trailing window so the free-tier query stays cheap. */
function windowStartIso(days: number): string {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

type RawRow = {
  created_at: string;
  path: string | null;
  payload: unknown;
};

/** Coerce a fetched analytics row into the typed grouping shape. */
function toViewRow(row: RawRow): SitePageViewRow {
  return {
    created_at: row.created_at,
    path: row.path,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null,
  };
}

function bucketFromRows(rows: readonly SitePageViewRow[]): WebsiteAnalyticsBucket {
  return {
    visits: rows.length,
    topPages: groupTopPages(rows),
    topReferrers: groupTopReferrers(rows),
  };
}

/**
 * Load grouped page-view analytics for a tenant. Reads ONE 30-day window of
 * `view_site_page` rows and derives the 7-day bucket in-memory (one query, both
 * windows) to minimise free-tier load. Returns zeros on any error.
 */
export async function loadWebsiteAnalytics(
  tenantId: string,
): Promise<WebsiteAnalyticsData> {
  if (!tenantId) return emptyWebsiteAnalytics();

  const supabase = createServiceRoleClient();
  if (!supabase) return emptyWebsiteAnalytics();

  const start30Iso = windowStartIso(30);
  const start7Iso = windowStartIso(7);

  try {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("created_at, path, payload")
      .eq("tenant_id", tenantId)
      .eq("name", PRODUCT_ANALYTICS_EVENTS.view_site_page)
      .gte("created_at", start30Iso)
      // Cap the scan — a tenant should never have >5k page views in 30d on the
      // free tier; the bound keeps the read within egress limits.
      .order("created_at", { ascending: false })
      .limit(5000)
      .returns<RawRow[]>();

    if (error || !data) return emptyWebsiteAnalytics();

    const rows30 = data.map(toViewRow);
    const rows7 = rows30.filter((r) => r.created_at >= start7Iso);

    return {
      refreshedAt: new Date().toISOString(),
      last7d: bucketFromRows(rows7),
      last30d: bucketFromRows(rows30),
    };
  } catch {
    return emptyWebsiteAnalytics();
  }
}
