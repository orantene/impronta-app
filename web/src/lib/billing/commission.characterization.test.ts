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
  type PlatformCommissionConfig,
  type ResolveBookingCommissionsInput,
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
    assert.equal(r.workspace_fee_cents, 20_000); // (100000-80000)*1
    assert.equal(r.platform_fee_cents, 5_000); // round(100000*500/10000)
    assert.equal(r.talent_net_cents, 75_000); // residual
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
    assert.equal(r.workspace_fee_cents, 160_000);
    assert.equal(r.platform_fee_cents, 16_000);
    assert.equal(r.talent_net_cents, 144_000);
  });

  it("sums independent line items (gross and workspace fee summed per-line)", () => {
    const r = resolveBookingCommissions(input({
      offerLineItems: [
        { units: 2, unit_price_cents: 50_000, talent_cost_cents: 40_000 }, // g100000 w20000
        { units: 1, unit_price_cents: 80_000, talent_cost_cents: 60_000 }, // g80000  w20000
      ],
    }));
    assert.equal(r.gross_cents, 180_000);
    assert.equal(r.workspace_fee_cents, 40_000);
    assert.equal(r.platform_fee_cents, 9_000); // round(180000*500/10000)
    assert.equal(r.talent_net_cents, 131_000);
  });

  it("friend-link: talent_cost == unit_price → workspace fee 0, platform still takes its slice", () => {
    const r = resolveBookingCommissions(input({
      workspacePlan: "free",
      offerLineItems: [{ units: 1, unit_price_cents: 100_000, talent_cost_cents: 100_000 }],
    }));
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.platform_fee_cents, 5_000);
    assert.equal(r.talent_net_cents, 95_000);
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

  it("platform-fee bps rounding is half-up: gross 100010 @ 5% = 5000.5 → 5001", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 0 }),
      // cost == price so workspace fee is 0 and talent_net can absorb it.
      offerLineItems: [{ units: 1, unit_price_cents: 100_010, talent_cost_cents: 100_010 }],
    }));
    assert.equal(r.gross_cents, 100_010);
    assert.equal(r.platform_fee_cents, 5_001); // round(5000.5) = 5001
    assert.equal(r.workspace_fee_cents, 0);
    assert.equal(r.talent_net_cents, 95_009);
  });

  it("platform-fee bps rounding rounds DOWN below .5: gross 100008 @ 5% = 5000.4 → 5000", () => {
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 0 }),
      offerLineItems: [{ units: 1, unit_price_cents: 100_008, talent_cost_cents: 100_008 }],
    }));
    assert.equal(r.platform_fee_cents, 5_000); // round(5000.4) = 5000
  });

  it("talent_net is the RESIDUAL so rounding drift never breaks the lane-sum invariant", () => {
    // gross and workspace fee are rounded independently per line; talent_net
    // is computed as gross - platformFee - workspaceFee, so it silently
    // absorbs every rounding remainder. Pin: sum is exact even with drift.
    const r = resolveBookingCommissions(input({
      platformConfig: cfg({ default_take_bps: 500 }),
      offerLineItems: [{ units: 1, unit_price_cents: 100_001, talent_cost_cents: 79_999 }],
    }));
    assert.equal(r.gross_cents, 100_001);
    assert.equal(r.workspace_fee_cents, 20_002);
    assert.equal(r.platform_fee_cents, 5_000); // round(100001*500/10000)=round(5000.05)
    assert.equal(r.talent_net_cents, 74_999); // residual
    assert.equal(
      r.platform_fee_cents + r.workspace_fee_cents + r.talent_net_cents,
      r.gross_cents,
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
    assert.equal(r.workspace_fee_cents, 20_000);
  });

  it("QUIRK: units:0 + a platform FLOOR → gross 0 but fee = floor → talent_net < 0 → lanes_do_not_sum", () => {
    // A pure-floor charge on a zero-gross booking is rejected (the floor
    // alone cannot be financed). Pins that the floor is unconditional.
    expectCode(
      () => resolveBookingCommissions(input({
        platformConfig: cfg({ default_take_bps: 500, default_take_floor_cents: 50 }),
        offerLineItems: [{ units: 0, unit_price_cents: 100_000, talent_cost_cents: 80_000 }],
      })),
      "lanes_do_not_sum",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. lanes_do_not_sum — and the DELIBERATE divergence from spec §6
// ─────────────────────────────────────────────────────────────────────────────

describe("lanes_do_not_sum (talent_net would go negative)", () => {
  it("floor > gross → platform fee exceeds gross → throws (NOT clamp-to-0)", () => {
    // SPEC DIVERGENCE (intentional, documented in commission.ts:188-194):
    // commission-model-2026-05-13.md §6 says "clamp talentNetCents to 0 and
    // log a warning". The code instead THROWS lanes_do_not_sum so the offer
    // can't be accepted into a booking. We pin the CODE behavior; the spec
    // line is the stale one. Not flagged as a bug — the in-code comment
    // explicitly overrides the spec here.
    expectCode(
      () => resolveBookingCommissions(input({
        offerLineItems: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 100 }],
        platformConfig: cfg({ default_take_floor_cents: 200 }), // floor > gross(100)
      })),
      "lanes_do_not_sum",
    );
  });

  it("CONTRACT PIN: the second sanity check (sum !== gross) is unreachable for finite inputs", () => {
    // talentNet := gross - platformFee - workspaceFee, all integers, so
    // platformFee + workspaceFee + talentNet === gross is an algebraic
    // identity. The `if (sum !== gross) throw` line is dead code for any
    // finite input — the ONLY way to trip it is the NaN-override path
    // (section 3). This brute net proves the identity holds across a wide
    // grid, so a refactor that breaks the residual definition gets caught.
    let checked = 0;
    let rejected = 0;
    for (const units of [1, 2, 3.5, 8]) {
      for (const price of [1, 999, 100_000, 100_001]) {
        for (const cost of [0, 1, 500]) {
          if (cost > price) continue;
          for (const bps of [0, 250, 500, 5000]) {
            for (const floor of [0, 25]) {
              let r;
              try {
                r = resolveBookingCommissions(input({
                  offerLineItems: [{ units, unit_price_cents: price, talent_cost_cents: cost }],
                  platformConfig: cfg({ default_take_bps: bps, default_take_floor_cents: floor }),
                }));
              } catch (e) {
                // The ONLY expected throw in this grid is the legitimate
                // floor>gross rejection (talent_net would go negative). Any
                // other code here would be a genuine regression.
                assert.ok(e instanceof CommissionResolutionError);
                assert.equal((e as CommissionResolutionError).code, "lanes_do_not_sum");
                rejected++;
                continue;
              }
              // For every input that DID resolve, the identity holds exactly.
              assert.equal(
                r.platform_fee_cents + r.workspace_fee_cents + r.talent_net_cents,
                r.gross_cents,
              );
              assert.ok(r.platform_fee_cents >= 0);
              assert.ok(r.workspace_fee_cents >= 0);
              assert.ok(r.talent_net_cents >= 0);
              assert.equal(
                r.platform_fee_cents,
                Math.max(Math.round((r.gross_cents * bps) / 10000), floor),
              );
              checked++;
            }
          }
        }
      }
    }
    assert.ok(checked >= 100, `expected a broad grid, only checked ${checked}`);
    assert.ok(rejected > 0, "expected some floor>gross rejections in the grid");
  });
});
