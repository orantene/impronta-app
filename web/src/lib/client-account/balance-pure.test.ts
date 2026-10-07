import assert from "node:assert/strict";
import test from "node:test";

import { balanceDueCents, type LedgerPaidRow } from "./balance-pure";

const row = (grossCents: number, status = "paid", currency: string | null = "USD", extra: Partial<LedgerPaidRow> = {}): LedgerPaidRow => ({
  grossCents, status, currency, ...extra,
});

test("nothing paid: the full total is owed", () => {
  assert.equal(balanceDueCents(10000, [], "USD"), 10000);
  assert.equal(balanceDueCents(10000, [row(10000, "draft"), row(500, "payment_requested")], "USD"), 10000);
});
test("part-paid: the remainder, not the total", () => {
  assert.equal(balanceDueCents(10000, [row(3000)], "USD"), 7000);
  assert.equal(balanceDueCents(10000, [row(3000), row(2000, "payout_sent")], "usd"), 5000);
});
test("fully paid and over-paid clamp to zero", () => {
  assert.equal(balanceDueCents(10000, [row(10000)], "USD"), 0);
  assert.equal(balanceDueCents(10000, [row(12000)], "USD"), 0);
});
test("a refunded row is money out: it does not count as paid", () => {
  assert.equal(balanceDueCents(10000, [row(3000, "refunded")], "USD"), 10000);
});
test("a refund-of row cannot be netted safely: no number", () => {
  assert.equal(balanceDueCents(10000, [row(3000), row(1000, "paid", "USD", { refundOfTransactionId: "tx1" })], "USD"), null);
});
test("a money-in row in another currency: no number; an unpaid one in another currency is ignored", () => {
  assert.equal(balanceDueCents(10000, [row(3000, "paid", "MXN")], "USD"), null);
  assert.equal(balanceDueCents(10000, [row(3000, "draft", "MXN")], "USD"), 10000);
});
test("no usable total: no number", () => {
  for (const t of [null, undefined, 0, -5, Number.NaN]) assert.equal(balanceDueCents(t, [], "USD"), null, String(t));
});
