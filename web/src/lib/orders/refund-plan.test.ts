import test from "node:test";
import assert from "node:assert/strict";

import { planRefund, refundableCentsFor, releasesPromoRedemption } from "./refund-plan";

const line = (id: string, total: number, refunded = 0, variantId: string | null = null) =>
  ({ id, totalCents: total, refundedCents: refunded, variantId, eventId: null });

const txn = (id: string, gross: number, refunded = 0) =>
  ({ id, grossAmountCents: gross, refundedCents: refunded });

test("GAP 2: a line spanning a deposit and a balance splits across both", () => {
  // The failure the Director flagged as most likely to be found by a customer
  // rather than a test: the engine refunds ONE transaction, and this line's
  // value is spread over two.
  const plan = planRefund({
    lines: [line("l1", 10000)],
    lineIds: ["l1"],
    scope: {},
    discountCents: 0,
    transactions: [txn("deposit", 2500), txn("balance", 7500)],
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.steps, [
    { transactionId: "deposit", amountCents: 2500 },
    { transactionId: "balance", amountCents: 7500 },
  ]);
  assert.equal(plan.totalCents, 10000);
});

test("oldest transaction drains first", () => {
  const plan = planRefund({
    lines: [line("l1", 3000)],
    lineIds: ["l1"],
    scope: {},
    discountCents: 0,
    transactions: [txn("deposit", 2500), txn("balance", 7500)],
  });
  assert.equal(plan.ok && plan.steps[0]?.transactionId, "deposit");
  assert.equal(plan.ok && plan.steps[0]?.amountCents, 2500);
  assert.equal(plan.ok && plan.steps[1]?.amountCents, 500);
});

test("GAP 3: a discounted line returns its NET share, never gross", () => {
  // 2 lines of 5000, order-level discount 2000 -> each line's share is 1000,
  // so a line is worth 4000 back. Refunding 5000 would return more than the
  // customer paid.
  const lines = [line("l1", 5000), line("l2", 5000)];
  assert.equal(refundableCentsFor(lines[0]!, lines, {}, 2000), 4000);
  const plan = planRefund({
    lines, lineIds: ["l1"], scope: {}, discountCents: 2000,
    transactions: [txn("t1", 8000)],
  });
  assert.equal(plan.ok && plan.totalCents, 4000);
});

test("a tier-scoped discount only reduces the lines it covered", () => {
  const vip = line("vip", 10000, 0, "vip");
  const ga = line("ga", 2000, 0, "ga");
  const lines = [vip, ga];
  // 3000 off VIP only: VIP returns 7000, GA returns its full 2000.
  assert.equal(refundableCentsFor(vip, lines, { variantId: "vip" }, 3000), 7000);
  assert.equal(refundableCentsFor(ga, lines, { variantId: "vip" }, 3000), 2000);
});

test("a line already fully refunded REFUSES, it does not return zero", () => {
  // Returning ok with amount 0 would make a double refund look successful.
  const plan = planRefund({
    lines: [line("l1", 5000, 5000)],
    lineIds: ["l1"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 5000, 5000)],
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.reason, "line_already_refunded");
});

test("more than was captured REFUSES rather than refunding what it can", () => {
  // A partial execution leaves money owed with no record of the intent, and the
  // customer sees one refund where two were promised.
  const plan = planRefund({
    lines: [line("l1", 10000)],
    lineIds: ["l1"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 4000)],
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.reason, "exceeds_captured");
});

test("a transaction already fully refunded is skipped, not counted", () => {
  const plan = planRefund({
    lines: [line("l1", 3000)],
    lineIds: ["l1"], scope: {}, discountCents: 0,
    transactions: [txn("spent", 5000, 5000), txn("live", 5000)],
  });
  assert.equal(plan.ok && plan.steps.length, 1);
  assert.equal(plan.ok && plan.steps[0]?.transactionId, "live");
});

test("a line not on the order refuses, and says which kind of wrong it is", () => {
  const plan = planRefund({
    lines: [line("l1", 1000)],
    lineIds: ["nope"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 1000)],
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.reason, "line_not_on_order");
});

// ── The promo ruling ────────────────────────────────────────────────────────

test("a FULL refund releases the promo redemption", () => {
  const plan = planRefund({
    lines: [line("l1", 5000)],
    lineIds: ["l1"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 5000)],
  });
  assert.equal(plan.ok, true);
  if (plan.ok) assert.equal(releasesPromoRedemption(plan), true);
});

test("a PARTIAL refund does NOT release it — a partial refund is still a purchase", () => {
  const plan = planRefund({
    lines: [line("l1", 5000), line("l2", 5000)],
    lineIds: ["l1"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 10000)],
  });
  assert.equal(plan.ok, true);
  if (plan.ok) assert.equal(releasesPromoRedemption(plan), false);
});

test("refunding the LAST outstanding line is full, even if others went earlier", () => {
  // Fullness is a property of the ORDER after this plan, not of this call.
  const plan = planRefund({
    lines: [line("l1", 5000, 5000), line("l2", 5000)],
    lineIds: ["l2"], scope: {}, discountCents: 0,
    transactions: [txn("t1", 10000, 5000)],
  });
  assert.equal(plan.ok, true);
  if (plan.ok) assert.equal(releasesPromoRedemption(plan), true);
});
