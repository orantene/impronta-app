/**
 * Pure grouping helpers for the first-party website-analytics loader
 * (ANALYTICS-2). Kept dependency-free so they unit-test without a Supabase
 * client: `loadWebsiteAnalytics` fetches the raw `view_site_page` rows, these
 * functions group them into the top-pages / top-referrers shapes the admin
 * WebsitePerformance panel consumes.
 */

/** A single `view_site_page` row as read from analytics_events (payload is jsonb). */
export type SitePageViewRow = {
  /** ISO timestamp of the event. */
  created_at: string;
  /** analytics_events.path — the URL path the view fired on. */
  path: string | null;
  /** Event payload. We read `page_slug`, `page_id`, `surface`, `referrer`. */
  payload: Record<string, unknown> | null;
};

export type TopPageRow = {
  /** The grouping key — `payload.page_slug` (falls back to `path`, then "/"). */
  pageSlug: string;
  /** `payload.page_id` of the first row seen for the slug, when present. */
  pageId: string | null;
  /** Distinct surfaces that contributed views to this slug. */
  surfaces: string[];
  visits: number;
};

export type TopReferrerRow = {
  /** The grouping key — host of `payload.referrer` ("direct" when absent). */
  referrer: string;
  visits: number;
};

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const v = payload?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Normalize a raw referrer string to a stable grouping key. Bare hostnames keep
 * their host; full URLs collapse to the host so `https://google.com/x` and
 * `https://google.com/y` group together. Empty/unparseable → "direct".
 */
export function normalizeReferrer(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "direct";
  try {
    const url = new URL(value);
    return url.host || "direct";
  } catch {
    // Not a full URL — strip any path and use the leading host-ish token.
    const host = value.replace(/^https?:\/\//i, "").split("/")[0]?.trim();
    return host || "direct";
  }
}

/** Group rows by `page_slug` (top-pages), descending by visit count. */
export function groupTopPages(rows: readonly SitePageViewRow[], limit = 8): TopPageRow[] {
  const acc = new Map<string, TopPageRow>();
  for (const row of rows) {
    const slug = payloadString(row.payload, "page_slug") ?? row.path ?? "/";
    const pageId = payloadString(row.payload, "page_id");
    const surface = payloadString(row.payload, "surface");
    const existing = acc.get(slug);
    if (existing) {
      existing.visits += 1;
      if (!existing.pageId && pageId) existing.pageId = pageId;
      if (surface && !existing.surfaces.includes(surface)) existing.surfaces.push(surface);
    } else {
      acc.set(slug, {
        pageSlug: slug,
        pageId,
        surfaces: surface ? [surface] : [],
        visits: 1,
      });
    }
  }
  return Array.from(acc.values())
    .sort((a, b) => b.visits - a.visits || a.pageSlug.localeCompare(b.pageSlug))
    .slice(0, limit);
}

/** Group rows by normalized `payload.referrer` (top-referrers), descending. */
export function groupTopReferrers(rows: readonly SitePageViewRow[], limit = 8): TopReferrerRow[] {
  const acc = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeReferrer(payloadString(row.payload, "referrer"));
    acc.set(key, (acc.get(key) ?? 0) + 1);
  }
  return Array.from(acc.entries())
    .map(([referrer, visits]) => ({ referrer, visits }))
    .sort((a, b) => b.visits - a.visits || a.referrer.localeCompare(b.referrer))
    .slice(0, limit);
}
