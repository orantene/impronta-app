import assert from "node:assert/strict";
import test from "node:test";

import { balanceDueCents, cardServicePrincipal, type LedgerPaidRow, type SnapshotMoney } from "./balance-pure";

// Service MX$1,000, client pays the 1.5% fee (absorb-card mode): charged 101500.
const snap: SnapshotMoney[] = [{ gross_cents: 100000, gross_charged_cents: 101500, base_reservation_fee_cents: 0 }];
const manual = (grossCents: number, status = "paid", currency: string | null = "MXN", extra: Partial<LedgerPaidRow> = {}): LedgerPaidRow => ({
  grossCents, status, currency, kind: "manual", ...extra,
});
const card = (grossCents: number, snaps: readonly SnapshotMoney[] | null, status = "paid", currency: string | null = "MXN"): LedgerPaidRow => ({
  grossCents, status, currency, kind: "card", serviceSubtotalCents: snaps ? cardServicePrincipal(grossCents, snaps) : null,
});

test("card paid in full (101500 on a 100000 service): balance 0, not -1500", () => {
  assert.equal(balanceDueCents(100000, [card(101500, snap)], "MXN"), 0);
});
test("card partial MX$500 + 1.5% (50750): MX$500 still owed", () => {
  assert.equal(balanceDueCents(100000, [card(50750, snap)], "MXN"), 50000);
});
test("manual or cash row is credited at gross", () => {
  assert.equal(balanceDueCents(100000, [manual(30000)], "MXN"), 70000);
  assert.equal(balanceDueCents(100000, [manual(30000), card(50750, snap)], "mxn"), 20000);
});
test("card row without a snapshot, or one that cannot be matched: unknown", () => {
  assert.equal(balanceDueCents(100000, [card(101500, null)], "MXN"), null);
  assert.equal(balanceDueCents(100000, [card(40001, snap)], "MXN"), null);
  assert.equal(balanceDueCents(100000, [card(999999, snap)], "MXN"), null);
});
test("a reservation fee in the snapshot makes the principal unknown", () => {
  assert.equal(cardServicePrincipal(101500, [{ ...snap[0], base_reservation_fee_cents: 500 }]), null);
});
test("a refund row: unknown", () => {
  assert.equal(balanceDueCents(100000, [manual(30000), manual(1000, "paid", "MXN", { refundOfTransactionId: "tx" })], "MXN"), null);
});
test("a money-in row in another currency: unknown; an unpaid one is ignored", () => {
  assert.equal(balanceDueCents(100000, [manual(30000, "paid", "USD")], "MXN"), null);
  assert.equal(balanceDueCents(100000, [manual(30000, "draft", "USD")], "MXN"), 100000);
});
test("refunded and unpaid rows never count; nothing paid owes the full total", () => {
  assert.equal(balanceDueCents(100000, [manual(30000, "refunded"), manual(500, "payment_requested")], "MXN"), 100000);
  assert.equal(balanceDueCents(100000, [], "MXN"), 100000);
});
test("no usable total: unknown", () => {
  for (const t of [null, undefined, 0, -5, Number.NaN]) assert.equal(balanceDueCents(t, [], "MXN"), null, String(t));
});
