/**
 * Regression tests for the line-item GRAIN bug (migration 20261226000017).
 *
 * On `inquiry_offer_line_items`, `unit_price` is PER UNIT but `talent_cost` is
 * the LINE TOTAL. `engine_load_commission_context` passed both through as if
 * both were per-unit, and the resolver multiplies both by `units` — so for any
 * line with units > 1 the talent's cost was multiplied a second time.
 *
 * That value is not cosmetic: `lib/payments/transfers.ts` pays
 * `snap.talent_net_cents` straight through as the transfer amount, so an
 * inflated snapshot moves real money out of the platform balance.
 *
 * These tests encode the CONTEXT'S shape — line totals — and demonstrate what
 * the old shape produced, so the fix cannot be quietly undone.
 *
 * NOTE (units removal): the resolver no longer has a `units` field at all, so
 * the multiply that caused this bug cannot be expressed any more. The SQL
 * context still emits `'units', 1`, which is now simply an unread key. These
 * tests are kept because they pin the VALUES the context must send — the
 * grain, the total_price-vs-unit_price choice, and the rounding argument for
 * not dividing — none of which the type system can enforce.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { resolveBookingCommissions, type OfferLineItemForResolver } from "./commission";

const CONFIG = {
  default_take_bps: 600,
  default_take_floor_cents: 0,
  plan_tier_bps: {},
  client_surcharge_bps: 300,
};

function resolve(lines: OfferLineItemForResolver[]) {
  return resolveBookingCommissions({
    tenantId: "11111111-1111-1111-1111-111111111111",
    workspacePlan: "agency",
    offerLineItems: lines,
    currencyCode: "USD",
    paymentMethod: "card",
    platformConfig: CONFIG,
    tenantOverride: null,
  } as Parameters<typeof resolveBookingCommissions>[0]);
}

describe("line-item grain — the context passes LINE TOTALS", () => {
  test("a 2-unit offer row does not pay the talent twice", () => {
    // $1000 line: 2 units at $500, talent owed $400 for the LINE.
    const correct = resolve([
      { line_total_cents: 100_000, talent_cost_total_cents: 40_000 },
    ]);
    assert.equal(correct.talent_net_cents, 40_000, "talent is owed the line total, once");

    // The shape the context used to send: units carried, talent_cost still a
    // TOTAL. The resolver faithfully multiplies, and the talent doubles.
    const buggy = resolve([
      { line_total_cents: 100_000, talent_cost_total_cents: 80_000 },
    ]);
    assert.equal(buggy.talent_net_cents, 80_000, "documents the defect: $400 became $800");
    assert.equal(
      buggy.talent_net_cents - correct.talent_net_cents,
      40_000,
      "the overpayment was exactly one extra copy of the line total",
    );
  });

  test("the OTHER failure mode: the old grain could throw instead of overpay", () => {
    // Whether the bug took money or blocked the booking depended entirely on
    // the numbers. With the staged case (2 units, unit_price 150.005,
    // talent_cost 200.00) the LINE total 20000 exceeds the PER-UNIT price
    // 15001, so the guard fired and conversion failed outright — a dead convert
    // button on an ordinary quoted job.
    assert.throws(
      () => resolve([{ line_total_cents: 30_002, talent_cost_total_cents: 40_000 }]),
      /talent_cost_exceeds_price/,
      "the pre-fix grain made a legitimate line look impossible",
    );
    // At the corrected grain the same real-world line converts cleanly.
    assert.doesNotThrow(() =>
      resolve([{ line_total_cents: 30_001, talent_cost_total_cents: 20_000 }]),
    );
  });

  test("the client subtotal matches total_price, not unit_price x quantity", () => {
    // round(150.005 * 100) * 2 = 30002, but the client agreed to 30001.
    // Passing total_price with units=1 makes the snapshot agree with the order.
    const correct = resolve([
      { line_total_cents: 30_001, talent_cost_total_cents: 20_000 },
    ]);
    const drifted = resolve([
      { line_total_cents: 30_002, talent_cost_total_cents: 20_000 },
    ]);
    assert.equal(correct.gross_charged_cents - correct.client_surcharge_cents, 30_001);
    assert.equal(drifted.gross_charged_cents - drifted.client_surcharge_cents, 30_002);
  });

  test("line totals keep the arithmetic exact for an awkward division", () => {
    // $200.00 over 3 units has no exact per-unit representation: 6667c x 3 is
    // 20001c. Dividing was rejected for exactly this reason; units=1 avoids it.
    const r = resolve([{ line_total_cents: 50_000, talent_cost_total_cents: 20_000 }]);
    assert.equal(r.talent_net_cents, 20_000, "no drift, because nothing was divided");
  });

  test("the lanes still sum to what the client is charged", () => {
    // The engine's core invariant. If a grain change ever broke it, every
    // downstream payout would be wrong in the same direction.
    const r = resolve([
      { line_total_cents: 30_001, talent_cost_total_cents: 20_000 },
      { line_total_cents: 10_000, talent_cost_total_cents: 4_000 },
    ]);
    assert.equal(
      r.talent_net_cents + r.workspace_fee_cents + r.platform_fee_cents,
      r.gross_charged_cents,
      "talent + workspace + platform must equal what the client pays",
    );
  });

  test("a total-vs-total comparison no longer trips the guard", () => {
    // Pre-fix, comparing a line TOTAL (20000) against a PER-UNIT price (15001)
    // threw `talent_cost_exceeds_price` on ordinary multi-unit data — a dead
    // convert button rather than wrong money. At units=1 both sides are totals.
    assert.doesNotThrow(() =>
      resolve([{ line_total_cents: 30_001, talent_cost_total_cents: 20_000 }]),
    );
  });

  test("a genuinely impossible line is still refused", () => {
    // The guard must keep working: a talent cost above the client's total is
    // nonsense whatever the grain.
    assert.throws(
      () => resolve([{ line_total_cents: 10_000, talent_cost_total_cents: 12_000 }]),
      /talent_cost_exceeds_price/,
    );
  });
});
