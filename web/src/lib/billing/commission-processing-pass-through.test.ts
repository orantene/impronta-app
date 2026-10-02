/**
 * processing_mode = 'pass_through' — pure resolver tests (owner decision
 * 2026-10-01): client pays subtotal + 1.5%; the seller bears the ACTUAL
 * processing fee at cost; Tulala nets exactly the surcharge.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveBookingCommissions,
  applyProcessingFeeToLanes,
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
} from "./commission";

const cfg = (o: Partial<PlatformCommissionConfig> = {}): PlatformCommissionConfig => ({
  default_take_bps: 600,
  default_take_floor_cents: 0,
  plan_tier_bps: { agency: 800 },
  client_surcharge_bps: 300,
  processing_mode: "pass_through",
  ...o,
});

const input = (o: Partial<ResolveBookingCommissionsInput> = {}): ResolveBookingCommissionsInput => ({
  tenantId: "t1",
  workspacePlan: "agency",
  offerLineItems: [{ line_total_cents: 10_000, talent_cost_total_cents: 10_000 }],
  currencyCode: "USD",
  paymentMethod: "card",
  sellerOfRecord: "talent",
  platformConfig: cfg(),
  tenantOverride: null,
  ...o,
});

const lanes = (s: ReturnType<typeof resolveBookingCommissions>) =>
  s.talent_net_cents + s.workspace_fee_cents + s.platform_fee_cents + s.channel_referral_cents +
  (s.processing_fee_cents ?? 0);

describe("pass_through — worked examples", () => {
  it("USD: $100 subtotal, client pays $101.50, Stripe fee $3.24, talent $96.76, Tulala $1.50", () => {
    // Stripe 2.9% + $0.30 of $101.50 = 324.35 cents -> 324 (Math.round, as the code rounds)
    const fee = Math.round(10_150 * 0.029 + 30);
    assert.equal(fee, 324);
    const s = resolveBookingCommissions(input({ processingFeeCents: fee }));
    assert.equal(s.gross_cents, 10_000);
    assert.equal(s.client_surcharge_cents, 150);
    assert.equal(s.seller_deduction_cents, 0);
    assert.equal(s.gross_charged_cents, 10_150);
    assert.equal(s.processing_fee_cents, 324);
    assert.equal(s.talent_net_cents, 9_676);
    assert.equal(s.platform_fee_cents, 150);
    assert.equal(s.workspace_fee_cents, 0);
    assert.equal(s.seller_shortfall_cents, 0);
    assert.equal(lanes(s), s.gross_charged_cents);
    assert.equal(s.processing_mode, "pass_through");
  });

  it("MXN: 1,000.00 subtotal, gross 1,015.00, fee 45.87 given, talent 954.13, Tulala 15.00", () => {
    const s = resolveBookingCommissions(
      input({
        currencyCode: "MXN",
        offerLineItems: [{ line_total_cents: 100_000, talent_cost_total_cents: 100_000 }],
        processingFeeCents: 4_587,
      }),
    );
    assert.equal(s.gross_charged_cents, 101_500);
    assert.equal(s.talent_net_cents, 95_413);
    assert.equal(s.platform_fee_cents, 1_500);
    assert.equal(s.processing_fee_cents, 4_587);
    assert.equal(lanes(s), 101_500);
  });
});

describe("pass_through — provisional lanes (fee not yet known)", () => {
  it("omitting the fee gives talent_net = subtotal and processing_fee 0; invariant holds", () => {
    const s = resolveBookingCommissions(input());
    assert.equal(s.talent_net_cents, 10_000);
    assert.equal(s.processing_fee_cents, 0);
    assert.equal(s.platform_fee_cents, 150);
    assert.equal(lanes(s), s.gross_charged_cents);
  });

  it("flat 150 bps regardless of plan-tier / default take / client_surcharge_bps config", () => {
    const s = resolveBookingCommissions(input({ platformConfig: cfg({ plan_tier_bps: { agency: 2000 } }) }));
    assert.equal(s.platform_take_bps, 150);
    assert.equal(s.client_surcharge_cents, 150);
    assert.equal(s.seller_deduction_cents, 0);
  });

  it("pass_through_take_bps config replaces the 150 default", () => {
    const s = resolveBookingCommissions(input({ platformConfig: cfg({ pass_through_take_bps: 200 }) }));
    assert.equal(s.client_surcharge_cents, 200);
  });

  it("a tenant override still wins and lands entirely on the client", () => {
    const s = resolveBookingCommissions(
      input({ tenantOverride: { platform_take_bps: 300, platform_take_floor_cents: null } }),
    );
    assert.equal(s.client_surcharge_cents, 300);
    assert.equal(s.seller_deduction_cents, 0);
    assert.equal(s.resolved_from, "tenant_override");
  });
});

describe("pass_through — rounding edges", () => {
  it("surcharge rounds half up on odd subtotals (999 * 1.5% = 14.985 -> 15)", () => {
    const s = resolveBookingCommissions(
      input({ offerLineItems: [{ line_total_cents: 999, talent_cost_total_cents: 999 }], processingFeeCents: 59 }),
    );
    assert.equal(s.client_surcharge_cents, 15);
    assert.equal(s.gross_charged_cents, 1_014);
    assert.equal(s.talent_net_cents, 940);
    assert.equal(lanes(s), 1_014);
  });

  it("zero fee leaves talent whole", () => {
    const s = resolveBookingCommissions(input({ processingFeeCents: 0 }));
    assert.equal(s.talent_net_cents, 10_000);
    assert.equal(s.processing_fee_cents, 0);
  });

  it("rejects a negative or fractional fee", () => {
    assert.throws(() => resolveBookingCommissions(input({ processingFeeCents: -1 })));
    assert.throws(() => resolveBookingCommissions(input({ processingFeeCents: 1.5 })));
  });

  it("floor tops up the client surcharge, never the seller", () => {
    const s = resolveBookingCommissions(
      input({ platformConfig: cfg({ default_take_floor_cents: 500 }), processingFeeCents: 324 }),
    );
    assert.equal(s.client_surcharge_cents, 500);
    assert.equal(s.talent_net_cents, 10_000 - 324);
    assert.equal(lanes(s), s.gross_charged_cents);
  });
});

describe("pass_through — workspace is seller of record", () => {
  const ws = (margin: number, fee: number | null, extra: Partial<ResolveBookingCommissionsInput> = {}) =>
    resolveBookingCommissions(
      input({
        sellerOfRecord: "workspace",
        offerLineItems: [{ line_total_cents: 10_000, talent_cost_total_cents: 10_000 - margin }],
        processingFeeCents: fee,
        ...extra,
      }),
    );

  it("talent is paid the FULL quote; the workspace bears the fee out of its margin", () => {
    const s = ws(2_000, 324);
    assert.equal(s.talent_net_cents, 8_000);
    assert.equal(s.workspace_fee_cents, 2_000 - 324);
    assert.equal(s.platform_fee_cents, 150);
    assert.equal(s.seller_shortfall_cents, 0);
    assert.equal(s.processing_fee_shortfall_cents, 0);
    assert.equal(lanes(s), s.gross_charged_cents);
  });

  it("thin margin: the platform absorbs the gap and surfaces a shortfall; talent stays whole", () => {
    const s = ws(100, 324);
    assert.equal(s.talent_net_cents, 9_900);
    assert.equal(s.workspace_fee_cents, 0);
    assert.equal(s.processing_fee_shortfall_cents, 224);
    assert.equal(s.seller_shortfall_cents, 224);
    assert.equal(s.platform_fee_cents, 150 - 224);
    assert.equal(lanes(s), s.gross_charged_cents);
  });

  it("zero margin: the whole fee is a platform-absorbed shortfall", () => {
    const s = ws(0, 324);
    assert.equal(s.talent_net_cents, 10_000);
    assert.equal(s.processing_fee_shortfall_cents, 324);
    assert.equal(lanes(s), s.gross_charged_cents);
  });

  it("referral is carved before the fee and is never reduced by it", () => {
    const s = ws(2_000, 324, {
      hubReferralBps: 500,
      channelPartyId: "chan",
      homeTenantId: "home",
    });
    assert.equal(s.channel_referral_cents, 500);
    assert.equal(s.workspace_fee_cents, 2_000 - 500 - 324);
    assert.equal(s.talent_net_cents, 8_000);
    assert.equal(lanes(s), s.gross_charged_cents);
  });
});

describe("included mode is untouched (default)", () => {
  it("no processing_mode => legacy math and NO new keys on the snapshot", () => {
    const s = resolveBookingCommissions(
      input({
        platformConfig: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {}, client_surcharge_bps: 300 },
        processingFeeCents: 999, // ignored in included mode
      }),
    );
    assert.equal(s.client_surcharge_cents, 300);
    assert.equal(s.seller_deduction_cents, 300);
    assert.equal(s.talent_net_cents, 9_700);
    assert.equal("processing_mode" in s, false);
    assert.equal("processing_fee_cents" in s, false);
  });

  it("explicit input processingMode 'included' overrides a pass_through config", () => {
    const s = resolveBookingCommissions(input({ processingMode: "included" }));
    assert.equal(s.platform_take_bps, 800); // legacy plan-tier layer (agency) applies
    assert.equal("processing_mode" in s, false);
  });
});

describe("applyProcessingFeeToLanes", () => {
  it("talent seller floors at 0 and pushes the excess to the platform", () => {
    const r = applyProcessingFeeToLanes({
      sellerOfRecord: "talent",
      talentNetCents: 100,
      workspaceFeeCents: 0,
      platformFeeCents: 150,
      processingFeeCents: 130,
    });
    assert.deepEqual(r, { talentNetCents: 0, workspaceFeeCents: 0, platformFeeCents: 120, shortfallCents: 30 });
  });
});
