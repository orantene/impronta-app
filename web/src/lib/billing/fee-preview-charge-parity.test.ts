/**
 * TUL-145: settings preview total === server gross_charged_cents.
 * Preview calls resolveBookingCommissions with the SAME resolved platform
 * config the booking engine loads (take bps + processor rates + floor).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chargeMinimumMinor } from "@/lib/payments/charge-minimums";

import {
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  processorFeeRatesForCurrency,
  resolveBookingCommissions,
  type PlatformCommissionConfig,
  type ProcessorFeeRates,
  type ResolveBookingCommissionsInput,
  type WorkspaceCommissionOverride,
} from "./commission";
import { previewFeeLines, type FeePayer } from "./fee-payer-setting";
import {
  feePreviewConfigFromProcessingModeRow,
  processorFeeRatesFromTable,
  resolvePassThroughTakeBps,
} from "./platform-processing-mode";

const US = processorFeeRatesForCurrency("USD");
const MX = processorFeeRatesForCurrency("MXN");

function charge(
  serviceMinor: number,
  currency: string,
  feePayer: FeePayer,
  opts: {
    takeBps?: number;
    rates?: ProcessorFeeRates;
    takeFloorCents?: number;
    tenantOverride?: WorkspaceCommissionOverride | null;
  } = {},
) {
  const takeBps = opts.takeBps ?? PASS_THROUGH_DEFAULT_TAKE_BPS;
  const rates = opts.rates ?? processorFeeRatesForCurrency(currency);
  const cfg: PlatformCommissionConfig = {
    default_take_bps: 600,
    default_take_floor_cents: opts.takeFloorCents ?? 0,
    plan_tier_bps: {},
    processing_mode: "pass_through",
    pass_through_take_bps: takeBps,
    processor_fee_rates: { default: rates, [currency.toLowerCase()]: rates },
  };
  const input: ResolveBookingCommissionsInput = {
    tenantId: "t1",
    workspacePlan: "agency",
    offerLineItems: [{ line_total_cents: serviceMinor, talent_cost_total_cents: serviceMinor }],
    currencyCode: currency,
    paymentMethod: "card",
    sellerOfRecord: "talent",
    platformConfig: cfg,
    tenantOverride: opts.tenantOverride ?? null,
    processingFeePayer: feePayer,
    processorFeeRates: rates,
  };
  return resolveBookingCommissions(input);
}

function assertPreviewEqualsCharge(
  serviceMinor: number,
  currency: string,
  feePayer: FeePayer,
  opts: {
    takeBps?: number;
    rates?: ProcessorFeeRates;
    takeFloorCents?: number;
    tenantOverride?: WorkspaceCommissionOverride | null;
  } = {},
) {
  const priceMajor = serviceMinor / 100;
  const takeBps = opts.takeBps ?? PASS_THROUGH_DEFAULT_TAKE_BPS;
  const rates = opts.rates ?? processorFeeRatesForCurrency(currency);
  const preview = previewFeeLines({
    price: priceMajor,
    currency,
    feePayer,
    takeBps,
    processorFeeRates: rates,
    takeFloorCents: opts.takeFloorCents,
    tenantOverride: opts.tenantOverride,
  });
  const snap = charge(serviceMinor, currency, feePayer, opts);
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

  it("live non-default take bps + rates: preview tracks charge (no silent 150/local table)", () => {
    const liveTakeBps = 200;
    const liveUs: ProcessorFeeRates = { percent: 0.031, fixed_cents: 40, tax_on_fee: 0 };
    const liveMx: ProcessorFeeRates = { percent: 0.04, fixed_cents: 350, tax_on_fee: 0.16 };

    // Prove defaults would disagree — the bug Codex flagged.
    const defaultPreview = previewFeeLines({
      price: 100,
      currency: "USD",
      feePayer: "client",
      takeBps: PASS_THROUGH_DEFAULT_TAKE_BPS,
      processorFeeRates: US,
    });
    const liveCharge = charge(10_000, "USD", "client", { takeBps: liveTakeBps, rates: liveUs });
    assert.notEqual(
      defaultPreview.clientTotalMinor,
      liveCharge.gross_charged_cents,
      "fixture: default preview must differ from live charge so the regression is meaningful",
    );

    assertPreviewEqualsCharge(10_000, "USD", "client", { takeBps: liveTakeBps, rates: liveUs });
    assertPreviewEqualsCharge(10_000, "USD", "seller", { takeBps: liveTakeBps, rates: liveUs });
    assertPreviewEqualsCharge(100_000, "MXN", "client", { takeBps: liveTakeBps, rates: liveMx });

    // Floor + tenant override — same knobs the engine applies.
    assertPreviewEqualsCharge(10_000, "USD", "client", {
      takeBps: liveTakeBps,
      rates: liveUs,
      takeFloorCents: 500,
      tenantOverride: { platform_take_bps: 250, platform_take_floor_cents: 750 },
    });
  });

  it("feePreviewConfigFromProcessingModeRow mirrors engine RPC resolution", () => {
    const row = {
      processing_mode: "pass_through",
      pass_through_take_bps: 200,
      processor_fee_rates: {
        default: US,
        mxn: MX,
        usd: { percent: 0.031, fixed_cents: 40, tax_on_fee: 0 },
      },
    };
    assert.equal(resolvePassThroughTakeBps(row), 200);
    assert.equal(resolvePassThroughTakeBps({ pass_through_take_bps: null }), PASS_THROUGH_DEFAULT_TAKE_BPS);
    assert.deepEqual(processorFeeRatesFromTable(row.processor_fee_rates, "USD"), row.processor_fee_rates.usd);
    assert.deepEqual(processorFeeRatesFromTable(row.processor_fee_rates, "MXN"), MX);

    const cfg = feePreviewConfigFromProcessingModeRow(row, "USD", 0);
    assert.ok(cfg);
    assert.equal(cfg!.takeBps, 200);
    assert.deepEqual(cfg!.processorFeeRates, row.processor_fee_rates.usd);

    const preview = previewFeeLines({
      price: 100,
      currency: "USD",
      feePayer: "client",
      takeBps: cfg!.takeBps,
      processorFeeRates: cfg!.processorFeeRates,
      takeFloorCents: cfg!.takeFloorCents,
    });
    assert.equal(preview.clientTotalMinor, charge(10_000, "USD", "client", {
      takeBps: 200,
      rates: row.processor_fee_rates.usd,
    }).gross_charged_cents);
  });
});
