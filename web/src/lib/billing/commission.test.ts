/**
 * Unit tests for the commission resolver.
 *
 * The resolver is pure — no mocks needed, no DB, no Stripe. Just inputs in,
 * snapshot out. Tests pin down:
 *   - the override hierarchy (platform → plan-tier → tenant → booking)
 *   - line-item math (gross, workspace fee, talent net)
 *   - floor enforcement (max of % and floor)
 *   - input validation (negative, talent > price, no items, currency)
 *   - the lane-sum invariant (lanes must sum to gross)
 */

import { describe, expect, it } from "vitest";
import {
  resolveBookingCommissions,
  CommissionResolutionError,
  isOffPlatformPaymentMethod,
  balanceSummary,
  type PlatformCommissionConfig,
  type WorkspaceCommissionOverride,
  type ResolveBookingCommissionsInput,
} from "./commission";

const TENANT = "tenant-uuid-1";

const defaultPlatformConfig = (
  overrides: Partial<PlatformCommissionConfig> = {},
): PlatformCommissionConfig => ({
  default_take_bps: 500,           // 5%
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

describe("resolveBookingCommissions — happy path", () => {
  it("computes the three lanes for a single line item, card payment", () => {
    // Gross = 1000.00 MXN
    // Platform fee @ 5% = 50.00
    // Workspace margin = (1000 - 800) × 1 = 200
    // Talent net = 1000 - 50 - 200 = 750
    const result = resolveBookingCommissions(baseInput());
    expect(result.gross_cents).toBe(100_000);
    expect(result.platform_fee_cents).toBe(5_000);
    expect(result.workspace_fee_cents).toBe(20_000);
    expect(result.talent_net_cents).toBe(75_000);
    expect(result.platform_take_bps).toBe(500);
    expect(result.resolved_from).toBe("platform_default");
    expect(result.currency_code).toBe("MXN");
    expect(result.payment_method).toBe("card");
    expect(result.off_platform_reason).toBeNull();
  });

  it("handles the user's example: 400 MXN/hr client, 200/hr talent, 8 hours", () => {
    // 8 × 400 = 3200 gross
    // Workspace margin = 8 × (400 - 200) = 1600
    // Platform fee @ 5% = 160
    // Talent net = 3200 - 160 - 1600 = 1440
    const result = resolveBookingCommissions(baseInput({
      offerLineItems: [
        { units: 8, unit_price_cents: 40_000, talent_cost_cents: 20_000 },
      ],
    }));
    expect(result.gross_cents).toBe(320_000);
    expect(result.workspace_fee_cents).toBe(160_000);
    expect(result.platform_fee_cents).toBe(16_000);
    expect(result.talent_net_cents).toBe(144_000);
  });

  it("sums multiple line items correctly", () => {
    const result = resolveBookingCommissions(baseInput({
      offerLineItems: [
        { units: 2, unit_price_cents: 50_000, talent_cost_cents: 40_000 }, // 1000 gross, 200 margin
        { units: 1, unit_price_cents: 80_000, talent_cost_cents: 60_000 }, // 800 gross, 200 margin
      ],
    }));
    expect(result.gross_cents).toBe(180_000); // 1800
    expect(result.workspace_fee_cents).toBe(40_000); // 400
    expect(result.platform_fee_cents).toBe(9_000); // 5% of 1800 = 90
    expect(result.talent_net_cents).toBe(131_000); // 1310
  });

  it("returns zero workspace fee when talent_cost == unit_price (Free plan friend-link case)", () => {
    const result = resolveBookingCommissions(baseInput({
      workspacePlan: "free",
      offerLineItems: [
        { units: 1, unit_price_cents: 100_000, talent_cost_cents: 100_000 },
      ],
    }));
    expect(result.workspace_fee_cents).toBe(0);
    expect(result.platform_fee_cents).toBe(5_000);
    expect(result.talent_net_cents).toBe(95_000);
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
    expect(result.platform_take_bps).toBe(250);
    expect(result.platform_fee_cents).toBe(2_500); // 2.5% of 1000 = 25
    expect(result.resolved_from).toBe("plan_tier");
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
    expect(result.platform_take_bps).toBe(200);
    expect(result.platform_fee_cents).toBe(2_000);
    expect(result.resolved_from).toBe("tenant_override");
  });

  it("booking override beats tenant override", () => {
    const result = resolveBookingCommissions(baseInput({
      tenantOverride: { platform_take_bps: 200, platform_take_floor_cents: null },
      bookingPlatformTakeBpsOverride: 100, // 1% — one-off charity booking
    }));
    expect(result.platform_take_bps).toBe(100);
    expect(result.platform_fee_cents).toBe(1_000);
    expect(result.resolved_from).toBe("booking_override");
  });

  it("falls back through layers when no override present", () => {
    const result = resolveBookingCommissions(baseInput({
      workspacePlan: "studio",
      platformConfig: defaultPlatformConfig({
        plan_tier_bps: { agency: 350 }, // studio NOT listed
      }),
      tenantOverride: null,
    }));
    expect(result.platform_take_bps).toBe(500); // falls back to default
    expect(result.resolved_from).toBe("platform_default");
  });
});

describe("floor enforcement", () => {
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
    expect(result.platform_fee_cents).toBe(50);
  });

  it("% take wins when greater than floor", () => {
    // 5% on 100000 cents = 5000; floor = 50 → bps wins
    const result = resolveBookingCommissions(baseInput({
      platformConfig: defaultPlatformConfig({
        default_take_bps: 500,
        default_take_floor_cents: 50,
      }),
    }));
    expect(result.platform_fee_cents).toBe(5_000);
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
    expect(result.platform_fee_cents).toBe(100);
  });
});

describe("off-platform payment", () => {
  it("preserves payment_method and reason in snapshot", () => {
    const result = resolveBookingCommissions(baseInput({
      paymentMethod: "cash",
      offPlatformReason: "Client requested cash at venue",
    }));
    expect(result.payment_method).toBe("cash");
    expect(result.off_platform_reason).toBe("Client requested cash at venue");
  });

  it("isOffPlatformPaymentMethod identifies cash / wire / venue / crypto / other", () => {
    expect(isOffPlatformPaymentMethod("cash")).toBe(true);
    expect(isOffPlatformPaymentMethod("wire")).toBe(true);
    expect(isOffPlatformPaymentMethod("venue_paid")).toBe(true);
    expect(isOffPlatformPaymentMethod("crypto")).toBe(true);
    expect(isOffPlatformPaymentMethod("other")).toBe(true);
    expect(isOffPlatformPaymentMethod("card")).toBe(false);
    expect(isOffPlatformPaymentMethod("apple_pay")).toBe(false);
    expect(isOffPlatformPaymentMethod("bank_transfer")).toBe(false);
  });
});

describe("input validation", () => {
  it("throws no_line_items on empty offer", () => {
    expect(() => resolveBookingCommissions(baseInput({ offerLineItems: [] })))
      .toThrow(CommissionResolutionError);
  });

  it("throws negative_line_item on negative units", () => {
    try {
      resolveBookingCommissions(baseInput({
        offerLineItems: [{ units: -1, unit_price_cents: 100, talent_cost_cents: 50 }],
      }));
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CommissionResolutionError).code).toBe("negative_line_item");
    }
  });

  it("throws talent_cost_exceeds_price when talent paid more than client pays", () => {
    try {
      resolveBookingCommissions(baseInput({
        offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 200 }],
      }));
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CommissionResolutionError).code).toBe("talent_cost_exceeds_price");
    }
  });

  it("throws currency_invalid on non-3-letter currency", () => {
    try {
      resolveBookingCommissions(baseInput({ currencyCode: "MEX" })); // 3 letters → valid
      resolveBookingCommissions(baseInput({ currencyCode: "MX" })); // 2 letters → throw
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CommissionResolutionError).code).toBe("currency_invalid");
    }
  });

  it("throws platform_take_out_of_range when override exceeds 50%", () => {
    try {
      resolveBookingCommissions(baseInput({
        tenantOverride: { platform_take_bps: 6000, platform_take_floor_cents: null }, // 60%
      }));
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CommissionResolutionError).code).toBe("platform_take_out_of_range");
    }
  });

  it("throws lanes_do_not_sum when platform fee + workspace fee would exceed gross", () => {
    // Workspace eats 100% of margin (cost == price means workspace fee = 0),
    // BUT the floor pushes platform_fee above gross → talent_net would go negative.
    try {
      resolveBookingCommissions(baseInput({
        offerLineItems: [
          { units: 1, unit_price_cents: 100, talent_cost_cents: 100 },
        ],
        platformConfig: defaultPlatformConfig({
          default_take_floor_cents: 200, // floor > gross
        }),
      }));
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as CommissionResolutionError).code).toBe("lanes_do_not_sum");
    }
  });
});

describe("lane-sum invariant", () => {
  it("always holds for non-trivial inputs", () => {
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
    ];
    for (const input of cases) {
      const r = resolveBookingCommissions(input);
      expect(r.platform_fee_cents + r.workspace_fee_cents + r.talent_net_cents).toBe(
        r.gross_cents,
      );
    }
  });
});

describe("balanceSummary", () => {
  it("filters zero balances and sorts descending", () => {
    const summary = balanceSummary({ USD: 500, MXN: 12_000, EUR: 0, GBP: -100 });
    expect(summary).toEqual([
      { currency: "MXN", cents: 12_000 },
      { currency: "USD", cents: 500 },
      { currency: "GBP", cents: -100 },
    ]);
  });

  it("returns empty array when all balances are zero", () => {
    expect(balanceSummary({ USD: 0, MXN: 0 })).toEqual([]);
  });
});
