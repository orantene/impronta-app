/**
 * Menu money-spine pure helpers:
 *   • menuOrderToOfferLineSeeds — quantity survives for event / flat_package
 *   • revenueMatch — the $0 booking regression assertion
 *   • shortfall pin — talent-less inquiries produce no shortfall
 *
 * Run: npm run test:money
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { menuOrderToOfferLineSeeds } from "@/lib/talent/menu-order-offer";
import { offeringToOfferLineSeed } from "@/lib/talent/offerings-offer";

const TENANT = "tenant-menu-a";

/** Mirrors the post-convert assertion in inquiry-engine-booking.ts. */
export function revenuesMatch(bookedRevenue: number, offerTotal: number): boolean {
  return Math.round(bookedRevenue * 100) === Math.round(offerTotal * 100);
}

/**
 * Pure reimplementation of the FILTER in engine_inquiry_group_shortfall
 * (20261016074247): a group only shortfalls when offered_count > approved_count.
 * Pin so a future rewrite cannot re-introduce the false "quantity_required=1
 * with zero talent" block for menu orders.
 */
function groupShortfalls(groups: { offered_count: number; approved_count: number }[]): boolean {
  return groups.some((g) => g.offered_count > g.approved_count);
}

describe("menuOrderToOfferLineSeeds", () => {
  it("quantity survives for flat_package (2 pepperoni)", () => {
    const seeds = menuOrderToOfferLineSeeds(
      [
        {
          offeringId: "off-pep",
          title: "Pepperoni pizza",
          priceType: "flat_package",
          amountCents: 2500,
          quantity: 2,
        },
      ],
      TENANT,
    );
    assert.equal(seeds.length, 1);
    assert.equal(seeds[0]?.units, 2);
    assert.equal(seeds[0]?.unit_price, 25);
    assert.equal(seeds[0]?.total_price, 50);
    assert.equal(seeds[0]?.talent_profile_id, null);
    assert.equal(seeds[0]?.owner_tenant_id, TENANT);
    assert.equal(seeds[0]?.talent_cost, 0);
  });

  it("quantity survives for event", () => {
    const seeds = menuOrderToOfferLineSeeds(
      [
        {
          offeringId: "off-event",
          title: "Catering package",
          priceType: "event",
          amountCents: 10_000,
          quantity: 3,
        },
      ],
      TENANT,
    );
    assert.equal(seeds[0]?.units, 3);
    assert.equal(seeds[0]?.total_price, 300);
  });

  it("contrast: offeringToOfferLineSeed collapses flat_package qty to 1", () => {
    // Documents why we must not reuse it. talentProfileId required by that helper.
    const seed = offeringToOfferLineSeed(
      {
        id: "off-pep",
        talentProfileId: "tp-fake",
        title: "Pepperoni pizza",
        priceType: "flat_package",
        amountCents: 2500,
      },
      2,
    );
    assert.equal(seed?.units, 1, "legacy helper forces units=1 for flat_package");
  });

  it("clamps quantity to [1, 99]", () => {
    const low = menuOrderToOfferLineSeeds(
      [{ offeringId: "a", title: "A", priceType: "event", amountCents: 100, quantity: 0 }],
      TENANT,
    );
    const high = menuOrderToOfferLineSeeds(
      [{ offeringId: "a", title: "A", priceType: "event", amountCents: 100, quantity: 500 }],
      TENANT,
    );
    assert.equal(low[0]?.units, 1);
    assert.equal(high[0]?.units, 99);
  });
});

describe("revenue match assertion ($0 regression)", () => {
  it("matches when booking revenue equals offer total", () => {
    assert.equal(revenuesMatch(50, 50), true);
    assert.equal(revenuesMatch(49.99, 50), false);
  });

  it("rejects the $0 booking failure mode", () => {
    assert.equal(revenuesMatch(0, 50), false);
  });
});

describe("shortfall pin (talent-less menu inquiry)", () => {
  it("zero offered talents → no shortfall (convert proceeds)", () => {
    assert.equal(groupShortfalls([{ offered_count: 0, approved_count: 0 }]), false);
  });

  it("offered > approved → shortfall", () => {
    assert.equal(groupShortfalls([{ offered_count: 1, approved_count: 0 }]), true);
  });
});
