/**
 * Tests for the refund eligibility rules — the gate that decides whether a
 * refund is allowed to be issued at all, and for how much.
 *
 * These are the rules that stand between an admin and real money leaving the
 * platform, so each refusal is asserted explicitly rather than inferred from a
 * happy-path test.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  computeRefundEligibility,
  toStripeReason,
  isRefundReason,
  REFUND_REASONS,
} from "./refund-execute";

const PAID = {
  status: "paid",
  grossAmountCents: 10_000,
  currency: "USD",
  alreadyRefundedCents: 0,
  paymentIntentId: "pi_live_123",
  provider: "stripe",
};

describe("computeRefundEligibility", () => {
  test("a fully collected payment is refundable for its whole gross", () => {
    const e = computeRefundEligibility(PAID);
    assert.equal(e.blockedReason, null);
    assert.equal(e.remainingCents, 10_000);
  });

  test("a prior partial refund reduces what is left", () => {
    const e = computeRefundEligibility({ ...PAID, alreadyRefundedCents: 2_500 });
    assert.equal(e.blockedReason, null);
    assert.equal(e.remainingCents, 7_500);
    assert.equal(e.alreadyRefundedCents, 2_500);
  });

  test("refunds are blocked once the full gross has been returned", () => {
    const e = computeRefundEligibility({ ...PAID, alreadyRefundedCents: 10_000 });
    assert.match(e.blockedReason ?? "", /already fully refunded/i);
    assert.equal(e.remainingCents, 0);
  });

  test("over-refunding cannot produce a negative remaining balance", () => {
    // Defensive: a mis-recorded refund row must not open up a negative that
    // some later arithmetic could read as headroom.
    const e = computeRefundEligibility({ ...PAID, alreadyRefundedCents: 12_000 });
    assert.equal(e.remainingCents, 0);
    assert.ok(e.blockedReason);
  });

  test("payout_sent is still refundable — the payout is reversed, not the refund refused", () => {
    for (const status of ["paid", "payout_pending", "payout_sent", "disputed"]) {
      const e = computeRefundEligibility({ ...PAID, status });
      assert.equal(e.blockedReason, null, `${status} should be refundable`);
    }
  });

  test("a payment that was never collected cannot be refunded", () => {
    for (const status of ["draft", "payment_requested", "pending", "failed", "cancelled"]) {
      const e = computeRefundEligibility({ ...PAID, status });
      assert.ok(e.blockedReason, `${status} must be blocked`);
    }
  });

  test("an already-refunded transaction says so plainly", () => {
    const e = computeRefundEligibility({ ...PAID, status: "refunded" });
    assert.match(e.blockedReason ?? "", /already fully refunded/i);
  });

  test("no linked Stripe charge blocks the refund and points at the off-platform path", () => {
    // This is the case that protected the talent: without a charge id there is
    // nothing to refund at Stripe, and reversing their payout anyway is exactly
    // the bug this work exists to fix.
    const e = computeRefundEligibility({ ...PAID, paymentIntentId: null });
    assert.ok(e.blockedReason);
    assert.match(e.blockedReason ?? "", /off-platform/i);
  });

  test("the no-charge refusal outranks the amount check", () => {
    const e = computeRefundEligibility({
      ...PAID,
      paymentIntentId: null,
      alreadyRefundedCents: 10_000,
    });
    // Both conditions hold; the actionable message is the missing charge.
    assert.match(e.blockedReason ?? "", /no stripe charge/i);
  });
});

describe("refund reason mapping", () => {
  test("every reason maps to a value Stripe accepts", () => {
    const allowed = new Set(["duplicate", "fraudulent", "requested_by_customer"]);
    for (const reason of REFUND_REASONS) {
      assert.ok(allowed.has(toStripeReason(reason)), `${reason} produced an invalid Stripe reason`);
    }
  });

  test("the two reasons Stripe models directly are not flattened away", () => {
    assert.equal(toStripeReason("duplicate_charge"), "duplicate");
    assert.equal(toStripeReason("fraudulent"), "fraudulent");
  });

  test("business reasons Stripe has no word for fall back to requested_by_customer", () => {
    assert.equal(toStripeReason("goodwill"), "requested_by_customer");
    assert.equal(toStripeReason("service_not_delivered"), "requested_by_customer");
  });

  test("isRefundReason rejects anything not in the taxonomy", () => {
    assert.equal(isRefundReason("goodwill"), true);
    assert.equal(isRefundReason("because_i_said_so"), false);
    assert.equal(isRefundReason(""), false);
    // A raw Stripe reason is not one of ours.
    assert.equal(isRefundReason("requested_by_customer"), false);
  });
});
