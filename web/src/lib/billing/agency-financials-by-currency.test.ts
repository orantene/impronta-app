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
