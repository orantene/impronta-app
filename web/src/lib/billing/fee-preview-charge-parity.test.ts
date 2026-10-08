/**
 * TUL-145: settings preview total === server gross_charged_cents.
 * Preview calls resolveBookingCommissions; this locks that invariant across
 * USD/MXN amounts, including Stripe presentment minimums.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chargeMinimumMinor } from "@/lib/payments/charge-minimums";

import {
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  processorFeeRatesForCurrency,
  resolveBookingCommissions,
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
} from "./commission";
import { previewFeeLines, type FeePayer } from "./fee-payer-setting";

const cfg: PlatformCommissionConfig = {
  default_take_bps: 600,
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  processing_mode: "pass_through",
  pass_through_take_bps: PASS_THROUGH_DEFAULT_TAKE_BPS,
};

function charge(serviceMinor: number, currency: string, feePayer: FeePayer) {
  const input: ResolveBookingCommissionsInput = {
    tenantId: "t1",
    workspacePlan: "agency",
    offerLineItems: [{ line_total_cents: serviceMinor, talent_cost_total_cents: serviceMinor }],
    currencyCode: currency,
    paymentMethod: "card",
    sellerOfRecord: "talent",
    platformConfig: cfg,
    tenantOverride: null,
    processingFeePayer: feePayer,
    processorFeeRates: processorFeeRatesForCurrency(currency),
  };
  return resolveBookingCommissions(input);
}

function assertPreviewEqualsCharge(serviceMinor: number, currency: string, feePayer: FeePayer) {
  const priceMajor = serviceMinor / 100;
  const preview = previewFeeLines({ price: priceMajor, currency, feePayer });
  const snap = charge(serviceMinor, currency, feePayer);
  assert.equal(
    preview.clientTotalMinor,
    snap.gross_charged_cents,
    `${currency} ${feePayer} service=${serviceMinor}: preview ${preview.clientTotalMinor} != charge ${snap.gross_charged_cents}`,
  );
  assert.equal(preview.platformFeeMinor, snap.client_surcharge_cents);
  if (feePayer === "client") {
    assert.equal(preview.clientProcessingMinor, snap.client_processing_fee_cents ?? 0);
    assert.equal(preview.sellerReceivesMinor, snap.talent_net_cents);
  }
}

describe("fee preview == server charge (TUL-145)", () => {
  it("USD client-pays: worked examples + sweep including Stripe minimum", () => {
    const usdMin = chargeMinimumMinor("USD")!;
    assert.equal(usdMin, 50);

    for (const service of [1, 49, 50, 100, 150, 999, 1000, 10_000, 25_099, 99_999]) {
      assertPreviewEqualsCharge(service, "USD", "client");
      assertPreviewEqualsCharge(service, "USD", "seller");
    }

    // Dense sweep around the presentment floor and whole-dollar band where
    // the old closed-form preview drifted by 1¢.
    for (let service = 1; service <= 500; service += 1) {
      assertPreviewEqualsCharge(service, "USD", "client");
    }
    for (let dollars = 1; dollars <= 200; dollars += 1) {
      assertPreviewEqualsCharge(dollars * 100, "USD", "client");
    }
  });

  it("MXN client-pays: worked examples + sweep including Stripe minimum", () => {
    const mxnMin = chargeMinimumMinor("MXN")!;
    assert.equal(mxnMin, 1000);

    for (const service of [1, 999, 1000, 1500, 10_000, 100_000, 250_099]) {
      assertPreviewEqualsCharge(service, "MXN", "client");
      assertPreviewEqualsCharge(service, "MXN", "seller");
    }

    for (let service = 1; service <= 2000; service += 1) {
      assertPreviewEqualsCharge(service, "MXN", "client");
    }
    for (let pesos = 1; pesos <= 200; pesos += 1) {
      assertPreviewEqualsCharge(pesos * 100, "MXN", "client");
    }
  });

  it("canonical rate table matches engine defaults used in charge tests", () => {
    const us = processorFeeRatesForCurrency("USD");
    const mx = processorFeeRatesForCurrency("MXN");
    assert.deepEqual(us, { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 });
    assert.deepEqual(mx, { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 });

    const preview = previewFeeLines({ price: 100, currency: "USD", feePayer: "client" });
    assert.equal(preview.clientTotalMinor, 10_484);
    const mxPreview = previewFeeLines({ price: 1000, currency: "MXN", feePayer: "client" });
    assert.equal(mxPreview.clientTotalMinor, 106_287);
  });
});
