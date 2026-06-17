/**
 * Unit tests for the commission resolver (talent-protected split).
 *
 * The resolver is pure — no mocks needed, no DB, no Stripe. Just inputs in,
 * snapshot out. Tests pin down:
 *   - the override hierarchy (platform → plan-tier → tenant → booking)
 *   - the talent-protected split (client surcharge + seller deduction)
 *   - talent is paid in full when a workspace is the seller of record
 *   - independent talent bears the seller-side fee directly
 *   - a thin/zero-margin workspace → platform absorbs the gap (talent whole)
 *   - floor enforcement (topped up via the client surcharge)
 *   - input validation (negative, talent > price, no items, currency)
 *   - the lane-sum invariant (lanes sum to what the client is charged)
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveBookingCommissions,
  reconcileBookingLanes,
  CommissionResolutionError,
  isOffPlatformPaymentMethod,
  balanceSummary,
  type BookingLaneRow,
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
} from "./commission";

const TENANT = "tenant-uuid-1";

const defaultPlatformConfig = (
  overrides: Partial<PlatformCommissionConfig> = {},
): PlatformCommissionConfig => ({
  default_take_bps: 500,           // 5% total (split 2.5% client / 2.5% seller)
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  ...overrides,
});

const baseInput = (
  overrides: Partial<ResolveBookingCommissionsInput> = {},
): ResolveBookingCommissionsInput => ({
  tenantId: TENANT,
  workspacePlan: "agency",
  offerLineItems: [
    { units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 },
  ],
  currencyCode: "MXN",
  paymentMethod: "card",
  platformConfig: defaultPlatformConfig(),
  tenantOverride: null,
  ...overrides,
});

function expectCode(
  fn: () => unknown,
  code: CommissionResolutionError["code"],
): void {
  assert.throws(fn, (e: unknown) => {
    assert.ok(
      e instanceof CommissionResolutionError,
      `expected CommissionResolutionError, got ${String(e)}`,
    );
    assert.equal(e.code, code, `expected code '${code}', got '${e.code}'`);
    return true;
  });
}

describe("resolveBookingCommissions — happy path (talent-protected)", () => {
  it("computes the lanes for a single line item, card payment", () => {
    // Subtotal = 1000.00 MXN (talent 800 + margin 200)
    // 5% total, even split → 2.5% client + 2.5% seller
    //   client surcharge = 25.00 (added on top)
    //   seller deduction = 25.00 (out of the 200 margin)
    //   platform fee     = 50.00
    //   talent net       = 800.00  (FULL quote — protected)
    //   workspace net    = 200 − 25 = 175.00
    //   client charged   = 1000 + 25 = 1025.00
    const result = resolveBookingCommissions(baseInput());
    assert.equal(result.gross_cents, 100_000);        // subtotal (service value)
    assert.equal(result.client_surcharge_cents, 2_500);
    assert.equal(result.seller_deduction_cents, 2_500);
    assert.equal(result.platform_fee_cents, 5_000);   // total take, unchanged
    assert.equal(result.workspace_fee_cents, 17_500); // margin net of deduction
    assert.equal(result.talent_net_cents, 80_000);    // protected — full quote
    assert.equal(result.gross_charged_cents, 102_500);
    assert.equal(result.seller_shortfall_cents, 0);
    assert.equal(result.seller_of_record, "workspace");
    assert.equal(result.platform_take_bps, 500);
    assert.equal(result.resolved_from, "platform_default");
    assert.equal(result.currency_code, "MXN");
    assert.equal(result.payment_method, "card");
    assert.equal(result.off_platform_reason, null);
  });

  it("sums multiple line items correctly", () => {
    const result = resolveBookingCommissions(baseInput({
      offerLineItems: [
        { units: 2, unit_price_cents: 50_000, talent_cost_cents: 40_000 }, // 1000 sub, 200 margin
        { units: 1, unit_price_cents: 80_000, talent_cost_cents: 60_000 }, // 800 sub, 200 margin
      ],
    }));
    assert.equal(result.gross_cents, 180_000);        // 1800 subtotal
    assert.equal(result.platform_fee_cents, 9_000);   // 5% of 1800 = 90
    assert.equal(result.client_surcharge_cents, 4_500);
    assert.equal(result.seller_deduction_cents, 4_500);
    assert.equal(result.workspace_fee_cents, 35_500); // 400 margin − 45
    assert.equal(result.talent_net_cents, 140_000);   // 1400 full talent quote
    assert.equal(result.gross_charged_cents, 184_500);
  });
});

describe("the canonical example (6% = 3% client + 3% seller)", () => {
  it("2 talent @ MX$1,500 + MX$500 markup each → client 4,120 / talent 3,000 / workspace 880 / platform 240", () => {
    // The product owner's worked example. 6% total, 3% client surcharge.
    const result = resolveBookingCommissions(baseInput({
      currencyCode: "MXN",
      platformConfig: defaultPlatformConfig({
        default_take_bps: 600,        // 6% total
        client_surcharge_bps: 300,    // 3% from the client; the other 3% from the seller
      }),
      offerLineItems: [
        { units: 1, unit_price_cents: 200_000, talent_cost_cents: 150_000 }, // girl 1
        { units: 1, unit_price_cents: 200_000, talent_cost_cents: 150_000 }, // girl 2
      ],
    }));
    assert.equal(result.gross_cents, 400_000);          // MX$4,000 service subtotal
    assert.equal(result.client_surcharge_cents, 12_000); // +MX$120 (3%)
    assert.equal(result.gross_charged_cents, 412_000);   // client pays MX$4,120
    assert.equal(result.talent_net_cents, 300_000);      // talent get MX$3,000 (full)
    assert.equal(result.workspace_fee_cents, 88_000);    // workspace MX$880 (1,000 − 120)
    assert.equal(result.platform_fee_cents, 24_000);     // platform MX$240 (6%)
    assert.equal(result.seller_of_record, "workspace");
    assert.equal(result.seller_shortfall_cents, 0);
    // Everything the client pays is accounted for across the three lanes.
    assert.equal(
      result.talent_net_cents + result.workspace_fee_cents + result.platform_fee_cents,
      result.gross_charged_cents,
    );
  });
});

describe("independent talent bears the seller-side fee", () => {
  it("no workspace margin → talent is the seller of record (3% client + 3% off talent)", () => {
    const result = resolveBookingCommissions(baseInput({
      sellerOfRecord: "talent",
      workspacePlan: "free",
      platformConfig: defaultPlatformConfig({
        default_take_bps: 600,
        client_surcharge_bps: 300,
      }),
      offerLineItems: [
        // Independent talent sells direct — quote == price, no markup.
        { units: 1, unit_price_cents: 100_000, talent_cost_cents: 100_000 },
      ],
    }));
    assert.equal(result.gross_cents, 100_000);
    assert.equal(result.client_surcharge_cents, 3_000);  // 3% on top
    assert.equal(result.seller_deduction_cents, 3_000);  // 3% off the talent
    assert.equal(result.talent_net_cents, 97_000);       // talent bears their half
    assert.equal(result.workspace_fee_cents, 0);
    assert.equal(result.platform_fee_cents, 6_000);
    assert.equal(result.gross_charged_cents, 103_000);
    assert.equal(result.seller_of_record, "talent");
  });
});

describe("thin / zero-margin workspace — platform absorbs, talent stays whole", () => {
  it("Free friend-link (talent_cost == unit_price): talent gets 100%, only the client surcharge is collected", () => {
    const result = resolveBookingCommissions(baseInput({
      workspacePlan: "free",
      offerLineItems: [
        { units: 1, unit_price_cents: 100_000, talent_cost_cents: 100_000 },
      ],
    }));
    assert.equal(result.workspace_fee_cents, 0);
    assert.equal(result.talent_net_cents, 100_000);     // full — never touched
    assert.equal(result.seller_deduction_cents, 0);     // no margin to take from
    assert.equal(result.seller_shortfall_cents, 2_500); // surfaced for the composer
    assert.equal(result.client_surcharge_cents, 2_500);
    assert.equal(result.platform_fee_cents, 2_500);     // client side only
    assert.equal(result.gross_charged_cents, 102_500);
  });
});

describe("workspace base reservation fee", () => {
  const overrideWith = (
    o: { base_reservation_fee_cents?: number | null; base_reservation_fee_bps?: number | null },
  ) => ({ platform_take_bps: null, platform_take_floor_cents: null, ...o });

  it("a flat base fee adds to the client total AND the workspace take; talent + platform unchanged", () => {
    // base 100000 subtotal, 5% take (2500 client + 2500 seller), +MX$20 flat.
    const r = resolveBookingCommissions(baseInput({
      tenantOverride: overrideWith({ base_reservation_fee_cents: 2_000 }),
    }));
    assert.equal(r.base_reservation_fee_cents, 2_000);
    assert.equal(r.gross_charged_cents, 104_500); // 100000 + 2500 surcharge + 2000 base
    assert.equal(r.workspace_fee_cents, 19_500);  // 20000 margin − 2500 + 2000 base
    assert.equal(r.talent_net_cents, 80_000);     // protected — never touched
    assert.equal(r.platform_fee_cents, 5_000);    // platform does NOT take the base fee
    assert.equal(
      r.talent_net_cents + r.workspace_fee_cents + r.platform_fee_cents,
      r.gross_charged_cents,
    );
  });

  it("a % base fee is computed off the subtotal", () => {
    const r = resolveBookingCommissions(baseInput({
      tenantOverride: overrideWith({ base_reservation_fee_bps: 500 }), // 5% of subtotal
    }));
    assert.equal(r.base_reservation_fee_cents, 5_000); // 5% of 100000
    assert.equal(r.gross_charged_cents, 107_500);      // 100000 + 2500 + 5000
    assert.equal(r.workspace_fee_cents, 22_500);       // 20000 − 2500 + 5000
  });

  it("the base fee is clamped to the platform caps", () => {
    const r = resolveBookingCommissions(baseInput({
      platformConfig: defaultPlatformConfig({ max_base_fee_cents: 1_000 }),
      tenantOverride: overrideWith({ base_reservation_fee_cents: 9_999 }),
    }));
    assert.equal(r.base_reservation_fee_cents, 1_000); // capped at the platform max
  });

  it("an independent-talent sale has no base fee (workspace-only)", () => {
    const r = resolveBookingCommissions(baseInput({
      sellerOfRecord: "talent",
      offerLineItems: [{ units: 1, unit_price_cents: 100_000, talent_cost_cents: 100_000 }],
      tenantOverride: overrideWith({ base_reservation_fee_cents: 2_000 }),
    }));
    assert.equal(r.base_reservation_fee_cents, 0);
    assert.equal(r.workspace_fee_cents, 0);
  });
});

describe("override hierarchy", () => {
  it("plan-tier overrides platform default", () => {
    const result = resolveBookingCommissions(baseInput({
      workspacePlan: "network",
      platformConfig: defaultPlatformConfig({
        default_take_bps: 500,
        plan_tier_bps: { network: 250 }, // 2.5%
      }),
    }));
    assert.equal(result.platform_take_bps, 250);
    assert.equal(result.platform_fee_cents, 2_500); // 2.5% of 1000 = 25
    assert.equal(result.resolved_from, "plan_tier");
    assert.equal(result.talent_net_cents, 80_000);  // still protected
  });

  it("tenant override beats plan-tier", () => {
    const result = resolveBookingCommissions(baseInput({
      workspacePlan: "agency",
      platformConfig: defaultPlatformConfig({
        default_take_bps: 500,
        plan_tier_bps: { agency: 350 },
      }),
      tenantOverride: {
        platform_take_bps: 200, // 2% — negotiated rate
        platform_take_floor_cents: null,
      },
    }));
    assert.equal(result.platform_take_bps, 200);
    assert.equal(result.platform_fee_cents, 2_000);
    assert.equal(result.resolved_from, "tenant_override");
  });

  it("booking override beats tenant override", () => {
    const result = resolveBookingCommissions(baseInput({
      tenantOverride: { platform_take_bps: 200, platform_take_floor_cents: null },
      bookingPlatformTakeBpsOverride: 100, // 1% — one-off charity booking
    }));
    assert.equal(result.platform_take_bps, 100);
    assert.equal(result.platform_fee_cents, 1_000);
    assert.equal(result.resolved_from, "booking_override");
  });

  it("falls back through layers when no override present", () => {
    const result = resolveBookingCommissions(baseInput({
      workspacePlan: "studio",
      platformConfig: defaultPlatformConfig({
        plan_tier_bps: { agency: 350 }, // studio NOT listed
      }),
      tenantOverride: null,
    }));
    assert.equal(result.platform_take_bps, 500); // falls back to default
    assert.equal(result.resolved_from, "platform_default");
  });
});

describe("floor enforcement (topped up via the client surcharge)", () => {
  it("applies platform floor when % take would be smaller", () => {
    // 1% on a small 1000-cent booking = 10 cents; floor = 50 cents → floor wins
    const result = resolveBookingCommissions(baseInput({
      offerLineItems: [
        { units: 1, unit_price_cents: 1_000, talent_cost_cents: 500 },
      ],
      platformConfig: defaultPlatformConfig({
        default_take_bps: 100,
        default_take_floor_cents: 50,
      }),
    }));
    assert.equal(result.platform_fee_cents, 50);
    assert.equal(result.talent_net_cents, 500); // talent quote untouched
  });

  it("% take wins when greater than floor", () => {
    // 5% on 100000 cents = 5000; floor = 50 → bps wins
    const result = resolveBookingCommissions(baseInput({
      platformConfig: defaultPlatformConfig({
        default_take_bps: 500,
        default_take_floor_cents: 50,
      }),
    }));
    assert.equal(result.platform_fee_cents, 5_000);
  });

  it("tenant override floor overrides platform floor", () => {
    const result = resolveBookingCommissions(baseInput({
      offerLineItems: [
        { units: 1, unit_price_cents: 1_000, talent_cost_cents: 500 },
      ],
      platformConfig: defaultPlatformConfig({
        default_take_bps: 100,
        default_take_floor_cents: 50,
      }),
      tenantOverride: {
        platform_take_bps: null,
        platform_take_floor_cents: 100, // higher floor for this tenant
      },
    }));
    assert.equal(result.platform_fee_cents, 100);
  });

  it("a floor larger than the take is covered by the client — talent stays whole", () => {
    // Tiny 100-cent service, floor 200. Old model threw (talent went
    // negative). Talent-protected: the client covers the floor instead.
    const result = resolveBookingCommissions(baseInput({
      offerLineItems: [
        { units: 1, unit_price_cents: 100, talent_cost_cents: 100 },
      ],
      platformConfig: defaultPlatformConfig({
        default_take_floor_cents: 200,
      }),
    }));
    assert.equal(result.talent_net_cents, 100);        // never touched
    assert.equal(result.workspace_fee_cents, 0);
    assert.equal(result.platform_fee_cents, 200);      // floor met
    assert.equal(result.client_surcharge_cents, 200);  // client covers it
    assert.equal(result.gross_charged_cents, 300);
  });
});

describe("off-platform payment", () => {
  it("preserves payment_method and reason in snapshot", () => {
    const result = resolveBookingCommissions(baseInput({
      paymentMethod: "cash",
      offPlatformReason: "Client requested cash at venue",
    }));
    assert.equal(result.payment_method, "cash");
    assert.equal(result.off_platform_reason, "Client requested cash at venue");
  });

  it("isOffPlatformPaymentMethod identifies cash / wire / venue / crypto / other", () => {
    assert.equal(isOffPlatformPaymentMethod("cash"), true);
    assert.equal(isOffPlatformPaymentMethod("wire"), true);
    assert.equal(isOffPlatformPaymentMethod("venue_paid"), true);
    assert.equal(isOffPlatformPaymentMethod("crypto"), true);
    assert.equal(isOffPlatformPaymentMethod("other"), true);
    assert.equal(isOffPlatformPaymentMethod("card"), false);
    assert.equal(isOffPlatformPaymentMethod("apple_pay"), false);
    assert.equal(isOffPlatformPaymentMethod("bank_transfer"), false);
  });
});

describe("input validation", () => {
  it("throws no_line_items on empty offer", () => {
    assert.throws(
      () => resolveBookingCommissions(baseInput({ offerLineItems: [] })),
      CommissionResolutionError,
    );
  });

  it("throws negative_line_item on negative units", () => {
    expectCode(
      () => resolveBookingCommissions(baseInput({
        offerLineItems: [{ units: -1, unit_price_cents: 100, talent_cost_cents: 50 }],
      })),
      "negative_line_item",
    );
  });

  it("throws talent_cost_exceeds_price when talent paid more than client pays", () => {
    expectCode(
      () => resolveBookingCommissions(baseInput({
        offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 200 }],
      })),
      "talent_cost_exceeds_price",
    );
  });

  it("throws currency_invalid on non-3-letter currency", () => {
    // "MEX" is 3 letters → valid (no throw)
    resolveBookingCommissions(baseInput({ currencyCode: "MEX" }));
    // "MX" is 2 letters → throws
    expectCode(
      () => resolveBookingCommissions(baseInput({ currencyCode: "MX" })),
      "currency_invalid",
    );
  });

  it("throws platform_take_out_of_range when override exceeds 50%", () => {
    expectCode(
      () => resolveBookingCommissions(baseInput({
        tenantOverride: { platform_take_bps: 6000, platform_take_floor_cents: null }, // 60%
      })),
      "platform_take_out_of_range",
    );
  });
});

describe("lane-sum invariant", () => {
  it("lanes always sum to what the client is charged", () => {
    const cases: ResolveBookingCommissionsInput[] = [
      baseInput(),
      baseInput({
        offerLineItems: [
          { units: 3, unit_price_cents: 12_345, talent_cost_cents: 7_890 },
          { units: 5, unit_price_cents: 99_999, talent_cost_cents: 80_000 },
        ],
      }),
      baseInput({
        platformConfig: defaultPlatformConfig({ default_take_bps: 333 }),
      }),
      baseInput({
        offerLineItems: [{ units: 1, unit_price_cents: 1, talent_cost_cents: 0 }],
        platformConfig: defaultPlatformConfig({ default_take_floor_cents: 0 }),
      }),
      baseInput({
        sellerOfRecord: "talent",
        offerLineItems: [{ units: 4, unit_price_cents: 25_000, talent_cost_cents: 25_000 }],
      }),
    ];
    for (const input of cases) {
      const r = resolveBookingCommissions(input);
      assert.equal(
        r.talent_net_cents + r.workspace_fee_cents + r.platform_fee_cents,
        r.gross_charged_cents,
      );
      // No lane ever goes negative.
      assert.ok(r.talent_net_cents >= 0);
      assert.ok(r.workspace_fee_cents >= 0);
      assert.ok(r.platform_fee_cents >= 0);
    }
  });
});

describe("balanceSummary", () => {
  it("filters zero balances and sorts descending", () => {
    const summary = balanceSummary({ USD: 500, MXN: 12_000, EUR: 0, GBP: -100 });
    assert.deepEqual(summary, [
      { currency: "MXN", cents: 12_000 },
      { currency: "USD", cents: 500 },
      { currency: "GBP", cents: -100 },
    ]);
  });

  it("returns empty array when all balances are zero", () => {
    assert.deepEqual(balanceSummary({ USD: 0, MXN: 0 }), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 — instant-book must charge the SAME client gross as the normal offer path
// for the same fixed rate. Both paths feed the SAME resolver and read the gross
// back via sumBookingGrossChargedCents, so this pins the shared math:
//   • instant-book's line item has zero margin (unit_price == talent_cost ==
//     the fixed rate) — the platform's client-side surcharge is still added on
//     top, so the client is charged MORE than the bare fixed rate (the bug was
//     charging the raw fixedRateCents).
//   • an offer-path line item with the SAME fixed rate (whatever its margin)
//     yields the identical client surcharge + gross for the same subtotal —
//     proving instant-book is not undercharged relative to the offer path.
// ─────────────────────────────────────────────────────────────────────────────
describe("A2 — instant-book client gross matches the offer path (shared resolver)", () => {
  const FIXED_RATE_CENTS = 100_000; // $1,000 fixed rate

  it("instant-book gross = subtotal + platform surcharge, NOT the bare fixed rate", () => {
    // Instant-book line item: no coordinator margin (subtotal == talent cost).
    const instantBook = resolveBookingCommissions(baseInput({
      currencyCode: "USD",
      platformConfig: defaultPlatformConfig({ default_take_bps: 600, client_surcharge_bps: 300 }),
      offerLineItems: [
        { units: 1, unit_price_cents: FIXED_RATE_CENTS, talent_cost_cents: FIXED_RATE_CENTS },
      ],
    }));
    assert.equal(instantBook.gross_cents, FIXED_RATE_CENTS);          // subtotal == fixed rate
    assert.equal(instantBook.client_surcharge_cents, 3_000);          // 3% on top
    assert.equal(instantBook.gross_charged_cents, 103_000);           // client pays $1,030
    assert.ok(
      instantBook.gross_charged_cents > FIXED_RATE_CENTS,
      "client must be charged the surcharge ON TOP of the fixed rate (the A2 undercharge fix)",
    );
    assert.equal(instantBook.talent_net_cents, FIXED_RATE_CENTS);     // talent paid the full fixed rate
  });

  it("the same fixed rate billed via the offer path yields the IDENTICAL client gross", () => {
    const cfg = defaultPlatformConfig({ default_take_bps: 600, client_surcharge_bps: 300 });
    const instantBook = resolveBookingCommissions(baseInput({
      currencyCode: "USD",
      platformConfig: cfg,
      offerLineItems: [
        { units: 1, unit_price_cents: FIXED_RATE_CENTS, talent_cost_cents: FIXED_RATE_CENTS },
      ],
    }));
    // Offer path for the SAME fixed-rate subtotal (here with an agency margin —
    // the client surcharge keys off the subtotal, so the gross matches).
    const offerPath = resolveBookingCommissions(baseInput({
      currencyCode: "USD",
      platformConfig: cfg,
      offerLineItems: [
        { units: 1, unit_price_cents: FIXED_RATE_CENTS, talent_cost_cents: 80_000 },
      ],
    }));
    assert.equal(instantBook.gross_charged_cents, offerPath.gross_charged_cents);
    assert.equal(instantBook.client_surcharge_cents, offerPath.client_surcharge_cents);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 hardening (c) — multi-talent rounding drift. A booking with two talent
// participants and ODD-cents lines: each per-participant snapshot already
// satisfies the per-ROW invariant (talent + workspace + platform === gross
// charged), so summing the two rows must land EXACTLY on Σ(gross_charged) with
// no cents stranded on the platform balance. reconcileBookingLanes is the
// booking-level assertion that proves this and (defensively) reports any drift.
// ─────────────────────────────────────────────────────────────────────────────
describe("(c) multi-talent rounding — booking lanes reconcile exactly", () => {
  // Two participants, odd-cents prices that DON'T divide evenly by the take —
  // the per-row rounding is where naive independent rounding could drift.
  const cfg = defaultPlatformConfig({ default_take_bps: 333, client_surcharge_bps: 167 });
  const girl1 = resolveBookingCommissions(baseInput({
    currencyCode: "USD",
    platformConfig: cfg,
    offerLineItems: [{ units: 3, unit_price_cents: 33_333, talent_cost_cents: 21_111 }],
  }));
  const girl2 = resolveBookingCommissions(baseInput({
    currencyCode: "USD",
    platformConfig: cfg,
    offerLineItems: [{ units: 7, unit_price_cents: 14_287, talent_cost_cents: 9_991 }],
  }));
  const rows: BookingLaneRow[] = [
    { participant_id: "p1", talent_net_cents: girl1.talent_net_cents, workspace_fee_cents: girl1.workspace_fee_cents, platform_fee_cents: girl1.platform_fee_cents, gross_charged_cents: girl1.gross_charged_cents },
    { participant_id: "p2", talent_net_cents: girl2.talent_net_cents, workspace_fee_cents: girl2.workspace_fee_cents, platform_fee_cents: girl2.platform_fee_cents, gross_charged_cents: girl2.gross_charged_cents },
  ];

  it("each row balances on its own (per-row invariant)", () => {
    for (const r of rows) {
      assert.equal(
        r.talent_net_cents + r.workspace_fee_cents + r.platform_fee_cents,
        r.gross_charged_cents,
      );
    }
  });

  it("Σ(talent)+Σ(workspace)+Σ(platform) === Σ(gross_charged) — zero drift across participants", () => {
    const recon = reconcileBookingLanes(rows);
    assert.equal(recon.laneTotalCents, recon.grossChargedTotalCents);
    assert.equal(recon.driftCents, 0);
    assert.equal(recon.adjustParticipantId, null); // no correction needed
  });

  it("detects an injected drift and targets the largest-gross participant for the correcting cent", () => {
    // Simulate a future bug: a lane row that's 1 cent short of its gross.
    const broken: BookingLaneRow[] = [
      { participant_id: "small", talent_net_cents: 100, workspace_fee_cents: 0, platform_fee_cents: 0, gross_charged_cents: 100 },
      { participant_id: "large", talent_net_cents: 999, workspace_fee_cents: 0, platform_fee_cents: 0, gross_charged_cents: 1_000 },
    ];
    const recon = reconcileBookingLanes(broken);
    assert.equal(recon.driftCents, 1); // 1100 charged − 1099 lanes
    assert.equal(recon.adjustParticipantId, "large"); // largest gross absorbs it
  });
});
