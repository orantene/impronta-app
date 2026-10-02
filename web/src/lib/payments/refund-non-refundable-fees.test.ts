/**
 * Fees are NON-REFUNDABLE (owner decision 2026-10-01): the refundable ceiling
 * is the service amount only; legacy rows are unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRefundEligibility } from "@/lib/payments/refund-execute";
import { nonRefundableFeeCents, proportionalRefundCents } from "@/lib/billing/commission-processing";

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

const ppSeller = (over: Record<string, unknown> = {}) => ({
  processing_mode: "pass_through" as const,
  processing_fee_payer: "seller" as const,
  client_surcharge_cents: 150,
  ...over,
});
const ppClient = (over: Record<string, unknown> = {}) => ({
  processing_mode: "pass_through" as const,
  processing_fee_payer: "client" as const,
  client_surcharge_cents: 150,
  client_processing_fee_cents: 334,
  ...over,
});

test("seller pays $100: client paid 101.50, actual fee 3.24 -> refund 96.76", () => {
  const kept = nonRefundableFeeCents([ppSeller({ processing_fee_cents: 324 })]);
  assert.equal(kept, 474);
  const e = computeRefundEligibility({ ...base, grossAmountCents: 10_150, nonRefundableFeeCents: kept });
  assert.equal(e.remainingCents, 9_676);
  assert.equal(e.blockedCode, null);
});

test("client pays $100: gross 104.84 -> refund 100.00 (fees not refunded)", () => {
  const kept = nonRefundableFeeCents([ppClient()]);
  const e = computeRefundEligibility({ ...base, grossAmountCents: 10_484, nonRefundableFeeCents: kept });
  assert.equal(e.remainingCents, 10_000);
});

test("MXN seller pays: 2000.00 + 30.00 platform, fee 72.50 -> refund 1927.50", () => {
  const kept = nonRefundableFeeCents([ppSeller({ client_surcharge_cents: 3_000, processing_fee_cents: 7_250 })]);
  const e = computeRefundEligibility({ ...base, currency: "MXN", grossAmountCents: 203_000, nonRefundableFeeCents: kept });
  assert.equal(e.remainingCents, 192_750);
});

test("MXN client pays: 2000.00 service refunded in full", () => {
  const kept = nonRefundableFeeCents([ppClient({ client_surcharge_cents: 3_000, client_processing_fee_cents: 7_800 })]);
  const e = computeRefundEligibility({ ...base, currency: "MXN", grossAmountCents: 210_800, nonRefundableFeeCents: kept });
  assert.equal(e.remainingCents, 200_000);
});

test("partial 50% scales on the same base", () => {
  assert.equal(proportionalRefundCents(9_676, 0.5), 4_838);
  assert.equal(proportionalRefundCents(10_000, 0.5), 5_000);
  assert.equal(proportionalRefundCents(10_000, 2), 10_000);
  assert.equal(proportionalRefundCents(10_000, 0), 0);
});

test("seller pays but actual fee unknown: refund is blocked, never guessed", () => {
  const kept = nonRefundableFeeCents([ppSeller()]);
  assert.equal(kept, null);
  const e = computeRefundEligibility({ ...base, grossAmountCents: 10_150, nonRefundableFeeCents: kept });
  assert.equal(e.remainingCents, 0);
  assert.equal(e.blockedCode, "unavailable");
  assert.match(e.blockedReason ?? "", /not recorded/);
});

test("legacy included mode unchanged: 0 kept, whole gross refundable", () => {
  const kept = nonRefundableFeeCents([{ processing_mode: "included", client_surcharge_cents: 300 }]);
  assert.equal(kept, 0);
  assert.equal(
    computeRefundEligibility({ ...base, grossAmountCents: 10_300, nonRefundableFeeCents: kept }).remainingCents,
    10_300,
  );
});
