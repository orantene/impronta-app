import test from "node:test";
import assert from "node:assert/strict";

import {
  bucketViewsByDay,
  conversionRatePct,
  countUniqueViewers,
  emptyTalentPageAnalytics,
  groupTalentPageAnalytics,
  trendPct,
  type TalentInquiryRow,
  type TalentViewRow,
} from "@/lib/analytics/talent-analytics-group";

/**
 * These tests pin the HONESTY guarantees of the talent page-analytics reader,
 * not just its arithmetic:
 *   • a conversion rate with a zero denominator is `null`, never 0%
 *   • a trend against a zero baseline is `null`, never "+0%" or "+100%"
 *   • unique viewers never silently drop rows that carry no session id
 * A regression on any of those would put a fabricated number back on a paying
 * talent's dashboard, which is the exact failure this build exists to fix.
 */

const NOW = "2026-08-21T12:00:00.000Z";
const START_7 = "2026-08-14T00:00:00.000Z";
const START_14 = "2026-08-07T00:00:00.000Z";
const START_30 = "2026-07-22T00:00:00.000Z";

function view(iso: string, sessionId: string | null = "s1"): TalentViewRow {
  return { created_at: iso, session_id: sessionId };
}
function inquiry(iso: string): TalentInquiryRow {
  return { created_at: iso };
}

// ── conversionRatePct ───────────────────────────────────────────────────────

test("conversionRatePct is null with no views — an undefined rate, not 0%", () => {
  assert.equal(conversionRatePct(0, 0), null);
  assert.equal(conversionRatePct(0, 3), null);
});

test("conversionRatePct rounds to one decimal", () => {
  assert.equal(conversionRatePct(300, 7), 2.3);
  assert.equal(conversionRatePct(4, 1), 25);
});

// ── trendPct ────────────────────────────────────────────────────────────────

test("trendPct is null against a zero baseline", () => {
  assert.equal(trendPct(12, 0), null);
  assert.equal(trendPct(0, 0), null);
});

test("trendPct computes whole-percent change in both directions", () => {
  assert.equal(trendPct(150, 100), 50);
  assert.equal(trendPct(50, 100), -50);
  assert.equal(trendPct(100, 100), 0);
});

// ── countUniqueViewers ──────────────────────────────────────────────────────

test("countUniqueViewers de-duplicates by session id", () => {
  assert.equal(countUniqueViewers([view(NOW, "a"), view(NOW, "a"), view(NOW, "b")]), 2);
});

test("countUniqueViewers counts each session-less row rather than dropping it", () => {
  assert.equal(countUniqueViewers([view(NOW, null), view(NOW, null), view(NOW, "a")]), 3);
});

test("countUniqueViewers is 0 for no rows", () => {
  assert.equal(countUniqueViewers([]), 0);
});

// ── bucketViewsByDay ────────────────────────────────────────────────────────

test("bucketViewsByDay zero-fills every UTC day in the window, oldest first", () => {
  const out = bucketViewsByDay(
    [
      view("2026-08-21T01:00:00.000Z"),
      view("2026-08-21T09:00:00.000Z"),
      view("2026-08-19T09:00:00.000Z"),
    ],
    { days: 4, endIso: NOW },
  );
  assert.deepEqual(out, [
    { date: "2026-08-18", views: 0 },
    { date: "2026-08-19", views: 1 },
    { date: "2026-08-20", views: 0 },
    { date: "2026-08-21", views: 2 },
  ]);
});

test("bucketViewsByDay returns [] for a non-positive window or unparseable end", () => {
  assert.deepEqual(bucketViewsByDay([view(NOW)], { days: 0, endIso: NOW }), []);
  assert.deepEqual(bucketViewsByDay([view(NOW)], { days: 7, endIso: "nonsense" }), []);
});

// ── groupTalentPageAnalytics ────────────────────────────────────────────────

const VIEWS_30: TalentViewRow[] = [
  // last 7d — 3 views from 2 sessions
  view("2026-08-20T10:00:00.000Z", "a"),
  view("2026-08-19T10:00:00.000Z", "a"),
  view("2026-08-15T10:00:00.000Z", "b"),
  // prior 7d (days 8-14) — 2 views
  view("2026-08-12T10:00:00.000Z", "c"),
  view("2026-08-08T10:00:00.000Z", "d"),
  // older, inside 30d only
  view("2026-07-30T10:00:00.000Z", "e"),
];
const INQUIRIES_30: TalentInquiryRow[] = [
  inquiry("2026-08-18T10:00:00.000Z"), // last 7d
  inquiry("2026-08-10T10:00:00.000Z"), // prior 7d
  inquiry("2026-07-25T10:00:00.000Z"), // 30d only
];

const RESULT = groupTalentPageAnalytics({
  start7Iso: START_7,
  start14Iso: START_14,
  start30Iso: START_30,
  views30: VIEWS_30,
  inquiries30: INQUIRIES_30,
  nowIso: NOW,
});

test("groups the 7d window out of the single 30d fetch", () => {
  assert.equal(RESULT.last7d.views, 3);
  assert.equal(RESULT.last7d.uniqueViewers, 2);
  assert.equal(RESULT.last7d.inquiries, 1);
});

test("derives the prior 7d window (days 8-14) from the same rows", () => {
  assert.equal(RESULT.prior7d.views, 2);
  assert.equal(RESULT.prior7d.inquiries, 1);
});

test("keeps the 30d bucket as the full row set", () => {
  assert.equal(RESULT.last30d.views, 6);
  assert.equal(RESULT.last30d.uniqueViewers, 5);
  assert.equal(RESULT.last30d.inquiries, 3);
});

test("computes the views trend against the real prior window", () => {
  assert.equal(RESULT.viewsTrendPct, 50); // 3 vs 2
});

test("computes conversion from views and inquiries in the SAME window", () => {
  assert.equal(RESULT.last30d.conversionRatePct, 50); // 3 / 6
  assert.equal(RESULT.last7d.conversionRatePct, 33.3); // 1 / 3
});

test("emits a zero-filled 30-day daily series that accounts for every row", () => {
  assert.equal(RESULT.viewsByDay30.length, 30);
  assert.equal(RESULT.viewsByDay30[0]?.date, "2026-07-23");
  assert.equal(RESULT.viewsByDay30[29]?.date, "2026-08-21");
  // The series total must equal the 30d bucket total — a daily chart that
  // disagrees with the tile above it is how a dashboard starts lying.
  assert.equal(
    RESULT.viewsByDay30.reduce((n, d) => n + d.views, 0),
    RESULT.last30d.views,
  );
});

test("never fabricates a rate or a trend when there is no data at all", () => {
  const empty = groupTalentPageAnalytics({
    start7Iso: START_7,
    start14Iso: START_14,
    start30Iso: START_30,
    views30: [],
    inquiries30: [],
    nowIso: NOW,
  });
  assert.equal(empty.last7d.views, 0);
  assert.equal(empty.last7d.conversionRatePct, null);
  assert.equal(empty.last30d.conversionRatePct, null);
  assert.equal(empty.viewsTrendPct, null);
});

test("reports no trend when this is the talent's first week with views", () => {
  const firstWeek = groupTalentPageAnalytics({
    start7Iso: START_7,
    start14Iso: START_14,
    start30Iso: START_30,
    views30: [view("2026-08-20T10:00:00.000Z", "a")],
    inquiries30: [],
    nowIso: NOW,
  });
  assert.equal(firstWeek.last7d.views, 1);
  assert.equal(firstWeek.viewsTrendPct, null);
});

test("counts inquiries with no views without inventing a conversion rate", () => {
  // Possible in practice: an inquiry arrives via the roster/agency, not the
  // public profile page. The count is real; the rate is not computable.
  const noViews = groupTalentPageAnalytics({
    start7Iso: START_7,
    start14Iso: START_14,
    start30Iso: START_30,
    views30: [],
    inquiries30: [inquiry("2026-08-18T10:00:00.000Z")],
    nowIso: NOW,
  });
  assert.equal(noViews.last7d.inquiries, 1);
  assert.equal(noViews.last7d.conversionRatePct, null);
});

test("emptyTalentPageAnalytics is the safe shape on a failed read", () => {
  const empty = emptyTalentPageAnalytics();
  assert.equal(empty.last7d.conversionRatePct, null);
  assert.equal(empty.viewsTrendPct, null);
  assert.deepEqual(empty.viewsByDay30, []);
});
