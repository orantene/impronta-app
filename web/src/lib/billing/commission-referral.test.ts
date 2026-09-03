/**
 * Phase C — hub referral lane tests (resolver-level).
 *
 * The referral is a 4th money lane carved OUT OF the managing workspace's
 * margin (workspace_fee) and owed to the ORIGINATING channel
 * (source_workspace_id) when a re-homed cross-tenant inquiry was sourced
 * through a DIFFERENT workspace. It NEVER touches talent pay, the client
 * charge, or the platform fee.
 *
 * These pin down the four cases the lane must satisfy:
 *   (a) rate 0 / lane off → channel_referral = 0 AND every other lane is
 *       byte-identical to the no-referral baseline (the no-op proof);
 *   (b) on + rate > 0 + channel != managing → referral =
 *       round(subtotal * bps / 1e4) capped at workspace_fee, DEDUCTED from
 *       workspace_fee, and the 4-lane invariant holds;
 *   (c) channel === managing → 0 (sourced + managed by the same workspace);
 *   (d) independent talent (sellerOfRecord='talent') → 0 (no workspace margin).
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveBookingCommissions,
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
} from "./commission";

const HOME = "managing-agency-uuid";
const CHANNEL = "originating-hub-uuid";

const platformConfig = (
  overrides: Partial<PlatformCommissionConfig> = {},
): PlatformCommissionConfig => ({
  default_take_bps: 500, // 5% total (2.5% client / 2.5% seller)
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  ...overrides,
});

const baseInput = (
  overrides: Partial<ResolveBookingCommissionsInput> = {},
): ResolveBookingCommissionsInput => ({
  tenantId: HOME,
  workspacePlan: "agency",
  // Subtotal 1000.00, talent 800.00, margin 200.00.
  offerLineItems: [{ units: 1, line_total_cents: 100_000, talent_cost_total_cents: 80_000 }],
  currencyCode: "MXN",
  paymentMethod: "card",
  platformConfig: platformConfig(),
  tenantOverride: null,
  ...overrides,
});

/** The four lanes always sum to what the client is charged. */
function assertFourLaneInvariant(r: ReturnType<typeof resolveBookingCommissions>): void {
  assert.equal(
    r.talent_net_cents +
      r.workspace_fee_cents +
      r.platform_fee_cents +
      r.channel_referral_cents,
    r.gross_charged_cents,
    "talent + workspace + platform + channel_referral must equal gross_charged",
  );
}

describe("hub referral lane (a) rate 0 / lane off → no-op", () => {
  it("no referral inputs at all → channel_referral 0, lanes identical to baseline", () => {
    const baseline = resolveBookingCommissions(baseInput());
    assert.equal(baseline.channel_referral_cents, 0);
    assert.equal(baseline.channel_referral_party_id, null);
    // The baseline still satisfies the 4-lane invariant (referral term is 0).
    assertFourLaneInvariant(baseline);
  });

  it("rate 0 with channel set → byte-identical to the no-referral baseline", () => {
    const baseline = resolveBookingCommissions(baseInput());
    const rateZero = resolveBookingCommissions(
      baseInput({ hubReferralBps: 0, channelPartyId: CHANNEL, homeTenantId: HOME }),
    );
    assert.deepEqual(rateZero, baseline, "rate 0 must produce a byte-identical snapshot");
  });

  it("rate > 0 but lane semantically off (no channelPartyId) → byte-identical", () => {
    const baseline = resolveBookingCommissions(baseInput());
    const noChannel = resolveBookingCommissions(
      baseInput({ hubReferralBps: 200, channelPartyId: null, homeTenantId: HOME }),
    );
    assert.deepEqual(noChannel, baseline);
  });
});

describe("hub referral lane (b) on + rate>0 + channel != managing", () => {
  it("referral = round(subtotal*bps/1e4), deducted from workspace_fee, invariant holds", () => {
    const baseline = resolveBookingCommissions(baseInput());
    // 2% of 1000.00 subtotal = 20.00 = 2000 cents.
    const r = resolveBookingCommissions(
      baseInput({ hubReferralBps: 200, channelPartyId: CHANNEL, homeTenantId: HOME }),
    );
    assert.equal(r.channel_referral_cents, 2_000);
    assert.equal(r.channel_referral_party_id, CHANNEL);
    // Carved out of the workspace lane only.
    assert.equal(r.workspace_fee_cents, baseline.workspace_fee_cents - 2_000);
    // Talent + platform + client charge untouched.
    assert.equal(r.talent_net_cents, baseline.talent_net_cents);
    assert.equal(r.platform_fee_cents, baseline.platform_fee_cents);
    assert.equal(r.gross_charged_cents, baseline.gross_charged_cents);
    assert.equal(r.client_surcharge_cents, baseline.client_surcharge_cents);
    assertFourLaneInvariant(r);
  });

  it("referral is CAPPED at the available workspace_fee (never negative)", () => {
    // Baseline workspace_fee = margin(20000) - seller_deduction(2500) = 17500.
    // Ask for 50% of 100000 subtotal = 50000, far exceeding workspace_fee.
    const baseline = resolveBookingCommissions(baseInput());
    const r = resolveBookingCommissions(
      baseInput({ hubReferralBps: 5000, channelPartyId: CHANNEL, homeTenantId: HOME }),
    );
    assert.equal(r.channel_referral_cents, baseline.workspace_fee_cents);
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.channel_referral_party_id, CHANNEL);
    assertFourLaneInvariant(r);
  });

  it("rounds the referral with round() (not floor/ceil)", () => {
    // 333 bps of 100000 = 3330; 337 bps = 3370. Use an odd bps to exercise round.
    // 125 bps of 100123 -> exercise rounding: subtotal 100123, 125bps = 1251.5375 -> 1252.
    const r = resolveBookingCommissions(
      baseInput({
        offerLineItems: [{ units: 1, line_total_cents: 100_123, talent_cost_total_cents: 50_000 }],
        hubReferralBps: 125,
        channelPartyId: CHANNEL,
        homeTenantId: HOME,
      }),
    );
    assert.equal(r.channel_referral_cents, Math.round((100_123 * 125) / 10000));
    assertFourLaneInvariant(r);
  });
});

describe("hub referral lane (c) channel === managing → 0", () => {
  it("sourced + managed by the same workspace → no referral, byte-identical", () => {
    const baseline = resolveBookingCommissions(baseInput());
    const sameWorkspace = resolveBookingCommissions(
      baseInput({ hubReferralBps: 300, channelPartyId: HOME, homeTenantId: HOME }),
    );
    assert.equal(sameWorkspace.channel_referral_cents, 0);
    assert.equal(sameWorkspace.channel_referral_party_id, null);
    assert.deepEqual(sameWorkspace, baseline);
  });
});

describe("hub referral lane (d) independent talent → 0", () => {
  it("sellerOfRecord='talent' → no workspace margin to carve, referral 0", () => {
    const r = resolveBookingCommissions(
      baseInput({
        sellerOfRecord: "talent",
        hubReferralBps: 300,
        channelPartyId: CHANNEL,
        homeTenantId: HOME,
      }),
    );
    assert.equal(r.channel_referral_cents, 0);
    assert.equal(r.channel_referral_party_id, null);
    assert.equal(r.workspace_fee_cents, 0);
    // Independent-talent 3-lane invariant still holds (referral term is 0).
    assertFourLaneInvariant(r);
  });
});
