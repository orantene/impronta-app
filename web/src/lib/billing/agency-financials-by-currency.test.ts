/**
 * Unit tests for `buildAgencyFinancialsByCurrency` — the pure grouper that
 * backs the multi-currency admin Financials surface.
 *
 * No DB, no network. Drives the pure function directly with fixture rows.
 *
 * Run: npx tsx --test src/lib/billing/agency-financials-by-currency.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAgencyFinancialsByCurrency,
  type AgencyFinancialsRow,
} from "./agency-financials-types";

function row(over: Partial<AgencyFinancialsRow> = {}): AgencyFinancialsRow {
  return {
    bookingId: "b1",
    bookingTalentId: "b1-t1",
    participantId: "p1",
    tenantId: "t-impronta",
    workDate: "2026-05-10",
    payoutDate: null,
    clientLabel: "Vogue Italia",
    talentProfileId: "talent-marta",
    talentDisplayName: "Marta Reyes",
    grossCents: 100_00,
    platformFeeCents: 5_00,
    workspaceFeeCents: 15_00,
    talentNetCents: 80_00,
    status: "confirmed",
    paymentMethod: "card",
    currencyCode: "EUR",
    ...over,
  };
}

describe("buildAgencyFinancialsByCurrency — empty input", () => {
  it("returns a single defaultCurrency bundle with zero totals and no byCurrency entries", () => {
    const out = buildAgencyFinancialsByCurrency([], "EUR");
    assert.equal(out.defaultCurrency, "EUR");
    assert.equal(out.byCurrency.length, 0);
    assert.equal(out.currencies.length, 0);
  });

  it("normalises defaultCurrency to upper-case", () => {
    const out = buildAgencyFinancialsByCurrency([], "eur");
    assert.equal(out.defaultCurrency, "EUR");
  });
});

describe("buildAgencyFinancialsByCurrency — single currency", () => {
  it("returns exactly one bundle; currencies array has length 1", () => {
    const out = buildAgencyFinancialsByCurrency(
      [row({ bookingId: "b1" }), row({ bookingId: "b2" })],
      "EUR",
    );
    assert.equal(out.currencies.length, 1);
    assert.equal(out.currencies[0], "EUR");
    assert.equal(out.byCurrency.length, 1);
  });

  it("tabs hidden signal: currencies.length === 1 for caller to skip the tab strip", () => {
    const out = buildAgencyFinancialsByCurrency([row()], "EUR");
    // The caller hides tabs when currencies.length < 2.
    assert.ok(out.currencies.length < 2, "single-currency result should not trigger tab strip");
  });

  it("aggregates totals correctly within the one bundle", () => {
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "b1", grossCents: 100_00 }),
        row({ bookingId: "b2", grossCents: 200_00 }),
      ],
      "EUR",
    );
    assert.equal(out.byCurrency[0]!.totals.ytdGrossCents, 300_00);
    assert.equal(out.byCurrency[0]!.totals.currency, "EUR");
  });
});

describe("buildAgencyFinancialsByCurrency — multi-currency", () => {
  it("produces two bundles for EUR + USD input", () => {
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "e1", currencyCode: "EUR", grossCents: 100_00 }),
        row({ bookingId: "u1", currencyCode: "USD", grossCents: 200_00 }),
      ],
      "EUR",
    );
    assert.equal(out.currencies.length, 2);
    assert.ok(out.currencies.includes("EUR"));
    assert.ok(out.currencies.includes("USD"));
  });

  it("defaultCurrency bundle sorts first regardless of gross size", () => {
    // USD has higher gross — but EUR is defaultCurrency, so EUR comes first.
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "e1", currencyCode: "EUR", grossCents: 50_00 }),
        row({ bookingId: "u1", currencyCode: "USD", grossCents: 999_00 }),
      ],
      "EUR",
    );
    assert.equal(out.byCurrency[0]!.totals.currency, "EUR");
    assert.equal(out.currencies[0], "EUR");
  });
});

describe("buildAgencyFinancialsByCurrency — defaultCurrency propagation", () => {
  it("reflects the agency default_currency in the result", () => {
    const outUsd = buildAgencyFinancialsByCurrency(
      [row({ currencyCode: "USD" })],
      "USD",
    );
    assert.equal(outUsd.defaultCurrency, "USD");
  });

  it("defaultCurrency is preserved even when no rows use that currency", () => {
    const out = buildAgencyFinancialsByCurrency(
      [row({ currencyCode: "MXN" })],
      "EUR",
    );
    assert.equal(out.defaultCurrency, "EUR");
    // EUR bundle does not appear in byCurrency since no EUR rows exist.
    assert.ok(!out.currencies.includes("EUR"));
    assert.ok(out.currencies.includes("MXN"));
  });
});

describe("buildAgencyFinancialsByCurrency — no cross-currency bleed", () => {
  it("EUR rows do not contribute to USD totals", () => {
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "e1", currencyCode: "EUR", grossCents: 111_00 }),
        row({ bookingId: "e2", currencyCode: "EUR", grossCents: 222_00 }),
        row({ bookingId: "u1", currencyCode: "USD", grossCents: 500_00 }),
      ],
      "EUR",
    );

    const eurBundle = out.byCurrency.find((b) => b.totals.currency === "EUR");
    const usdBundle = out.byCurrency.find((b) => b.totals.currency === "USD");

    assert.ok(eurBundle, "EUR bundle should exist");
    assert.ok(usdBundle, "USD bundle should exist");
    assert.equal(eurBundle!.totals.ytdGrossCents, 333_00);
    assert.equal(usdBundle!.totals.ytdGrossCents, 500_00);
  });

  it("USD rows do not bleed into EUR totals", () => {
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "e1", currencyCode: "EUR", grossCents: 100_00 }),
        row({ bookingId: "u1", currencyCode: "USD", grossCents: 9999_00 }),
        row({ bookingId: "u2", currencyCode: "USD", grossCents: 8888_00 }),
      ],
      "EUR",
    );

    const eurBundle = out.byCurrency.find((b) => b.totals.currency === "EUR")!;
    assert.equal(eurBundle.totals.ytdGrossCents, 100_00);
    assert.equal(eurBundle.rows.length, 1);
  });
});

describe("a row with no currency is a BROKEN row, not a dollar row", () => {
  // The defect: `(r.currencyCode ?? "USD")` relabelled a currency-less row as
  // USD and summed it next to real dollars. Per-currency aggregation cannot
  // undo that -- by the time the bundles exist the peso is already a dollar.
  // `currencyCode` is typed non-nullable, so any blank arriving here is
  // untyped data that got past the boundary: precisely the case that must be
  // refused rather than given a value.

  it("does NOT fold a null currency into USD", () => {
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "good", currencyCode: "USD", grossCents: 100_00 }),
        row({ bookingId: "broken", currencyCode: null as unknown as string, grossCents: 999_00 }),
      ],
      "USD",
    );
    const usd = out.byCurrency.find((b) => b.totals.currency === "USD");
    assert.ok(usd, "the real USD bundle must still exist");
    assert.equal(
      usd.totals.ytdGrossCents,
      100_00,
      "the broken row's 999.00 must NOT be inside the dollar total",
    );
    assert.equal(usd.rows.length, 1, "and it must not be among the dollar rows either");
  });

  it("reports the excluded rows instead of swallowing them", () => {
    // Silently dropping is only marginally better than silently relabelling:
    // both leave money unaccounted with nobody told. The count is the signal.
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "b-null", currencyCode: null as unknown as string }),
        row({ bookingId: "b-blank", currencyCode: "   " }),
        row({ bookingId: "b-empty", currencyCode: "" }),
        row({ bookingId: "ok", currencyCode: "MXN" }),
      ],
      "USD",
    );
    assert.equal(out.excludedNoCurrency.count, 3);
    assert.deepEqual(out.excludedNoCurrency.bookingIds.sort(), ["b-blank", "b-empty", "b-null"]);
    assert.deepEqual(out.currencies, ["MXN"], "only the real currency makes a bundle");
  });

  it("a clean set reports zero excluded, so the signal means something", () => {
    // An always-non-zero counter is noise; an always-zero one is unread. This
    // pins the quiet case so a non-zero reading is actionable.
    const out = buildAgencyFinancialsByCurrency(
      [row({ currencyCode: "MXN" }), row({ bookingId: "b2", currencyCode: "USD" })],
      "USD",
    );
    assert.equal(out.excludedNoCurrency.count, 0);
    assert.deepEqual(out.excludedNoCurrency.bookingIds, []);
  });

  it("a peso row keeps its own bucket and never joins the dollars", () => {
    const out = buildAgencyFinancialsByCurrency(
      [
        row({ bookingId: "mx", currencyCode: "mxn", grossCents: 20_000_00 }),
        row({ bookingId: "us", currencyCode: "USD", grossCents: 50_00 }),
      ],
      "USD",
    );
    const mxn = out.byCurrency.find((b) => b.totals.currency === "MXN");
    const usd = out.byCurrency.find((b) => b.totals.currency === "USD");
    assert.equal(mxn?.totals.ytdGrossCents, 20_000_00, "lowercase mxn normalises, stays separate");
    assert.equal(usd?.totals.ytdGrossCents, 50_00);
  });
});
