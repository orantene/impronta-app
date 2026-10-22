/**
 * TUL-1061: checkout line items === the server charge, to the cent, in MXN and
 * USD. Same resolver the server uses (resolveBookingCommissions). Flag off =
 * today's lines; flag on = one extra non-additive card-fee memo from the
 * verified rates only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveBookingCommissions,
  type PlatformCommissionConfig,
  type ProcessingFeePayer,
} from "./commission";
import {
  CLIENT_SERVICE_FEE_BPS,
  DEFAULT_PROCESSOR_FEE_RATES,
  checkoutCardFeeLineEnabled,
  processorFeeRatesForCurrency,
} from "./fee-config";
import { bookingClientFeeLines, platformFeePercentLabel } from "./processing-fee-payer";
import { validClientFeeLines } from "@/lib/payments/fee-lines-payload";

function snapshot(serviceMinor: number, currency: string, payer: ProcessingFeePayer) {
  const rates = processorFeeRatesForCurrency(currency);
  const cfg: PlatformCommissionConfig = {
    default_take_bps: 600,
    default_take_floor_cents: 0,
    plan_tier_bps: {},
    processing_mode: "pass_through",
    pass_through_take_bps: CLIENT_SERVICE_FEE_BPS,
    processor_fee_rates: { default: rates, [currency.toLowerCase()]: rates },
  };
  return resolveBookingCommissions({
    tenantId: "t1",
    workspacePlan: "agency",
    offerLineItems: [{ line_total_cents: serviceMinor, talent_cost_total_cents: serviceMinor }],
    currencyCode: currency,
    paymentMethod: "card",
    sellerOfRecord: "talent",
    platformConfig: cfg,
    tenantOverride: null,
    processingFeePayer: payer,
    processorFeeRates: rates,
  });
}

const CASES: readonly [number, string][] = [
  [10_000, "USD"],
  [12_345, "USD"],
  [150_000, "MXN"],
  [98_765, "MXN"],
];

describe("checkout lines sum to the server gross_charged", () => {
  for (const [service, cur] of CASES) {
    for (const payer of ["seller", "client"] as const) {
      it(`${cur} ${service} payer=${payer}`, () => {
        const snap = snapshot(service, cur, payer);
        const lines = bookingClientFeeLines([snap], snap.gross_charged_cents);
        const total = lines.find((l) => l.code === "total_charged");
        assert.equal(total?.cents, snap.gross_charged_cents);
        const parts = lines.filter((l) => l.code !== "total_charged").reduce((n, l) => n + l.cents, 0);
        assert.equal(parts, snap.gross_charged_cents, "service + fee (+ card) lines add to the charge to the cent");
        assert.equal(lines.find((l) => l.code === "service_subtotal")?.cents, service);
        assert.equal(lines.find((l) => l.code === "platform_fee")?.cents, snap.client_surcharge_cents);
        assert.equal(platformFeePercentLabel(lines), "1.5%");
        assert.ok(!lines.some((l) => l.code === "card_fee_memo"), "flag off: no memo");
      });
    }
  }
});

describe("card fee display flag", () => {
  it("defaults to off and reads only TULALA_CHECKOUT_CARD_FEE_LINE=1", () => {
    assert.equal(checkoutCardFeeLineEnabled({}), false);
    assert.equal(checkoutCardFeeLineEnabled({ TULALA_CHECKOUT_CARD_FEE_LINE: "0" }), false);
    assert.equal(checkoutCardFeeLineEnabled({ TULALA_CHECKOUT_CARD_FEE_LINE: "1" }), true);
  });

  for (const [service, cur] of CASES) {
    it(`flag on adds one memo from verified rates, seller pays, ${cur} ${service}`, () => {
      const snap = snapshot(service, cur, "seller");
      const off = bookingClientFeeLines([snap], snap.gross_charged_cents);
      const rates = processorFeeRatesForCurrency(cur);
      const on = bookingClientFeeLines([snap], snap.gross_charged_cents, { cardFeeMemoRates: rates });
      assert.deepEqual(on.slice(0, off.length), off, "existing lines unchanged");
      assert.equal(on.length, off.length + 1);
      const memo = on[on.length - 1];
      assert.equal(memo.code, "card_fee_memo");
      const expected = Math.round(
        ((rates.percent * snap.gross_charged_cents) + rates.fixed_cents) * (1 + (rates.tax_on_fee ?? 0)),
      );
      assert.equal(memo.cents, expected);
      // Verified figures only: US 2.9% + 30c, MX 3.6% + MXN 3 + 16% IVA.
      assert.equal(DEFAULT_PROCESSOR_FEE_RATES.default.percent, 0.029);
      assert.equal(DEFAULT_PROCESSOR_FEE_RATES.mxn.percent, 0.036);
      assert.equal(DEFAULT_PROCESSOR_FEE_RATES.mxn.fixed_cents, 300);
      // Total unchanged; memo is non-additive.
      assert.equal(on.find((l) => l.code === "total_charged")?.cents, snap.gross_charged_cents);
    });
  }

  it("flag on, client pays: the real processing line already exists, no memo", () => {
    const snap = snapshot(10_000, "USD", "client");
    const on = bookingClientFeeLines([snap], snap.gross_charged_cents, {
      cardFeeMemoRates: processorFeeRatesForCurrency("USD"),
    });
    assert.ok(on.some((l) => l.code === "processing_fee"));
    assert.ok(!on.some((l) => l.code === "card_fee_memo"));
  });

  it("the payload validator drops the memo by default and keeps it on request", () => {
    const snap = snapshot(10_000, "USD", "seller");
    const on = bookingClientFeeLines([snap], snap.gross_charged_cents, {
      cardFeeMemoRates: processorFeeRatesForCurrency("USD"),
    });
    assert.ok(!validClientFeeLines(on, snap.gross_charged_cents).some((l) => l.code === "card_fee_memo"));
    assert.ok(validClientFeeLines(on, snap.gross_charged_cents, { keepMemo: true }).some((l) => l.code === "card_fee_memo"));
    assert.deepEqual(validClientFeeLines(on, snap.gross_charged_cents + 1), []);
  });

  it("TUL-1366: the percent is read back from the charged amounts (the rate varies by plan), never from a 150 default", () => {
    const label = (service: number, fee: number) =>
      platformFeePercentLabel([
        { code: "service_subtotal", cents: service },
        { code: "platform_fee", cents: fee },
        { code: "total_charged", cents: service + fee },
      ]);
    assert.equal(label(10_000, 150), "1.5%");
    assert.equal(label(10_000, 300), "3%");
    assert.equal(label(10_000, 400), "4%");
    assert.equal(label(10_000, 0), "0%");
    // A floored or topped-up fee that is not a believable rate states no percent.
    assert.equal(label(10_000, 3_000), null);
    assert.equal(label(100, 99), null);
    assert.equal(label(0, 150), null);
  });
});
