import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import {
  bucketVisitsByDay,
  countVisitsBetween,
  groupTopPages,
  groupTopReferrers,
  type DailyVisitBucket,
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
  /**
   * Visits in the PRIOR 7-day window (days 8-14), derived in-memory from the
   * same 30d fetch — the real baseline behind the 7d KPI delta. The 30d period
   * has NO prior here on purpose: a 30d baseline needs a 60d scan, which the
   * free-tier row cap does not leave room for, and inventing one would be the
   * exact lie this shape replaced.
   */
  prior7dVisits: number;
  /**
   * Per-UTC-day visit counts across the whole trailing 30d window (oldest
   * first, zero-filled). Derived from the event timestamps already in the 30d
   * fetch — no extra query.
   */
  visitsByDay30: DailyVisitBucket[];
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
    prior7dVisits: 0,
    visitsByDay30: [],
  };
}

/** Bound the grouped scan to a trailing window so the free-tier query stays cheap. */
function windowStartIso(days: number): string {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

// ── ANALYTICS-1 — conversion metrics ────────────────────────────────────────
//
// The WebsitePerformance panel previously zeroed inquiries / bookings /
// revenue (only page-view "visits" were wired). These derive from three
// tenant-scoped tables, each bounded by the SAME trailing windows the
// page-view loader uses so the free-tier scans stay small:
//
//   - inquiries:  table `inquiries`  (NOT `inquiry_records`, which does not
//     exist) — count rows scoped to the tenant + `created_at` in window,
//     excluding non-inquiry statuses (`draft`, `rejected`, `expired`,
//     `closed_lost`) so drafts and dead leads don't inflate the tile.
//   - bookings:   table `agency_bookings` — count `status IN
//     ('confirmed','completed')` scoped to the tenant. There is no
//     `confirmed_at` column, so the window is applied on `created_at`.
//   - revenue:    table `booking_transactions` — SUM of settled
//     `gross_amount_cents` (`status IN ('paid','payout_pending','payout_sent')`,
//     i.e. money captured and not refunded/failed/cancelled), scoped via
//     `source_tenant_id` and windowed on `paid_at` (the settlement timestamp).
//     Returned in MAJOR currency units (cents / 100) to match the panel's
//     dollar-denominated `revenue` field.
//
// All counts/sums are best-effort: any error yields zeros so the panel renders.

/** Inquiry statuses excluded from the "real inquiries" count (drafts + dead leads). */
const NON_COUNTABLE_INQUIRY_STATUSES = [
  "draft",
  "rejected",
  "expired",
  "closed_lost",
] as const;

/** agency_bookings statuses that count as a realised booking. */
const CONFIRMED_BOOKING_STATUSES = ["confirmed", "completed"] as const;

/** booking_transactions statuses that count as settled revenue (captured, not reversed). */
const SETTLED_TRANSACTION_STATUSES = ["paid", "payout_pending", "payout_sent"] as const;

/** Cap each conversion scan so a busy tenant can't blow the free-tier egress budget. */
const CONVERSION_SCAN_LIMIT = 5000;

export type ConversionBucket = {
  inquiries: number;
  bookings: number;
  /** Settled revenue in MAJOR currency units (dollars), summed across currencies. */
  revenue: number;
};

export type WebsiteConversionMetrics = {
  last7d: ConversionBucket;
  last30d: ConversionBucket;
  /**
   * The PRIOR 7-day window (days 8-14), derived from the same 30d row set —
   * the baseline behind the 7d KPI deltas. There is deliberately no prior30d:
   * that would need a 60d scan (see `WebsiteAnalyticsData.prior7dVisits`).
   */
  prior7d: ConversionBucket;
};

const EMPTY_CONVERSION_BUCKET: ConversionBucket = {
  inquiries: 0,
  bookings: 0,
  revenue: 0,
};

export function emptyWebsiteConversionMetrics(): WebsiteConversionMetrics {
  return {
    last7d: { ...EMPTY_CONVERSION_BUCKET },
    last30d: { ...EMPTY_CONVERSION_BUCKET },
    prior7d: { ...EMPTY_CONVERSION_BUCKET },
  };
}

export type ConversionRawRow = { created_at: string };
export type RevenueRawRow = { paid_at: string | null; gross_amount_cents: number | null };

/** Split a window's in-memory rows into the 7d subset by a timestamp accessor. */
function countWithin(rows: readonly ConversionRawRow[], sinceIso: string): number {
  return rows.reduce((n, r) => (r.created_at >= sinceIso ? n + 1 : n), 0);
}

/** Count rows whose `created_at` falls in `[fromIso, toIso)` — the prior-window slice. */
function countBetween(
  rows: readonly ConversionRawRow[],
  fromIso: string,
  toIso: string,
): number {
  return rows.reduce(
    (n, r) => (r.created_at >= fromIso && r.created_at < toIso ? n + 1 : n),
    0,
  );
}

function sumRevenueWithin(rows: readonly RevenueRawRow[], sinceIso: string): number {
  const cents = rows.reduce((sum, r) => {
    if (!r.paid_at || r.paid_at < sinceIso) return sum;
    return sum + (typeof r.gross_amount_cents === "number" ? r.gross_amount_cents : 0);
  }, 0);
  return Math.round(cents) / 100;
}

/** Sum settled revenue whose `paid_at` falls in `[fromIso, toIso)`. */
function sumRevenueBetween(
  rows: readonly RevenueRawRow[],
  fromIso: string,
  toIso: string,
): number {
  const cents = rows.reduce((sum, r) => {
    if (!r.paid_at || r.paid_at < fromIso || r.paid_at >= toIso) return sum;
    return sum + (typeof r.gross_amount_cents === "number" ? r.gross_amount_cents : 0);
  }, 0);
  return Math.round(cents) / 100;
}

/** Minimal supabase surface the conversion loader needs (so it is injectable in tests). */
type ConversionQueryClient = Pick<
  ReturnType<typeof createServiceRoleClient> & object,
  "from"
>;

/**
 * Group a single 30d row set into the {last7d,last30d} conversion shape, given
 * the window boundaries and per-table row arrays. Pure — the testable core that
 * proves the 7d-subset derivation + revenue summation independent of the DB.
 */
export function groupConversionMetrics(input: {
  start7Iso: string;
  /** Start of the PRIOR 7-day window (day 14 back). Optional so pre-existing
   *  callers keep compiling; without it prior7d is all zeros. */
  start14Iso?: string;
  start30Iso: string;
  inquiries30: readonly ConversionRawRow[];
  bookings30: readonly ConversionRawRow[];
  revenue30: readonly RevenueRawRow[];
}): WebsiteConversionMetrics {
  const prior7d: ConversionBucket = input.start14Iso
    ? {
        inquiries: countBetween(input.inquiries30, input.start14Iso, input.start7Iso),
        bookings: countBetween(input.bookings30, input.start14Iso, input.start7Iso),
        revenue: sumRevenueBetween(input.revenue30, input.start14Iso, input.start7Iso),
      }
    : { ...EMPTY_CONVERSION_BUCKET };
  return {
    last7d: {
      inquiries: countWithin(input.inquiries30, input.start7Iso),
      bookings: countWithin(input.bookings30, input.start7Iso),
      revenue: sumRevenueWithin(input.revenue30, input.start7Iso),
    },
    last30d: {
      inquiries: input.inquiries30.length,
      bookings: input.bookings30.length,
      revenue: sumRevenueWithin(input.revenue30, input.start30Iso),
    },
    prior7d,
  };
}

/**
 * Load tenant conversion metrics (inquiries / bookings / settled revenue) for
 * the trailing 7d + 30d windows. Reads the 30d window once per table and
 * derives the 7d bucket in-memory (3 queries total, both windows) to minimise
 * free-tier load. Returns zeros on any error. The supabase client is injectable
 * for tests; production passes the service-role client.
 */
export async function loadWebsiteConversionMetrics(
  tenantId: string,
  client?: ConversionQueryClient | null,
): Promise<WebsiteConversionMetrics> {
  if (!tenantId) return emptyWebsiteConversionMetrics();

  const supabase = client ?? createServiceRoleClient();
  if (!supabase) return emptyWebsiteConversionMetrics();

  const start30Iso = windowStartIso(30);
  const start14Iso = windowStartIso(14);
  const start7Iso = windowStartIso(7);

  try {
    const [inquiriesRes, bookingsRes, revenueRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .not("status", "in", `(${NON_COUNTABLE_INQUIRY_STATUSES.join(",")})`)
        .gte("created_at", start30Iso)
        .order("created_at", { ascending: false })
        .limit(CONVERSION_SCAN_LIMIT)
        .returns<ConversionRawRow[]>(),
      supabase
        .from("agency_bookings")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .in("status", [...CONFIRMED_BOOKING_STATUSES])
        .gte("created_at", start30Iso)
        .order("created_at", { ascending: false })
        .limit(CONVERSION_SCAN_LIMIT)
        .returns<ConversionRawRow[]>(),
      supabase
        .from("booking_transactions")
        .select("paid_at, gross_amount_cents")
        .eq("source_tenant_id", tenantId)
        .in("status", [...SETTLED_TRANSACTION_STATUSES])
        .gte("paid_at", start30Iso)
        .order("paid_at", { ascending: false })
        .limit(CONVERSION_SCAN_LIMIT)
        .returns<RevenueRawRow[]>(),
    ]);

    const inquiries30 = inquiriesRes.error ? [] : inquiriesRes.data ?? [];
    const bookings30 = bookingsRes.error ? [] : bookingsRes.data ?? [];
    const revenue30 = revenueRes.error ? [] : revenueRes.data ?? [];

    return groupConversionMetrics({
      start7Iso,
      start14Iso,
      start30Iso,
      inquiries30,
      bookings30,
      revenue30,
    });
  } catch {
    return emptyWebsiteConversionMetrics();
  }
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
  const start14Iso = windowStartIso(14);
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
      // Days 8-14, sliced from the same fetch. Caveat, stated rather than
      // hidden: the query is newest-first with a 5000-row cap, so a tenant
      // that actually hits the cap loses its OLDEST rows first — the prior
      // window (and the tail of visitsByDay30) would undercount before the
      // current window does. At today's traffic no tenant is near the cap.
      prior7dVisits: countVisitsBetween(rows30, start14Iso, start7Iso),
      visitsByDay30: bucketVisitsByDay(rows30, {
        days: 30,
        endIso: new Date().toISOString(),
      }),
    };
  } catch {
    return emptyWebsiteAnalytics();
  }
}
