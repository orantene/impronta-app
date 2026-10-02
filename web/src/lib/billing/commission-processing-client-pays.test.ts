/**
 * processing_fee_payer = 'client' (pass_through mode): the client also covers
 * the processor fee via a gross-up; the seller receives exactly the subtotal.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveBookingCommissions,
  grossUpForProcessorFee,
  estimateProcessorFeeCents,
  nonRefundableFeeCents,
  CommissionResolutionError,
  type PlatformCommissionConfig,
  type ProcessorFeeRates,
  type ResolveBookingCommissionsInput,
} from "./commission";

const US: ProcessorFeeRates = { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 };
const MX: ProcessorFeeRates = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };

const cfg: PlatformCommissionConfig = {
  default_take_bps: 600,
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  processing_mode: "pass_through",
};

const input = (o: Partial<ResolveBookingCommissionsInput> = {}): ResolveBookingCommissionsInput => ({
  tenantId: "t1",
  workspacePlan: "agency",
  offerLineItems: [{ line_total_cents: 10_000, talent_cost_total_cents: 10_000 }],
  currencyCode: "USD",
  paymentMethod: "card",
  sellerOfRecord: "talent",
  platformConfig: cfg,
  tenantOverride: null,
  processingFeePayer: "client",
  processorFeeRates: US,
  ...o,
});

const sum = (s: ReturnType<typeof resolveBookingCommissions>) =>
  s.talent_net_cents + s.workspace_fee_cents + s.platform_fee_cents + s.channel_referral_cents + (s.processing_fee_cents ?? 0);

describe("grossUpForProcessorFee", () => {
  it("is the smallest gross whose net-of-fee covers the target (sweep, both rate sets)", () => {
    for (const rates of [US, MX]) {
      for (let t = 100; t < 400_000; t += 997) {
        const g = grossUpForProcessorFee(t, rates);
        assert.ok(g - estimateProcessorFeeCents(g, rates) >= t, `covers ${t}`);
        assert.ok(g - 1 - estimateProcessorFeeCents(g - 1, rates) < t, `minimal ${t}`);
      }
    }
  });

  it("rejects impossible rates", () => {
    assert.throws(() => grossUpForProcessorFee(100, { percent: 1.2, fixed_cents: 0 }), CommissionResolutionError);
  });
});

describe("payer = client — worked examples", () => {
  it("USD: $100 -> client pays ~$104.84, seller $100.00, Tulala $1.50", () => {
    const s = resolveBookingCommissions(input());
    assert.equal(s.gross_charged_cents, 10_484);
    assert.equal(s.client_surcharge_cents, 150);
    assert.equal(s.client_processing_fee_cents, 334);
    assert.equal(s.processing_fee_quoted_cents, 334);
    assert.equal(s.talent_net_cents, 10_000);
    assert.equal(s.platform_fee_cents, 150);
    assert.equal(s.processing_fee_payer, "client");
    assert.equal(sum(s), s.gross_charged_cents);
  });

  it("MXN: 1,000 -> client pays 1,062.87 on 3.6% + 3 MXN + 16% IVA, seller 1,000.00, Tulala 15.00", () => {
    // The brief said "~1,062.84"; the exact smallest covering gross is 1,062.87
    // (net after the IVA-inclusive fee is exactly 1,015.00 = subtotal + 1.5%).
    const s = resolveBookingCommissions(
      input({ currencyCode: "MXN", processorFeeRates: MX, offerLineItems: [{ line_total_cents: 100_000, talent_cost_total_cents: 100_000 }] }),
    );
    assert.equal(s.gross_charged_cents, 106_287);
    assert.equal(s.talent_net_cents, 100_000);
    assert.equal(s.platform_fee_cents, 1_500);
    assert.equal(sum(s), s.gross_charged_cents);
  });
});

describe("payer = client — variance between quoted and actual fee", () => {
  it("actual fee above the quote: seller untouched, platform absorbs the difference", () => {
    const s = resolveBookingCommissions(input({ processingFeeCents: 360 }));
    assert.equal(s.talent_net_cents, 10_000);
    assert.equal(s.processing_fee_cents, 360);
    assert.equal(s.platform_fee_cents, 150 + (334 - 360));
    assert.equal(sum(s), s.gross_charged_cents);
  });

  it("actual fee below the quote: seller untouched, platform keeps the difference", () => {
    const s = resolveBookingCommissions(input({ processingFeeCents: 300 }));
    assert.equal(s.talent_net_cents, 10_000);
    assert.equal(s.platform_fee_cents, 150 + 34);
    assert.equal(sum(s), s.gross_charged_cents);
  });
});

describe("payer = client — workspace seller", () => {
  it("talent keeps the full quote AND the workspace keeps its full margin", () => {
    const s = resolveBookingCommissions(
      input({ sellerOfRecord: "workspace", offerLineItems: [{ line_total_cents: 10_000, talent_cost_total_cents: 8_000 }], processingFeeCents: 340 }),
    );
    assert.equal(s.talent_net_cents, 8_000);
    assert.equal(s.workspace_fee_cents, 2_000);
    assert.equal(s.seller_shortfall_cents, 0);
    assert.equal(sum(s), s.gross_charged_cents);
  });
});

describe("payer = client — guards", () => {
  it("missing rates fail closed (never silently falls back to seller)", () => {
    assert.throws(
      () => resolveBookingCommissions(input({ processorFeeRates: null })),
      (e: unknown) => e instanceof CommissionResolutionError && e.code === "processing_rates_missing",
    );
  });

  it("payer is ignored outside pass_through mode (legacy math, no gross-up)", () => {
    const s = resolveBookingCommissions(
      input({ platformConfig: { ...cfg, processing_mode: "included", client_surcharge_bps: 300 } }),
    );
    assert.equal(s.gross_charged_cents, 10_300);
    assert.equal("processing_fee_payer" in s, false);
  });

  it("default payer is seller (no gross-up)", () => {
    const s = resolveBookingCommissions(input({ processingFeePayer: undefined, processorFeeRates: undefined }));
    assert.equal(s.gross_charged_cents, 10_150);
    assert.equal(s.processing_fee_payer, "seller");
  });
});

describe("nonRefundableFeeCents (fees are never refunded)", () => {
  it("client mode: platform fee + processing line", () => {
    const s = resolveBookingCommissions(input());
    assert.equal(nonRefundableFeeCents([s]), 150 + 334);
    assert.equal(s.gross_charged_cents - nonRefundableFeeCents([s]), 10_000);
  });
  it("seller mode: platform fee only", () => {
    const s = resolveBookingCommissions(input({ processingFeePayer: "seller" }));
    assert.equal(nonRefundableFeeCents([s]), 150);
  });
  it("legacy included rows: 0 (refunds unchanged)", () => {
    assert.equal(nonRefundableFeeCents([{ client_surcharge_cents: 300 }]), 0);
  });
});
