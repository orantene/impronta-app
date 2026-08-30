/**
 * House-lane commission characterization + mixed talent+house offer.
 *
 * resolveBookingCommissions needs ZERO house-specific branches: feed
 * talent_cost_cents=0 and sellerOfRecord="workspace".
 *
 * Run: npm run test:money
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveBookingCommissions,
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
} from "./commission";

const TENANT = "tenant-menu-1";

const cfg = (o: Partial<PlatformCommissionConfig> = {}): PlatformCommissionConfig => ({
  default_take_bps: 500,
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  ...o,
});

const input = (o: Partial<ResolveBookingCommissionsInput> = {}): ResolveBookingCommissionsInput => ({
  tenantId: TENANT,
  workspacePlan: "studio",
  offerLineItems: [{ units: 1, unit_price_cents: 10_000, talent_cost_cents: 0 }],
  currencyCode: "USD",
  paymentMethod: "card",
  platformConfig: cfg(),
  tenantOverride: null,
  sellerOfRecord: "workspace",
  ...o,
});

describe("house lane commission", () => {
  it("talent_cost=0 + sellerOfRecord=workspace → talent net 0, workspace takes margin less seller deduction", () => {
    const snap = resolveBookingCommissions(input());
    assert.equal(snap.talent_net_cents, 0);
    // 5% of 10000 = 500; even client/seller split → 250 each.
    // margin = 10000; workspace = 10000 - 250 = 9750; platform = 500.
    assert.equal(snap.platform_fee_cents, 500);
    assert.equal(snap.workspace_fee_cents, 9750);
    assert.equal(snap.gross_charged_cents, 10_250); // subtotal + client surcharge
    assert.equal(
      snap.talent_net_cents + snap.workspace_fee_cents + snap.platform_fee_cents + (snap.channel_referral_cents ?? 0),
      snap.gross_charged_cents,
    );
  });

  it("2× flat_package pizza ($25) → quantity survives in subtotal", () => {
    const snap = resolveBookingCommissions(
      input({
        offerLineItems: [{ units: 2, unit_price_cents: 2500, talent_cost_cents: 0 }],
      }),
    );
    // subtotal 5000; 5% = 250; split 125/125; workspace 4875; gross 5125
    assert.equal(snap.talent_net_cents, 0);
    assert.equal(snap.workspace_fee_cents, 4875);
    assert.equal(snap.gross_charged_cents, 5125);
  });
});

describe("mixed talent + house offer (two resolver calls, one booking)", () => {
  it("talent lane and house lane both pay correctly when resolved separately", () => {
    const talent = resolveBookingCommissions(
      input({
        sellerOfRecord: "workspace",
        offerLineItems: [{ units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 }],
      }),
    );
    const house = resolveBookingCommissions(
      input({
        sellerOfRecord: "workspace",
        offerLineItems: [{ units: 2, unit_price_cents: 2500, talent_cost_cents: 0 }],
      }),
    );

    assert.equal(talent.talent_net_cents, 80_000);
    assert.ok(talent.workspace_fee_cents > 0);

    assert.equal(house.talent_net_cents, 0);
    assert.equal(house.workspace_fee_cents, 4875);

    // Combined client charge is the sum of both grosses (one PI per booking
    // in production still charges the sum; lanes are snapshotted per participant).
    const combinedGross = talent.gross_charged_cents + house.gross_charged_cents;
    assert.ok(combinedGross > talent.gross_charged_cents);
    assert.ok(combinedGross > house.gross_charged_cents);
  });
});
