import test from "node:test";
import assert from "node:assert/strict";

import { planRefund, refundableCentsFor, releasesPromoRedemption, txnRefundableCents } from "./refund-plan";

const line = (id: string, total: number, refunded = 0, variantId: string | null = null) =>
  ({ id, totalCents: total, refundedCents: refunded, variantId, eventId: null });

const txn = (id: string, gross: number, refunded = 0, fee = 0) =>
  ({ id, grossAmountCents: gross, refundedCents: refunded, nonRefundableFeeCents: fee });

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

test("a FREE line ($0 comp) plans with no money steps instead of refusing (D-175)", () => {
  // A comp never had money to give back; refusing it as "already refunded"
  // meant no free ticket could ever be cancelled from the desk or the door.
  const plan = planRefund({
    lines: [line("comp", 0, 0)],
    lineIds: ["comp"], scope: {}, discountCents: 0,
    transactions: [],
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.deepEqual(plan.steps, []);
    assert.equal(plan.totalCents, 0);
    assert.deepEqual(plan.lines, [{ id: "comp", amountCents: 0 }]);
  }
});

test("a PAID line fully refunded still refuses when picked next to a free one", () => {
  const plan = planRefund({
    lines: [line("comp", 0, 0), line("ga", 5000, 5000)],
    lineIds: ["comp", "ga"], scope: {}, discountCents: 0,
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

test("TUL-431: amountCents caps a single line (MX$300 of a larger service)", () => {
  // Line is 1,500.00 MXN (150_000 minor); ask for 300.00 MXN (30_000 minor).
  const plan = planRefund({
    lines: [line("svc", 150_000)],
    lineIds: ["svc"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 150_000)],
    amountCents: 30_000,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.totalCents, 30_000);
  assert.deepEqual(plan.lines, [{ id: "svc", amountCents: 30_000 }]);
  assert.deepEqual(plan.steps, [{ transactionId: "t1", amountCents: 30_000 }]);
  assert.equal(plan.isFullRefund, false);
});

test("TUL-431: amountCents over the remaining refuses as exceeds_captured", () => {
  const plan = planRefund({
    lines: [line("svc", 5_000)],
    lineIds: ["svc"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 5_000)],
    amountCents: 5_001,
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.reason, "exceeds_captured");
});

test("TUL-431: amountCents on two lines drains the first, drops the rest at $0", () => {
  const plan = planRefund({
    lines: [line("a", 4_000), line("b", 6_000)],
    lineIds: ["a", "b"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 10_000)],
    amountCents: 2_500,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.lines, [{ id: "a", amountCents: 2_500 }]);
  assert.equal(plan.totalCents, 2_500);
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

test("TUL-469: after a MX$300 partial, the MX$700 remainder plans (no fee)", () => {
  // Line 1,000.00; first refund took 300.00; ask for the rest.
  const plan = planRefund({
    lines: [line("svc", 100_000, 30_000)],
    lineIds: ["svc"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 100_000, 30_000)],
    amountCents: 70_000,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.totalCents, 70_000);
  assert.deepEqual(plan.steps, [{ transactionId: "t1", amountCents: 70_000 }]);
  assert.equal(plan.isFullRefund, true);
});

test("TUL-469: remainder after partial succeeds when fees shrink capture below line left", () => {
  // Seller-pays style: gross == principal, fee kept. After 300 refunded, line
  // still wants 700 but capture left is 670 — "full remaining" must CAP to 670
  // instead of refusing as exceeds_captured.
  assert.equal(txnRefundableCents(txn("t1", 100_000, 30_000, 3_000)), 67_000);
  const plan = planRefund({
    lines: [line("svc", 100_000, 30_000)],
    lineIds: ["svc"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 100_000, 30_000, 3_000)],
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.totalCents, 67_000);
  assert.deepEqual(plan.steps, [{ transactionId: "t1", amountCents: 67_000 }]);
  assert.equal(plan.isFullRefund, false);
});

test("TUL-469: explicit ask over capture left still refuses", () => {
  const plan = planRefund({
    lines: [line("svc", 100_000, 30_000)],
    lineIds: ["svc"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 100_000, 30_000, 3_000)],
    amountCents: 70_000,
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.reason, "exceeds_captured");
});

test("TUL-469: tip that does not fit must not refuse the line remainder", () => {
  // Completing the line triggers tip; tip was never in the capture. The line
  // remainder still plans; tip that fits is 0.
  const plan = planRefund({
    lines: [line("svc", 100_000, 30_000)],
    lineIds: ["svc"],
    scope: {},
    discountCents: 0,
    transactions: [txn("t1", 100_000, 30_000)],
    tipCents: 10_000,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.totalCents, 70_000);
  assert.deepEqual(plan.steps, [{ transactionId: "t1", amountCents: 70_000 }]);
});
