/**
 * Fees are NON-REFUNDABLE (owner decision 2026-10-01): the refundable ceiling
 * is the service amount only; legacy rows are unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRefundEligibility } from "@/lib/payments/refund-execute";

const base = {
  status: "paid",
  currency: "USD",
  alreadyRefundedCents: 0,
  paymentIntentId: "pi_1",
  provider: "stripe",
};

test("pass_through: client paid 104.84, only the 100.00 service amount is refundable", () => {
  const e = computeRefundEligibility({ ...base, grossAmountCents: 10_484, nonRefundableFeeCents: 484 });
  assert.equal(e.remainingCents, 10_000);
  assert.equal(e.nonRefundableFeeCents, 484);
  assert.equal(e.blockedCode, null);
});

test("after the service amount is refunded nothing more can be refunded", () => {
  const e = computeRefundEligibility({
    ...base,
    grossAmountCents: 10_484,
    nonRefundableFeeCents: 484,
    alreadyRefundedCents: 10_000,
  });
  assert.equal(e.remainingCents, 0);
  assert.equal(e.blockedCode, "already_refunded");
});

test("legacy (no fee info): unchanged, whole gross refundable and no new key on the result", () => {
  const e = computeRefundEligibility({ ...base, grossAmountCents: 10_300 });
  assert.equal(e.remainingCents, 10_300);
  assert.equal("nonRefundableFeeCents" in e, false);
});
