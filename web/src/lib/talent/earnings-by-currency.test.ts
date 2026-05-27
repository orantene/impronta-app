/**
 * Unit tests for the by-currency grouping logic powering the talent Money
 * tab strip (L49 / talent-money-currency-tabs).
 *
 * Tests drive `buildTalentEarnings` directly (pure, no DB) and simulate the
 * grouping logic from `loadTalentEarningsByCurrencyWithSupabase` so the
 * currency-isolation invariant can be verified without a Supabase fixture.
 *
 * Run: npx tsx --test src/lib/talent/earnings-by-currency.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentEarnings,
  EMPTY_TALENT_EARNINGS,
  type TalentSnapshotAggregateRow,
} from "./earnings-types";

// ── Fixture helpers ────────────────────────────────────────────────────────

function row(over: Partial<TalentSnapshotAggregateRow> = {}): TalentSnapshotAggregateRow {
  return {
    bookingId: "b1",
    bookingTalentId: "b1-t1",
    tenantId: "t-impronta",
    agencySlug: "impronta",
    agencyName: "Impronta",
    workDate: "2026-05-10",
    payoutDate: null,
    clientLabel: "Vogue Italia",
    grossCents: 100_00,
    netCents: 80_00,
    workspaceFeeCents: 15_00,
    status: "confirmed",
    source: "agency_routed",
    paymentMethod: "card",
    currencyCode: "EUR",
    ...over,
  };
}

/**
 * Simulates the grouping step inside `loadTalentEarningsByCurrencyWithSupabase`:
 * given a flat row list, group by currencyCode and project each group through
 * `buildTalentEarnings`. Mirrors the production logic so tests catch regressions.
 */
function groupByCurrency(
  rows: TalentSnapshotAggregateRow[],
  defaultCurrency = "EUR",
) {
  const byCurrencyRows = new Map<string, TalentSnapshotAggregateRow[]>();
  for (const snap of rows) {
    const code = (snap.currencyCode ?? "EUR").toUpperCase();
    const list = byCurrencyRows.get(code) ?? [];
    list.push(snap);
    byCurrencyRows.set(code, list);
  }
  const bundles = [...byCurrencyRows.entries()].map(([code, rs]) =>
    buildTalentEarnings(rs, { currency: code }),
  );
  bundles.sort((a, b) => {
    if (a.totals.currency === defaultCurrency) return -1;
    if (b.totals.currency === defaultCurrency) return 1;
    return b.totals.ytdNetCents - a.totals.ytdNetCents;
  });
  return {
    currencies: bundles.map((b) => b.totals.currency),
    byCurrency: bundles,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("buildTalentEarnings — currency opt", () => {
  it("defaults to EUR when no opts provided", () => {
    const out = buildTalentEarnings([row()]);
    assert.equal(out.totals.currency, "EUR");
  });

  it("uses opts.currency when provided", () => {
    const out = buildTalentEarnings([row({ currencyCode: "MXN" })], { currency: "MXN" });
    assert.equal(out.totals.currency, "MXN");
  });

  it("sums net cents correctly", () => {
    const out = buildTalentEarnings([
      row({ bookingId: "b1", netCents: 80_00 }),
      row({ bookingId: "b2", netCents: 120_00 }),
    ]);
    assert.equal(out.totals.ytdNetCents, 200_00);
  });

  it("EMPTY_TALENT_EARNINGS carries EUR", () => {
    assert.equal(EMPTY_TALENT_EARNINGS.totals.currency, "EUR");
  });
});

describe("groupByCurrency — isolation invariant", () => {
  it("single EUR currency → one bundle, no bleed", () => {
    const rows = [
      row({ bookingId: "b1", netCents: 100_00, currencyCode: "EUR" }),
      row({ bookingId: "b2", netCents: 50_00, currencyCode: "EUR" }),
    ];
    const { byCurrency, currencies } = groupByCurrency(rows, "EUR");
    assert.equal(byCurrency.length, 1);
    assert.equal(currencies[0], "EUR");
    assert.equal(byCurrency[0]!.totals.ytdNetCents, 150_00);
  });

  it("EUR + MXN rows → two separate bundles", () => {
    const rows = [
      row({ bookingId: "b1", grossCents: 100_00, netCents: 80_00, currencyCode: "EUR" }),
      row({ bookingId: "b2", grossCents: 2_000_00, netCents: 1_600_00, currencyCode: "MXN" }),
    ];
    const { byCurrency, currencies } = groupByCurrency(rows, "EUR");
    assert.equal(byCurrency.length, 2);
    assert.deepEqual(new Set(currencies), new Set(["EUR", "MXN"]));

    const eurBundle = byCurrency.find((b) => b.totals.currency === "EUR")!;
    const mxnBundle = byCurrency.find((b) => b.totals.currency === "MXN")!;

    // Each bundle contains ONLY its own currency rows.
    assert.equal(eurBundle.totals.ytdNetCents, 80_00);
    assert.equal(mxnBundle.totals.ytdNetCents, 1_600_00);

    // No cross-bleed.
    assert.equal(eurBundle.totals.ytdGrossCents, 100_00);
    assert.equal(mxnBundle.totals.ytdGrossCents, 2_000_00);
  });

  it("defaultCurrency appears first in sorted bundles", () => {
    const rows = [
      row({ bookingId: "b1", netCents: 100_00, currencyCode: "EUR" }),
      row({ bookingId: "b2", netCents: 500_00, currencyCode: "MXN" }),
      row({ bookingId: "b3", netCents: 200_00, currencyCode: "USD" }),
    ];
    // Default is MXN — even though EUR is the lowest net, MXN should be first.
    const { currencies } = groupByCurrency(rows, "MXN");
    assert.equal(currencies[0], "MXN");
  });

  it("non-default currencies sorted by ytdNetCents descending", () => {
    const rows = [
      row({ bookingId: "b1", netCents: 50_00, currencyCode: "EUR" }),
      row({ bookingId: "b2", netCents: 500_00, currencyCode: "USD" }),
      row({ bookingId: "b3", netCents: 200_00, currencyCode: "GBP" }),
    ];
    // Default EUR appears first; then USD (500) > GBP (200).
    const { currencies } = groupByCurrency(rows, "EUR");
    assert.equal(currencies[0], "EUR");
    assert.equal(currencies[1], "USD");
    assert.equal(currencies[2], "GBP");
  });

  it("empty rows → empty bundles", () => {
    const { byCurrency, currencies } = groupByCurrency([]);
    assert.equal(byCurrency.length, 0);
    assert.equal(currencies.length, 0);
  });

  it("per-agency aggregation is scoped to the bundle's rows only", () => {
    const rows = [
      row({ bookingId: "b1", tenantId: "t-eur", agencyName: "EUR Agency", netCents: 100_00, currencyCode: "EUR" }),
      row({ bookingId: "b2", tenantId: "t-mxn", agencyName: "MXN Agency", netCents: 800_00, currencyCode: "MXN" }),
    ];
    const { byCurrency } = groupByCurrency(rows, "EUR");
    const eurBundle = byCurrency.find((b) => b.totals.currency === "EUR")!;
    const mxnBundle = byCurrency.find((b) => b.totals.currency === "MXN")!;

    // Each bundle's perAgency only has its own agency.
    assert.equal(eurBundle.perAgency.length, 1);
    assert.equal(eurBundle.perAgency[0]!.name, "EUR Agency");
    assert.equal(mxnBundle.perAgency.length, 1);
    assert.equal(mxnBundle.perAgency[0]!.name, "MXN Agency");
  });
});

describe("groupByCurrency — currencyCode fallback", () => {
  it("rows without currencyCode (legacy EUR path) are bucketed as EUR", () => {
    // Simulate rows from the old single-currency path that don't have currencyCode.
    const rows: TalentSnapshotAggregateRow[] = [
      { ...row({ bookingId: "b1" }), currencyCode: undefined },
      { ...row({ bookingId: "b2" }), currencyCode: undefined },
    ];
    const { byCurrency, currencies } = groupByCurrency(rows, "EUR");
    assert.equal(byCurrency.length, 1);
    assert.equal(currencies[0], "EUR");
    assert.equal(byCurrency[0]!.totals.ytdNetCents, 160_00);
  });
});
