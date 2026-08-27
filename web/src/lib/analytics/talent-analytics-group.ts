/**
 * Pure aggregation helpers for the talent-scoped page analytics reader.
 *
 * Kept dependency-free (no Supabase import) so the maths unit-tests without a
 * DB, exactly like `website-analytics-group.ts` does for the workspace-side
 * loader. `talent-analytics.ts` fetches the raw rows; these functions turn them
 * into the shape the talent dashboard renders.
 *
 * HONESTY CONTRACT — read before adding a field here.
 * Every number this module produces is derived from rows that actually exist:
 *   • views          ← `analytics_events` rows, name = `view_talent_profile`,
 *                      `talent_id` column = this talent.
 *   • uniqueViewers  ← distinct non-null `session_id` on those same rows.
 *   • inquiries      ← `inquiry_participants` rows for this talent joined to
 *                      their inquiry's `created_at`.
 *   • conversionRate ← inquiries / views over the SAME window.
 * Anything that cannot be derived from those inputs (Discover rank, accept
 * rate, average day rate) is deliberately NOT modelled here — the UI omits the
 * tile rather than rendering a zero that reads as a measurement.
 */

/** One page-view event row, reduced to the two fields the maths needs. */
export type TalentViewRow = {
  /** ISO timestamp (`analytics_events.created_at`). */
  created_at: string;
  /** `analytics_events.session_id` — null on rows written before session ids. */
  session_id: string | null;
};

/** One inquiry the talent was named on, reduced to its creation timestamp. */
export type TalentInquiryRow = {
  /** ISO timestamp of the parent inquiry's `created_at`. */
  created_at: string;
};

/** Views + inquiries + the derived conversion for one trailing window. */
export type TalentAnalyticsBucket = {
  /** Total profile views in the window. */
  views: number;
  /** Distinct sessions that produced those views (rows with no session id are
   *  each counted as one anonymous viewer — never silently dropped). */
  uniqueViewers: number;
  /** Inquiries this talent was named on, created inside the window. */
  inquiries: number;
  /**
   * inquiries / views, as a percentage rounded to one decimal. `null` when
   * there were no views — a rate with an empty denominator is undefined, and
   * showing 0% there would be the exact fabrication this build removes.
   */
  conversionRatePct: number | null;
};

export type TalentPageAnalyticsData = {
  refreshedAt: string;
  last7d: TalentAnalyticsBucket;
  last30d: TalentAnalyticsBucket;
  /** The PRIOR 7-day window (days 8-14) — the real baseline behind the 7d
   *  delta. Derived in-memory from the same 30d fetch, no extra query. */
  prior7d: TalentAnalyticsBucket;
  /**
   * Percent change in views, 7d vs the prior 7d, rounded to a whole number.
   * `null` when the prior window had zero views: "up ∞%" is not a fact, so the
   * UI shows the raw count with no trend rather than inventing one.
   */
  viewsTrendPct: number | null;
  /** Per-UTC-day view counts across the trailing 30d window, oldest first. */
  viewsByDay30: TalentDailyViews[];
};

/** One UTC calendar day of views. */
export type TalentDailyViews = { date: string; views: number };

export const EMPTY_TALENT_BUCKET: TalentAnalyticsBucket = {
  views: 0,
  uniqueViewers: 0,
  inquiries: 0,
  conversionRatePct: null,
};

export function emptyTalentPageAnalytics(): TalentPageAnalyticsData {
  return {
    refreshedAt: new Date().toISOString(),
    last7d: { ...EMPTY_TALENT_BUCKET },
    last30d: { ...EMPTY_TALENT_BUCKET },
    prior7d: { ...EMPTY_TALENT_BUCKET },
    viewsTrendPct: null,
    viewsByDay30: [],
  };
}

/**
 * ISO-8601 strings produced by `Date#toISOString` (and returned by PostgREST
 * for `timestamptz`) share a timezone suffix, so lexicographic comparison is an
 * exact chronological comparison. Every window filter below relies on that.
 */
function inWindow(iso: string, fromIso: string, toIso?: string): boolean {
  if (iso < fromIso) return false;
  return toIso === undefined || iso < toIso;
}

/** Count distinct sessions; each session-less row counts as its own viewer. */
export function countUniqueViewers(rows: readonly TalentViewRow[]): number {
  const sessions = new Set<string>();
  let anonymous = 0;
  for (const row of rows) {
    if (row.session_id) sessions.add(row.session_id);
    else anonymous += 1;
  }
  return sessions.size + anonymous;
}

/** inquiries / views as a 1-decimal percentage; null when views is 0. */
export function conversionRatePct(views: number, inquiries: number): number | null {
  if (views <= 0) return null;
  return Math.round((inquiries / views) * 1000) / 10;
}

function bucketOf(
  views: readonly TalentViewRow[],
  inquiries: readonly TalentInquiryRow[],
): TalentAnalyticsBucket {
  return {
    views: views.length,
    uniqueViewers: countUniqueViewers(views),
    inquiries: inquiries.length,
    conversionRatePct: conversionRatePct(views.length, inquiries.length),
  };
}

/** Whole-percent change between two counts; null when the baseline is 0. */
export function trendPct(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

/**
 * Bucket view rows into per-UTC-day counts across the trailing `days` window,
 * oldest first and zero-filled, so a sparkline has no gaps.
 */
export function bucketViewsByDay(
  rows: readonly TalentViewRow[],
  opts: { days: number; endIso: string },
): TalentDailyViews[] {
  const end = new Date(opts.endIso);
  if (Number.isNaN(end.getTime()) || opts.days <= 0) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const out: TalentDailyViews[] = [];
  const cursor = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  cursor.setUTCDate(cursor.getUTCDate() - (opts.days - 1));
  for (let i = 0; i < opts.days; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, views: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Fold ONE 30-day row set into the {last7d, prior7d, last30d} shape. Pure —
 * this is the testable core that proves the window slicing, the unique-viewer
 * de-duplication and the conversion maths without touching a database.
 */
export function groupTalentPageAnalytics(input: {
  /** Start of the trailing 7-day window. */
  start7Iso: string;
  /** Start of the prior 7-day window (14 days back). */
  start14Iso: string;
  /** Start of the trailing 30-day window. */
  start30Iso: string;
  views30: readonly TalentViewRow[];
  inquiries30: readonly TalentInquiryRow[];
  /** Injected for deterministic tests; defaults to now. */
  nowIso?: string;
}): TalentPageAnalyticsData {
  const nowIso = input.nowIso ?? new Date().toISOString();

  const views7 = input.views30.filter((r) => inWindow(r.created_at, input.start7Iso));
  const viewsPrior7 = input.views30.filter((r) =>
    inWindow(r.created_at, input.start14Iso, input.start7Iso),
  );
  const inquiries7 = input.inquiries30.filter((r) =>
    inWindow(r.created_at, input.start7Iso),
  );
  const inquiriesPrior7 = input.inquiries30.filter((r) =>
    inWindow(r.created_at, input.start14Iso, input.start7Iso),
  );

  return {
    refreshedAt: nowIso,
    last7d: bucketOf(views7, inquiries7),
    prior7d: bucketOf(viewsPrior7, inquiriesPrior7),
    last30d: bucketOf(input.views30, input.inquiries30),
    viewsTrendPct: trendPct(views7.length, viewsPrior7.length),
    viewsByDay30: bucketViewsByDay(input.views30, { days: 30, endIso: nowIso }),
  };
}
