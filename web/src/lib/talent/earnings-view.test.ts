/**
 * Unit tests pinning the currency-display fix for the talent Money dashboard.
 *
 * The bug these guard against: a booking priced in MXN/ARS/USD was rendered
 * (or summed) as if it were EUR — so a real Mexican-peso payout showed "€800"
 * or, when paired with the legacy EUR-only loader filter, "€0". The dashboard
 * must denominate every surface in the BOOKING'S actual currency.
 *
 * Run: npx tsx --test src/lib/talent/earnings-view.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatMoneyCents, formatEurCents } from "./earnings-view";
import { buildTalentEarnings, type TalentSnapshotAggregateRow } from "./earnings-types";
import {
  primaryBundleOrEmpty,
  type TalentEarningsByCurrency,
} from "./earnings-by-currency-types";

// ── formatMoneyCents — the headline: render the booking's real currency ──────

describe("formatMoneyCents — currency-aware, never a hardcoded euro", () => {
  it("MXN renders with the peso symbol, NOT €", () => {
    const out = formatMoneyCents(800_00, "MXN");
    assert.ok(out.includes("MX$"), `expected MX$ in "${out}"`);
    assert.ok(!out.includes("€"), `MXN must not be relabeled euro: "${out}"`);
    assert.ok(out.includes("800"), `expected the amount in "${out}"`);
  });

  it("ARS (Argentine peso) renders as ARS, NOT €", () => {
    const out = formatMoneyCents(800_00, "ARS");
    assert.ok(!out.includes("€"), `ARS must not be relabeled euro: "${out}"`);
    assert.ok(/ARS|\$/.test(out), `expected an ARS marker in "${out}"`);
    assert.ok(out.includes("800"));
  });

  it("USD renders with a dollar sign", () => {
    const out = formatMoneyCents(800_00, "USD");
    assert.ok(out.includes("$"), `expected $ in "${out}"`);
    assert.ok(!out.includes("€"));
  });

  it("GBP renders with a pound sign", () => {
    assert.ok(formatMoneyCents(800_00, "GBP").includes("£"));
  });

  it("EUR still renders with the euro symbol (no regression)", () => {
    assert.ok(formatMoneyCents(800_00, "EUR").includes("€"));
  });

  it("lower-case codes are normalized (the snapshot stored 'mxn')", () => {
    const out = formatMoneyCents(1_030_00, "mxn");
    assert.ok(out.includes("MX$"), `expected MX$ in "${out}"`);
  });

  it("missing/blank code falls back to EUR (historical default)", () => {
    assert.ok(formatMoneyCents(100_00, undefined).includes("€"));
    assert.ok(formatMoneyCents(100_00, "").includes("€"));
    assert.ok(formatMoneyCents(100_00, null).includes("€"));
  });

  it("an unknown/garbage code never throws in render", () => {
    const out = formatMoneyCents(100_00, "ZZZ");
    assert.equal(typeof out, "string");
    assert.ok(out.includes("ZZZ"));
  });

  it("rounds to whole units (no decimal cents on the dashboard)", () => {
    assert.ok(!formatMoneyCents(800_00, "MXN").includes("."));
  });

  it("formatEurCents stays euro-pinned for genuine-euro call sites", () => {
    assert.ok(formatEurCents(800_00).includes("€"));
  });
});

// ── primaryBundleOrEmpty — the "before" reads the home currency, not € ──────

describe("primaryBundleOrEmpty — empty state honors defaultCurrency", () => {
  it("no rows + MXN default → empty bundle denominated MXN (so 'before' = MX$0)", () => {
    const byCurrency: TalentEarningsByCurrency = {
      defaultCurrency: "MXN",
      byCurrency: [],
      currencies: [],
    };
    const bundle = primaryBundleOrEmpty(byCurrency);
    assert.equal(bundle.totals.currency, "MXN");
    assert.equal(bundle.totals.ytdNetCents, 0);
    const rendered = formatMoneyCents(bundle.totals.ytdNetCents, bundle.totals.currency);
    assert.ok(rendered.includes("MX$"), `'before' should read MX$0, got "${rendered}"`);
    assert.ok(!rendered.includes("€"));
  });

  it("no rows + no default → EUR empty bundle (back-compat)", () => {
    const bundle = primaryBundleOrEmpty({ defaultCurrency: "", byCurrency: [], currencies: [] });
    assert.equal(bundle.totals.currency, "EUR");
  });

  it("returns the first real bundle when present", () => {
    const mxnBundle = buildTalentEarnings(
      [row({ currencyCode: "MXN", netCents: 1_600_00 })],
      { currency: "MXN" },
    );
    const bundle = primaryBundleOrEmpty({
      defaultCurrency: "MXN",
      byCurrency: [mxnBundle],
      currencies: ["MXN"],
    });
    assert.equal(bundle.totals.currency, "MXN");
    assert.equal(bundle.totals.ytdNetCents, 1_600_00);
  });
});

// ── End-to-end of the pure layer: a MXN row survives + displays MX$ ─────────

describe("MXN snapshot row → dashboard shows MX$, not dropped, not €", () => {
  it("buildTalentEarnings(MXN) keeps the cents and stamps MXN; formats MX$", () => {
    const earnings = buildTalentEarnings(
      [row({ currencyCode: "MXN", grossCents: 1_030_00, netCents: 800_00 })],
      { currency: "MXN" },
    );
    // Not dropped to zero.
    assert.equal(earnings.totals.ytdNetCents, 800_00);
    // Stamped with the real currency.
    assert.equal(earnings.totals.currency, "MXN");
    // Renders the peso, not the euro.
    const ytd = formatMoneyCents(earnings.totals.ytdNetCents, earnings.totals.currency);
    assert.ok(ytd.includes("MX$") && ytd.includes("800"));
    assert.ok(!ytd.includes("€"));
  });
});

// ── Fixture helper (mirrors earnings-by-currency.test.ts) ───────────────────

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
