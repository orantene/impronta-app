/**
 * CHARACTERIZATION TEST — billing/commission.ts (pure resolver + helpers)
 *
 * Phase 0 money-path safety-net (remediation-plan-2026-05-19 §3 "core
 * inquiry/money paths are thinly tested" + §5). This is the highest
 * business-risk under-tested code: the commission resolver decides how
 * every booking's gross splits between platform / workspace / talent.
 *
 * Why this file exists alongside commission.test.ts:
 *   commission.test.ts imports from "vitest" — and vitest is NOT a
 *   dependency of this repo (the only vitest file in the tree). It cannot
 *   execute under the repo's `tsx --test` harness, so the money math has
 *   ZERO running coverage today. This file uses the repo convention
 *   (node:test + node:assert/strict, mirrors inquiry-engine-offers.test.ts)
 *   so the resolver is actually exercised, and goes deeper than the dead
 *   vitest file: the 4-level override ladder peeled one layer at a time,
 *   the range guard via every source, validation precedence, Math.round
 *   drift, the units=0 hole, and the spec-vs-code divergences.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here. Suspected
 * bugs are flagged with it.skip("CHARACTERIZATION: ... looks wrong — reported").
 *
 * Spec of record: web/docs/commission-model-2026-05-13.md §3/§6.
 * Run: npx tsx --test src/lib/billing/commission.characterization.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  resolveBookingCommissions,
  CommissionResolutionError,
  isOffPlatformPaymentMethod,
  balanceSummary,
  formatCommissionSnapshot,
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
  type BookingCommissionSnapshot,
  type PaymentMethod,
} from "./commission";

const TENANT = "tenant-uuid-1";

const cfg = (
  o: Partial<PlatformCommissionConfig> = {},
): PlatformCommissionConfig => ({
  default_take_bps: 500, // 5%
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  ...o,
});

const input = (
  o: Partial<ResolveBookingCommissionsInput> = {},
): ResolveBookingCommissionsInput => ({
  tenantId: TENANT,
  workspacePlan: "agency",
  offerLineItems: [{ units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 }],
  currencyCode: "MXN",
  paymentMethod: "card",
  platformConfig: cfg(),
  tenantOverride: null,
  ...o,
});

/** Assert the call throws a CommissionResolutionError with an exact `.code`. */
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Lane math — gross / workspace fee / talent net (the core split)
// ─────────────────────────────────────────────────────────────────────────────

describe("lane math", () => {
  it("single line, card, platform default 5% — pins the canonical split", () => {
    const r = resolveBookingCommissions(input());
    assert.equal(r.gross_cents, 100_000);
    assert.equal(r.workspace_fee_cents, 17_500); // margin 20000 − seller deduction 2500
    assert.equal(r.platform_fee_cents, 5_000); // 2500 client surcharge + 2500 seller deduction
    assert.equal(r.talent_net_cents, 80_000); // FULL talent quote — protected
    assert.equal(r.client_surcharge_cents, 2_500);
    assert.equal(r.gross_charged_cents, 102_500);
    assert.equal(r.platform_take_bps, 500);
    assert.equal(r.platform_take_floor_cents, 0);
    assert.equal(r.resolved_from, "platform_default");
    assert.equal(r.currency_code, "MXN");
    assert.equal(r.payment_method, "card");
    assert.equal(r.off_platform_reason, null);
  });

  it("the spec's 8h example: 400/hr client, 200/hr talent, 8 units", () => {
    const r = resolveBookingCommissions(input({
      offerLineItems: [{ units: 8, unit_price_cents: 40_000, talent_cost_cents: 20_000 }],
    }));
    assert.equal(r.gross_cents, 320_000);
    assert.equal(r.workspace_fee_cents, 152_000); // 160000 margin − 8000 seller deduction
    assert.equal(r.platform_fee_cents, 16_000);   // 8000 client + 8000 seller
    assert.equal(r.talent_net_cents, 160_000);    // 8 × 20000 full quote — protected
  });

  it("sums independent line items (gross and workspace fee summed per-line)", () => {
    const r = resolveBookingCommissions(input({
      offerLineItems: [
        { units: 2, unit_price_cents: 50_000, talent_cost_cents: 40_000 }, // g100000 w20000
        { units: 1, unit_price_cents: 80_000, talent_cost_cents: 60_000 }, // g80000  w20000
      ],
    }));
    assert.equal(r.gross_cents, 180_000);
    assert.equal(r.workspace_fee_cents, 35_500); // 40000 margin − 4500 seller deduction
    assert.equal(r.platform_fee_cents, 9_000);   // 4500 client + 4500 seller
    assert.equal(r.talent_net_cents, 140_000);   // full talent quote — protected
  });

  it("friend-link: talent_cost == unit_price → workspace fee 0, talent FULL, only client surcharge collected", () => {
    const r = resolveBookingCommissions(input({
      workspacePlan: "free",
      offerLineItems: [{ units: 1, unit_price_cents: 100_000, talent_cost_cents: 100_000 }],
    }));
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.platform_fee_cents, 2_500);   // zero margin → seller side absorbed by platform
    assert.equal(r.talent_net_cents, 100_000);   // talent never pays — full quote
    assert.equal(r.seller_shortfall_cents, 2_500);
  });

  it("off_platform_reason coalescing: undefined→null, null→null, ''→'' (kept), 'x'→'x'", () => {
    // input.offPlatformReason ?? null — ?? only fires on null/undefined,
    // so an empty-string reason is PRESERVED, not coerced to null.
    assert.equal(resolveBookingCommissions(input({ offPlatformReason: undefined })).off_platform_reason, null);
    assert.equal(resolveBookingCommissions(input({ offPlatformReason: null })).off_platform_reason, null);
    assert.equal(resolveBookingCommissions(input({ offPlatformReason: "" })).off_platform_reason, "");
    assert.equal(resolveBookingCommissions(input({ offPlatformReason: "cash at venue" })).off_platform_reason, "cash at venue");
  });

  it("currency_code + payment_method are echoed verbatim into the snapshot", () => {
    const r = resolveBookingCommissions(input({ currencyCode: "USD", paymentMethod: "wire" }));
    assert.equal(r.currency_code, "USD");
    assert.equal(r.payment_method, "wire");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Override hierarchy — most-specific wins (booking > tenant > plan > default)
//    Peeled one layer at a time so a reorder regression is caught precisely.
// ─────────────────────────────────────────────────────────────────────────────

describe("override hierarchy — resolved bps + resolved_from", () => {
  it("L0 nothing set → platform default", () => {
    const r = resolveBookingCommissions(input());
    assert.equal(r.platform_take_bps, 500);
    assert.equal(r.resolved_from, "platform_default");
  });

  it("L1 plan-tier present → plan_tier wins over platform default", () => {
    const r = resolveBookingCommissions(input({
      workspacePlan: "network",
      platformConfig: cfg({ default_take_bps: 500, plan_tier_bps: { network: 250 } }),
    }));
    assert.equal(r.platform_take_bps, 250);
    assert.equal(r.platform_fee_cents, 2_500);
    assert.equal(r.resolved_from, "plan_tier");
  });

  it("L1 plan-tier value 0 still applies (typeof 0 === 'number') — a real 0% tier", () => {
    const r = resolveBookingCommissions(input({
      workspacePlan: "agency",
      platformConfig: cfg({ default_take_bps: 500, plan_tier_bps: { agency: 0 } }),
    }));
    assert.equal(r.platform_take_bps, 0);
    assert.equal(r.platform_fee_cents, 0);
    assert.equal(r.resolved_from, "plan_tier");
  });

  it("L1 plan key absent for this plan → falls through to platform default", () => {
    const r = resolveBookingCommissions(input({
      workspacePlan: "studio",
      platformConfig: cfg({ plan_tier_bps: { agency: 350 } }), // studio not listed
    }));
    assert.equal(r.platform_take_bps, 500);
    assert.equal(r.resolved_from, "platform_default");
  });

  it("L2 tenant override bps beats plan-tier", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, plan_tier_bps: { agency: 350 } }),
      tenantOverride: { platform_take_bps: 200, platform_take_floor_cents: null },
    }));
    assert.equal(r.platform_take_bps, 200);
    assert.equal(r.platform_fee_cents, 2_000);
    assert.equal(r.resolved_from, "tenant_override");
  });

  it("L2 tenant override bps === 0 applies (0 != null) — negotiated 0% tenant", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500 }),
      tenantOverride: { platform_take_bps: 0, platform_take_floor_cents: null },
    }));
    assert.equal(r.platform_take_bps, 0);
    assert.equal(r.resolved_from, "tenant_override");
  });

  it("L2 tenant override bps === null → NOT applied (uses != null)", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500 }),
      tenantOverride: { platform_take_bps: null, platform_take_floor_cents: null },
    }));
    assert.equal(r.platform_take_bps, 500);
    assert.equal(r.resolved_from, "platform_default");
  });

  it("L3 booking override beats tenant override", () => {
    const r = resolveBookingCommissions(input({
      tenantOverride: { platform_take_bps: 200, platform_take_floor_cents: null },
      bookingPlatformTakeBpsOverride: 100,
    }));
    assert.equal(r.platform_take_bps, 100);
    assert.equal(r.platform_fee_cents, 1_000);
    assert.equal(r.resolved_from, "booking_override");
  });

  it("L3 booking override === 0 applies (typeof 0 === 'number') — one-off 0% booking", () => {
    const r = resolveBookingCommissions(input({
      tenantOverride: { platform_take_bps: 200, platform_take_floor_cents: null },
      bookingPlatformTakeBpsOverride: 0,
    }));
    assert.equal(r.platform_take_bps, 0);
    assert.equal(r.platform_fee_cents, 0);
    assert.equal(r.resolved_from, "booking_override");
  });

  it("L3 booking override === null → NOT applied (typeof null === 'object'); tenant value survives", () => {
    const r = resolveBookingCommissions(input({
      tenantOverride: { platform_take_bps: 200, platform_take_floor_cents: null },
      bookingPlatformTakeBpsOverride: null,
    }));
    assert.equal(r.platform_take_bps, 200);
    assert.equal(r.resolved_from, "tenant_override");
  });

  it("full ladder, all four set → booking wins; peel to tenant; peel to plan; peel to default", () => {
    const base = {
      workspacePlan: "agency" as const,
      platformConfig: cfg({ default_take_bps: 500, plan_tier_bps: { agency: 350 } }),
      tenantOverride: { platform_take_bps: 250, platform_take_floor_cents: null },
    };
    assert.equal(
      resolveBookingCommissions(input({ ...base, bookingPlatformTakeBpsOverride: 100 })).resolved_from,
      "booking_override",
    );
    assert.equal(
      resolveBookingCommissions(input({ ...base, bookingPlatformTakeBpsOverride: null })).resolved_from,
      "tenant_override",
    );
    assert.equal(
      resolveBookingCommissions(input({ ...base, tenantOverride: null })).resolved_from,
      "plan_tier",
    );
    assert.equal(
      resolveBookingCommissions(input({
        ...base,
        tenantOverride: null,
        platformConfig: cfg({ default_take_bps: 500, plan_tier_bps: {} }),
      })).resolved_from,
      "platform_default",
    );
  });
});

describe("override hierarchy — the floor-vs-resolved_from QUIRK", () => {
  it("QUIRK: tenant floor override is applied but does NOT change resolved_from", () => {
    // tenantOverride.platform_take_floor_cents is consumed by a SEPARATE
    // `if` that never touches resolvedFrom. So a snapshot can show
    // resolved_from:'platform_default' while the floor in effect actually
    // came from the tenant row. Audit-trail readers beware.
    const r = resolveBookingCommissions(input({
      offerLineItems: [{ units: 1, unit_price_cents: 1_000, talent_cost_cents: 500 }],
      platformConfig: cfg({ default_take_bps: 100, default_take_floor_cents: 50 }),
      tenantOverride: { platform_take_bps: null, platform_take_floor_cents: 100 },
    }));
    assert.equal(r.platform_take_floor_cents, 100); // tenant floor in effect
    assert.equal(r.platform_fee_cents, 100); // max(round(1000*100/10000)=10, 100)
    assert.equal(r.resolved_from, "platform_default"); // ...but says default
  });

  it("QUIRK: tenant floor override of 0 overrides a non-zero platform floor DOWN to 0", () => {
    // `0 != null` is true, so a tenant can be configured with a 0 floor
    // that strips the platform's protective minimum.
    const r = resolveBookingCommissions(input({
      offerLineItems: [{ units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 }],
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 999 }),
      tenantOverride: { platform_take_bps: null, platform_take_floor_cents: 0 },
    }));
    assert.equal(r.platform_take_floor_cents, 0);
    assert.equal(r.platform_fee_cents, 5_000); // max(5000, 0) — floor no longer binds
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Range guard — 0..5000 bps (0–50%), enforced AFTER all override resolution
//    so it catches a bad rate from ANY of the four sources.
// ─────────────────────────────────────────────────────────────────────────────

describe("platform_take_out_of_range — boundary + every source", () => {
  it("BOUNDARY: exactly 0 bps is allowed (0% take)", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 0 }),
    }));
    assert.equal(r.platform_take_bps, 0);
    assert.equal(r.platform_fee_cents, 0);
  });

  it("BOUNDARY: exactly 5000 bps (50%) is allowed; 5001 throws", () => {
    assert.equal(
      resolveBookingCommissions(input({ platformConfig: cfg({ default_take_bps: 5000 }) })).platform_take_bps,
      5000,
    );
    expectCode(
      () => resolveBookingCommissions(input({ platformConfig: cfg({ default_take_bps: 5001 }) })),
      "platform_take_out_of_range",
    );
  });

  it("throws via plan_tier source (e.g. plan misconfigured at 6000)", () => {
    expectCode(
      () => resolveBookingCommissions(input({
        workspacePlan: "network",
        platformConfig: cfg({ plan_tier_bps: { network: 6000 } }),
      })),
      "platform_take_out_of_range",
    );
  });

  it("throws via tenant override source (6000 = 60%)", () => {
    expectCode(
      () => resolveBookingCommissions(input({
        tenantOverride: { platform_take_bps: 6000, platform_take_floor_cents: null },
      })),
      "platform_take_out_of_range",
    );
  });

  it("throws via booking override source — positive over-range AND negative", () => {
    expectCode(
      () => resolveBookingCommissions(input({ bookingPlatformTakeBpsOverride: 6000 })),
      "platform_take_out_of_range",
    );
    // typeof -100 === 'number' → applied → -100 < 0 → throws (reachable).
    expectCode(
      () => resolveBookingCommissions(input({ bookingPlatformTakeBpsOverride: -100 })),
      "platform_take_out_of_range",
    );
  });

  it("CONTRAST: ±Infinity booking override IS caught by the range guard", () => {
    expectCode(
      () => resolveBookingCommissions(input({ bookingPlatformTakeBpsOverride: Infinity })),
      "platform_take_out_of_range",
    );
    expectCode(
      () => resolveBookingCommissions(input({ bookingPlatformTakeBpsOverride: -Infinity })),
      "platform_take_out_of_range",
    );
  });

  it("CHARACTERIZATION: NaN booking override BYPASSES the range guard and surfaces as 'lanes_do_not_sum'", () => {
    // typeof NaN === 'number' → the override is applied.
    // Range guard: `NaN < 0` is false and `NaN > 5000` is false → it passes.
    // Then platformByBps = round(gross*NaN/10000) = NaN, platformFee = NaN,
    // talentNet = NaN; `NaN < 0` is false so the first sanity check is
    // skipped; the paranoia check `NaN !== gross` is true → throws
    // lanes_do_not_sum. Current behavior pinned (passing) — see the it.skip
    // below for why this code is wrong.
    expectCode(
      () => resolveBookingCommissions(input({ bookingPlatformTakeBpsOverride: NaN })),
      "lanes_do_not_sum",
    );
  });

  it.skip("CHARACTERIZATION: a NaN platform-take override should be rejected as out-of-range / invalid, not mislabelled 'lanes_do_not_sum' — looks wrong, reported", () => {
    // The range guard is `platformTakeBps < 0 || platformTakeBps > 5000`.
    // NaN fails both comparisons so a NaN take silently passes validation
    // and only blows up later with a misleading error code that points the
    // operator at line-item pricing instead of the bad override input.
    // Expected-correct behavior:
    expectCode(
      () => resolveBookingCommissions(input({ bookingPlatformTakeBpsOverride: NaN })),
      "platform_take_out_of_range",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Input validation — codes + precedence ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("input validation — codes", () => {
  it("empty offerLineItems → no_line_items", () => {
    expectCode(() => resolveBookingCommissions(input({ offerLineItems: [] })), "no_line_items");
  });

  it("negative units / price / cost → negative_line_item", () => {
    expectCode(
      () => resolveBookingCommissions(input({ offerLineItems: [{ units: -1, unit_price_cents: 100, talent_cost_cents: 50 }] })),
      "negative_line_item",
    );
    expectCode(
      () => resolveBookingCommissions(input({ offerLineItems: [{ units: 1, unit_price_cents: -100, talent_cost_cents: 0 }] })),
      "negative_line_item",
    );
    expectCode(
      () => resolveBookingCommissions(input({ offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: -1 }] })),
      "negative_line_item",
    );
  });

  it("talent_cost > unit_price → talent_cost_exceeds_price; equal is allowed (not >)", () => {
    expectCode(
      () => resolveBookingCommissions(input({ offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 200 }] })),
      "talent_cost_exceeds_price",
    );
    // Boundary: cost == price is the friend-link case — must NOT throw.
    const r = resolveBookingCommissions(input({
      offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 100 }],
    }));
    assert.equal(r.workspace_fee_cents, 0);
  });

  it("currency_invalid is a pure length===3 check — NO ISO / charset / case validation", () => {
    for (const bad of ["", "M", "MX", "USDD", "UNITED"]) {
      expectCode(() => resolveBookingCommissions(input({ currencyCode: bad })), "currency_invalid");
    }
    // Garbage that happens to be 3 chars PASSES (quirk): lowercase, symbols.
    assert.equal(resolveBookingCommissions(input({ currencyCode: "mxn" })).currency_code, "mxn");
    assert.equal(resolveBookingCommissions(input({ currencyCode: "$$$" })).currency_code, "$$$");
    assert.equal(resolveBookingCommissions(input({ currencyCode: "Z9_" })).currency_code, "Z9_");
  });
});

describe("input validation — precedence ordering (pins the guard sequence)", () => {
  it("no_line_items is checked BEFORE currency — empty + bad currency → no_line_items", () => {
    expectCode(
      () => resolveBookingCommissions(input({ offerLineItems: [], currencyCode: "XX" })),
      "no_line_items",
    );
  });

  it("currency is checked BEFORE per-line validation — bad currency + negative units → currency_invalid", () => {
    expectCode(
      () => resolveBookingCommissions(input({
        currencyCode: "XX",
        offerLineItems: [{ units: -5, unit_price_cents: 100, talent_cost_cents: 50 }],
      })),
      "currency_invalid",
    );
  });

  it("within a line, negative_line_item is checked BEFORE talent_cost_exceeds_price", () => {
    // units < 0 AND cost > price on the same row → negative wins.
    expectCode(
      () => resolveBookingCommissions(input({
        offerLineItems: [{ units: -1, unit_price_cents: 100, talent_cost_cents: 200 }],
      })),
      "negative_line_item",
    );
  });

  it("validation is PER-LINE not aggregate — one bad row throws even if another row has huge positive margin", () => {
    expectCode(
      () => resolveBookingCommissions(input({
        offerLineItems: [
          { units: 1, unit_price_cents: 100, talent_cost_cents: 200 },        // cost > price
          { units: 1, unit_price_cents: 1_000_000, talent_cost_cents: 0 },    // would dwarf it
        ],
      })),
      "talent_cost_exceeds_price",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Math.round behavior — half-up to +∞, per-line, residual absorbs drift
// ─────────────────────────────────────────────────────────────────────────────

describe("Math.round / fractional units", () => {
  it("fractional units are allowed and rounded per-line (units type is just `number`)", () => {
    // 0.5 * 101 = 50.5 → Math.round = 51 (half rounds toward +∞).
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 0, default_take_floor_cents: 0 }),
      offerLineItems: [{ units: 0.5, unit_price_cents: 101, talent_cost_cents: 0 }],
    }));
    assert.equal(r.gross_cents, 51); // round(50.5)
    assert.equal(r.workspace_fee_cents, 51); // round(0.5 * 101)
    assert.equal(r.platform_fee_cents, 0);
    assert.equal(r.talent_net_cents, 0);
  });

  it("the take is split into two halves, each rounded independently", () => {
    // subtotal 100010, 5% total → 2.5% client + 2.5% seller. Each half =
    // round(100010*250/10000) = round(2500.25) = 2500 → platform fee 5000.
    // (Rounding the *whole* take in one go would give round(5000.5)=5001;
    // the split rounds each side, so 5000.)
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 0 }),
      offerLineItems: [{ units: 1, unit_price_cents: 100_010, talent_cost_cents: 50_000 }],
    }));
    assert.equal(r.gross_cents, 100_010);
    assert.equal(r.client_surcharge_cents, 2_500);
    assert.equal(r.seller_deduction_cents, 2_500);
    assert.equal(r.platform_fee_cents, 5_000);
    assert.equal(r.talent_net_cents, 50_000);    // full quote — protected
    assert.equal(r.workspace_fee_cents, 47_510); // margin 50010 − 2500
  });

  it("the client surcharge rounds half-up: round(2500.5) = 2501", () => {
    // subtotal 100020 @ 2.5% = 2500.5 → 2501 (half rounds toward +∞).
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 0 }),
      offerLineItems: [{ units: 1, unit_price_cents: 100_020, talent_cost_cents: 50_000 }],
    }));
    assert.equal(r.client_surcharge_cents, 2_501);
    assert.equal(r.seller_deduction_cents, 2_501);
  });

  it("the client surcharge rounds down below .5: round(2500.2) = 2500", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 0 }),
      offerLineItems: [{ units: 1, unit_price_cents: 100_008, talent_cost_cents: 50_000 }],
    }));
    assert.equal(r.client_surcharge_cents, 2_500); // round(2500.2)
  });

  it("talent quote is exact; the workspace fee absorbs rounding drift; the invariant holds", () => {
    // talent_net is now the talent's FULL quote (not a residual). The client
    // surcharge + workspace fee carry any rounding remainder, and the three
    // lanes still sum to gross_charged exactly.
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500 }),
      offerLineItems: [{ units: 1, unit_price_cents: 100_001, talent_cost_cents: 79_999 }],
    }));
    assert.equal(r.gross_cents, 100_001);
    assert.equal(r.talent_net_cents, 79_999);      // exact full quote
    assert.equal(r.client_surcharge_cents, 2_500); // round(2500.025)
    assert.equal(r.seller_deduction_cents, 2_500);
    assert.equal(r.workspace_fee_cents, 17_502);   // margin 20002 − 2500
    assert.equal(r.platform_fee_cents, 5_000);
    assert.equal(
      r.talent_net_cents + r.workspace_fee_cents + r.platform_fee_cents,
      r.gross_charged_cents,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. units === 0 — only `< 0` throws, so a zero-unit line is silently inert
// ─────────────────────────────────────────────────────────────────────────────

describe("units === 0 (boundary — not negative, so allowed)", () => {
  it("a single units:0 line yields an all-zero snapshot, no throw", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 0 }),
      offerLineItems: [{ units: 0, unit_price_cents: 100_000, talent_cost_cents: 80_000 }],
    }));
    assert.equal(r.gross_cents, 0);
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.platform_fee_cents, 0);
    assert.equal(r.talent_net_cents, 0);
    assert.equal(r.resolved_from, "platform_default");
  });

  it("a zero-unit line is inert in a mix — only the real line contributes", () => {
    const r = resolveBookingCommissions(input({
      offerLineItems: [
        { units: 0, unit_price_cents: 999_999, talent_cost_cents: 0 }, // ignored
        { units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 },
      ],
    }));
    assert.equal(r.gross_cents, 100_000);
    assert.equal(r.workspace_fee_cents, 17_500); // margin 20000 − seller deduction 2500
  });

  it("units:0 + a platform FLOOR → the client covers the floor; talent stays whole (no throw)", () => {
    // Old model threw (talent went negative). Talent-protected: a zero-gross
    // booking with a floor charges the client the floor and leaves talent at 0.
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 50 }),
      offerLineItems: [{ units: 0, unit_price_cents: 100_000, talent_cost_cents: 80_000 }],
    }));
    assert.equal(r.gross_cents, 0);
    assert.equal(r.talent_net_cents, 0);
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.platform_fee_cents, 50);      // floor, all client-side
    assert.equal(r.client_surcharge_cents, 50);
    assert.equal(r.gross_charged_cents, 50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. lanes_do_not_sum — and the DELIBERATE divergence from spec §6
// ─────────────────────────────────────────────────────────────────────────────

describe("lanes_do_not_sum (talent_net would go negative)", () => {
  it("floor > gross → the client covers the floor; talent stays whole (no throw)", () => {
    // Talent-protected amendment (2026-05-29): the platform fee is never
    // carved out of the talent. A floor larger than the take is added to the
    // client surcharge instead, so no lane goes negative — the old model's
    // lanes_do_not_sum throw is now unreachable for valid inputs.
    const r = resolveBookingCommissions(input({
      offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 100 }],
      platformConfig: cfg({ default_take_floor_cents: 200 }),
    }));
    assert.equal(r.talent_net_cents, 100);
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.platform_fee_cents, 200);
    assert.equal(r.client_surcharge_cents, 200);
    assert.equal(r.gross_charged_cents, 300);
  });

  it("CONTRACT PIN: the three lanes sum to gross_charged across a wide grid; no lane negative", () => {
    // Talent-protected model: talent_net + workspace_fee + platform_fee
    // === gross_charged for every finite input, platform_fee decomposes into
    // client_surcharge + seller_deduction, and no lane goes negative — for
    // BOTH seller-of-record paths. Talent protection makes the old
    // lanes_do_not_sum throw unreachable, so nothing in the grid throws.
    let checked = 0;
    for (const units of [1, 2, 3.5, 8]) {
      for (const price of [1, 999, 100_000, 100_001]) {
        for (const cost of [0, 1, 500]) {
          if (cost > price) continue;
          for (const bps of [0, 250, 500, 5000]) {
            for (const floor of [0, 25]) {
              for (const seller of ["workspace", "talent"] as const) {
                const r = resolveBookingCommissions(input({
                  sellerOfRecord: seller,
                  offerLineItems: [{ units, unit_price_cents: price, talent_cost_cents: cost }],
                  platformConfig: cfg({ default_take_bps: bps, default_take_floor_cents: floor }),
                }));
                assert.equal(
                  r.talent_net_cents + r.workspace_fee_cents + r.platform_fee_cents,
                  r.gross_charged_cents,
                );
                assert.equal(
                  r.platform_fee_cents,
                  r.client_surcharge_cents + r.seller_deduction_cents,
                );
                assert.equal(r.gross_charged_cents, r.gross_cents + r.client_surcharge_cents);
                assert.ok(r.platform_fee_cents >= 0);
                assert.ok(r.workspace_fee_cents >= 0);
                assert.ok(r.talent_net_cents >= 0);
                checked++;
              }
            }
          }
        }
      }
    }
    assert.ok(checked >= 200, `expected a broad grid, only checked ${checked}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. isOffPlatformPaymentMethod — the card-vs-cash settlement fork
//    Decides Path A (Stripe auto-split) vs Path B (accrual → balance owed).
//    Exhaustive over ALL 9 PaymentMethod enum values.
// ─────────────────────────────────────────────────────────────────────────────

describe("isOffPlatformPaymentMethod — exhaustive over the 9-value enum", () => {
  const ON_PLATFORM: PaymentMethod[] = ["card", "apple_pay", "google_pay", "bank_transfer"];
  const OFF_PLATFORM: PaymentMethod[] = ["cash", "wire", "venue_paid", "crypto", "other"];

  for (const m of OFF_PLATFORM) {
    it(`'${m}' → true (Path B: accrual → balance owed)`, () => {
      assert.equal(isOffPlatformPaymentMethod(m), true);
    });
  }
  for (const m of ON_PLATFORM) {
    it(`'${m}' → false (Path A: in-platform Stripe split)`, () => {
      assert.equal(isOffPlatformPaymentMethod(m), false);
    });
  }

  it("the two sets partition all 9 enum members (no gaps, no overlap)", () => {
    const all = [...ON_PLATFORM, ...OFF_PLATFORM];
    assert.equal(all.length, 9);
    assert.equal(new Set(all).size, 9);
  });

  it("NON-OBVIOUS: 'wire' is OFF-platform but 'bank_transfer' is ON-platform", () => {
    // Easy to conflate — pin the spec §4 split (bank_transfer settles like a
    // card via Stripe; a manual wire to the workspace's own bank does not).
    assert.equal(isOffPlatformPaymentMethod("wire"), true);
    assert.equal(isOffPlatformPaymentMethod("bank_transfer"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. balanceSummary — per-currency owed ledger → sorted UI list
//    Object.entries → filter(cents !== 0) → map → sort desc by cents.
// ─────────────────────────────────────────────────────────────────────────────

describe("balanceSummary", () => {
  it("filters exactly-zero, keeps negatives, sorts strictly descending by cents", () => {
    assert.deepEqual(
      balanceSummary({ USD: 500, MXN: 12_000, EUR: 0, GBP: -100 }),
      [
        { currency: "MXN", cents: 12_000 },
        { currency: "USD", cents: 500 },
        { currency: "GBP", cents: -100 }, // negative is NOT filtered (only ===0 is)
      ],
    );
  });

  it("empty input → []; all-zero → []", () => {
    assert.deepEqual(balanceSummary({}), []);
    assert.deepEqual(balanceSummary({ USD: 0, MXN: 0 }), []);
  });

  it("single non-zero entry passes through", () => {
    assert.deepEqual(balanceSummary({ MXN: 4_500 }), [{ currency: "MXN", cents: 4_500 }]);
  });

  it("BOUNDARY: -0 is treated as zero and filtered (`-0 !== 0` is false)", () => {
    assert.deepEqual(balanceSummary({ NEG0: -0, REAL: 5 }), [{ currency: "REAL", cents: 5 }]);
  });

  it("stable tie order: equal cents preserve object insertion order (alpha keys)", () => {
    // Array.prototype.sort is stable (Node 20 / V8); non-integer-like keys
    // iterate in insertion order, so equal balances keep their original order.
    assert.deepEqual(
      balanceSummary({ AAA: 100, BBB: 100, CCC: 100 }),
      [
        { currency: "AAA", cents: 100 },
        { currency: "BBB", cents: 100 },
        { currency: "CCC", cents: 100 },
      ],
    );
  });

  it("QUIRK: a NaN balance is NOT filtered (`NaN !== 0` is true) — bad ledger data survives into the UI list", () => {
    // The fn trusts its Record<string, number> contract and does no
    // Number.isFinite guard; a NaN cent value passes the zero-filter and
    // the sort comparator (b-a → NaN) leaves it roughly in place.
    const out = balanceSummary({ GOOD: 100, BADNAN: NaN });
    assert.equal(out.length, 2);
    const bad = out.find((e) => e.currency === "BADNAN");
    assert.ok(bad !== undefined);
    assert.ok(Number.isNaN(bad.cents));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. formatCommissionSnapshot — UI breakdown formatter
// ─────────────────────────────────────────────────────────────────────────────

const snap = (
  o: Partial<BookingCommissionSnapshot> = {},
): BookingCommissionSnapshot => ({
  platform_take_bps: 500,
  platform_take_floor_cents: 0,
  gross_cents: 100_000,
  platform_fee_cents: 5_000,
  workspace_fee_cents: 17_500,
  talent_net_cents: 80_000,
  client_surcharge_cents: 2_500,
  seller_deduction_cents: 2_500,
  gross_charged_cents: 102_500,
  seller_shortfall_cents: 0,
  seller_of_record: "workspace",
  currency_code: "MXN",
  payment_method: "card",
  off_platform_reason: null,
  resolved_from: "platform_default",
  ...o,
});

describe("formatCommissionSnapshot — custom formatter contract", () => {
  it("calls the formatter once per money lane with (cents, currency) and maps the keys correctly", () => {
    const calls: Array<[number, string]> = [];
    const out = formatCommissionSnapshot(
      snap({
        gross_cents: 111,
        gross_charged_cents: 666,
        client_surcharge_cents: 555,
        platform_fee_cents: 222,
        workspace_fee_cents: 333,
        talent_net_cents: 444,
        currency_code: "USD",
      }),
      (cents, currency) => {
        calls.push([cents, currency]);
        return `${currency}:${cents}`;
      },
    );
    // Exact arg contract (order + currency passthrough), locale-independent.
    assert.deepEqual(calls, [
      [111, "USD"], // gross
      [666, "USD"], // grossCharged
      [555, "USD"], // clientSurcharge
      [222, "USD"], // platformFee
      [333, "USD"], // workspaceFee
      [444, "USD"], // talentNet
    ]);
    assert.equal(out.gross, "USD:111");
    assert.equal(out.grossCharged, "USD:666");
    assert.equal(out.clientSurcharge, "USD:555");
    assert.equal(out.platformFee, "USD:222");
    assert.equal(out.workspaceFee, "USD:333");
    assert.equal(out.talentNet, "USD:444");
  });

  it("platformTakePercent = (bps/100).toFixed(2)+'%' — independent of the money formatter, NOT clamped", () => {
    const pct = (bps: number) =>
      formatCommissionSnapshot(snap({ platform_take_bps: bps }), () => "x").platformTakePercent;
    assert.equal(pct(0), "0.00%");
    assert.equal(pct(1), "0.01%");
    assert.equal(pct(250), "2.50%");
    assert.equal(pct(500), "5.00%");
    assert.equal(pct(5_000), "50.00%");
    // Display-only: the formatter does NOT enforce the resolver's 0..5000
    // range — it renders whatever bps the snapshot carries.
    assert.equal(pct(12_345), "123.45%");
  });
});

describe("formatCommissionSnapshot — default formatter (defaultFormatCents, exercised via no formatter arg)", () => {
  it("malformed currency code → catch fallback `${code} ${(cents/100).toFixed(2)}` (cents PRESERVED)", () => {
    // 'ZZ' (2 chars) is not a well-formed currency → Intl throws RangeError
    // → the catch branch runs. Deterministic + locale-independent.
    const out = formatCommissionSnapshot(snap({
      currency_code: "ZZ",
      gross_cents: 100_055,
      platform_fee_cents: 5_001,
      workspace_fee_cents: 20_000,
      talent_net_cents: 75_054,
    }));
    assert.equal(out.gross, "ZZ 1000.55");
    assert.equal(out.platformFee, "ZZ 50.01");
    assert.equal(out.workspaceFee, "ZZ 200.00");
    assert.equal(out.talentNet, "ZZ 750.54");
  });

  it("QUIRK: well-formed currency uses maximumFractionDigits:0 → sub-major-unit precision is DROPPED", () => {
    // $7.50 and $7.99 both render identically (whole-unit rounding), while
    // $6.50 and $7.50 differ. Asserted as string EQUALITY/INEQUALITY so it
    // holds regardless of the runtime's default locale/currency symbol.
    const g = (cents: number) =>
      formatCommissionSnapshot(snap({ currency_code: "USD", gross_cents: cents })).gross;
    assert.equal(g(750) === g(799), true); // 7.50 and 7.99 collide
    assert.equal(g(650) === g(750), false); // 6.50 vs 7.50 differ
  });

  it("CONTRAST: the fallback branch (.toFixed(2)) PRESERVES the cents the Intl branch drops", () => {
    // Same amounts, only the currency-code well-formedness differs, yet the
    // displayed precision differs — an internal inconsistency between the
    // two branches of the same function. Pinned, not fixed.
    const intlPath = (c: number) =>
      formatCommissionSnapshot(snap({ currency_code: "USD", gross_cents: c })).gross;
    const fallbackPath = (c: number) =>
      formatCommissionSnapshot(snap({ currency_code: "ZZ", gross_cents: c })).gross;
    assert.equal(intlPath(750) === intlPath(799), true); // collapsed
    assert.equal(fallbackPath(750) === fallbackPath(799), false); // distinct
    assert.equal(fallbackPath(750), "ZZ 7.50");
    assert.equal(fallbackPath(799), "ZZ 7.99");
  });

  it.skip("CHARACTERIZATION: a money breakdown should not round $50.01 to '$50' — maximumFractionDigits:0 loses real cents — looks wrong, reported", () => {
    // platform_fee_cents = 5001 ($50.01). The talent/coordinator breakdown
    // is a money document; dropping the .01 misrepresents the split and the
    // four displayed lanes will not visibly reconcile to the gross. Expected
    // behavior: 2 fraction digits (or the currency's minor-unit count).
    const out = formatCommissionSnapshot(snap({ currency_code: "USD", platform_fee_cents: 5_001 }));
    assert.ok(
      /50\.01/.test(out.platformFee),
      `expected the cents to survive, got ${out.platformFee}`,
    );
  });
});
