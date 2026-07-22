import test from "node:test";
import assert from "node:assert/strict";

import {
  groupConversionMetrics,
  loadWebsiteConversionMetrics,
  emptyWebsiteConversionMetrics,
  type ConversionRawRow,
  type RevenueRawRow,
} from "@/lib/analytics/website-analytics";

// Offsets from "now" rather than fixed calendar dates: `loadWebsiteConversionMetrics`
// derives its 7d/30d windows from the real wall clock (see `windowStartIso` in
// website-analytics.ts), so hardcoded absolute dates eventually age out of that
// window and the loader tests below start failing on their own (no code change needed
// to "fix" them — the fixture just goes stale as calendar time passes).
const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const START_30 = new Date(NOW - 30 * DAY_MS).toISOString();
const START_7 = new Date(NOW - 7 * DAY_MS).toISOString();

// in window 30d but OUTSIDE 7d
const OLD = new Date(NOW - 20 * DAY_MS).toISOString();
// inside 7d
const RECENT = new Date(NOW - 2 * DAY_MS).toISOString();

// ── groupConversionMetrics — pure shape + window derivation ──────────────────

test("groupConversionMetrics: 30d count is all rows, 7d count is the recent subset", () => {
  const inquiries30: ConversionRawRow[] = [
    { created_at: RECENT },
    { created_at: RECENT },
    { created_at: OLD },
  ];
  const bookings30: ConversionRawRow[] = [{ created_at: RECENT }, { created_at: OLD }];
  const revenue30: RevenueRawRow[] = [];

  const out = groupConversionMetrics({
    start7Iso: START_7,
    start30Iso: START_30,
    inquiries30,
    bookings30,
    revenue30,
  });

  assert.equal(out.last30d.inquiries, 3);
  assert.equal(out.last7d.inquiries, 2, "only the two RECENT inquiries fall in the 7d window");
  assert.equal(out.last30d.bookings, 2);
  assert.equal(out.last7d.bookings, 1);
});

test("groupConversionMetrics: revenue sums settled cents → major units, 7d subset only counts recent", () => {
  const revenue30: RevenueRawRow[] = [
    { paid_at: RECENT, gross_amount_cents: 103_000 }, // $1030.00
    { paid_at: OLD, gross_amount_cents: 50_000 }, //     $500.00
    { paid_at: null, gross_amount_cents: 99_999 }, //    excluded: no settlement ts
    { paid_at: RECENT, gross_amount_cents: null }, //    excluded amount: counts as 0
  ];

  const out = groupConversionMetrics({
    start7Iso: START_7,
    start30Iso: START_30,
    inquiries30: [],
    bookings30: [],
    revenue30,
  });

  // 30d: 103000 + 50000 = 153000 cents → 1530.00
  assert.equal(out.last30d.revenue, 1530);
  // 7d: only the RECENT row with a numeric amount → 103000 cents → 1030.00
  assert.equal(out.last7d.revenue, 1030);
});

test("groupConversionMetrics: empty inputs → all-zero buckets", () => {
  const out = groupConversionMetrics({
    start7Iso: START_7,
    start30Iso: START_30,
    inquiries30: [],
    bookings30: [],
    revenue30: [],
  });
  assert.deepEqual(out, emptyWebsiteConversionMetrics());
});

// ── loadWebsiteConversionMetrics — end-to-end with an injected fake client ───

/**
 * A fake supabase query builder. Every chained filter returns `this`; the
 * builder is awaitable and resolves to a fixed `{ data, error }` keyed by the
 * table passed to `.from()`. Records the table + columns selected so the test
 * can assert the loader reads the right tables.
 */
function makeFakeClient(byTable: Record<string, { data: unknown; error: unknown }>) {
  const calls: { table: string; columns: string }[] = [];
  const builder = (table: string) => {
    const result = byTable[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ["select", "eq", "in", "not", "gte", "order", "limit", "returns"]) {
      chain[m] = (...args: unknown[]) => {
        if (m === "select") calls.push({ table, columns: String(args[0] ?? "") });
        return passthrough();
      };
    }
    // make it awaitable → resolves to the fixed result
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  };
  return {
    client: { from: (table: string) => builder(table) } as never,
    calls,
  };
}

test("loadWebsiteConversionMetrics: reads inquiries/agency_bookings/booking_transactions and groups results", async () => {
  const { client, calls } = makeFakeClient({
    inquiries: { data: [{ created_at: RECENT }, { created_at: OLD }], error: null },
    agency_bookings: { data: [{ created_at: RECENT }], error: null },
    booking_transactions: {
      data: [{ paid_at: RECENT, gross_amount_cents: 200_000 }],
      error: null,
    },
  });

  const out = await loadWebsiteConversionMetrics("tenant-x", client);

  const tables = calls.map((c) => c.table).sort();
  assert.deepEqual(tables, ["agency_bookings", "booking_transactions", "inquiries"]);

  assert.equal(out.last30d.inquiries, 2);
  assert.equal(out.last30d.bookings, 1);
  assert.equal(out.last30d.revenue, 2000); // 200000 cents → $2000.00
});

test("loadWebsiteConversionMetrics: a per-table error degrades that table to zero, others survive", async () => {
  const { client } = makeFakeClient({
    inquiries: { data: null, error: { message: "boom" } },
    agency_bookings: { data: [{ created_at: RECENT }], error: null },
    booking_transactions: { data: [], error: null },
  });

  const out = await loadWebsiteConversionMetrics("tenant-x", client);
  assert.equal(out.last30d.inquiries, 0, "errored inquiries table contributes 0");
  assert.equal(out.last30d.bookings, 1, "healthy bookings table still counts");
  assert.equal(out.last30d.revenue, 0);
});

test("loadWebsiteConversionMetrics: empty tenant id → all zeros, no DB read", async () => {
  const { client, calls } = makeFakeClient({});
  const out = await loadWebsiteConversionMetrics("", client);
  assert.deepEqual(out, emptyWebsiteConversionMetrics());
  assert.equal(calls.length, 0);
});
