import assert from "node:assert/strict";
import test from "node:test";

import {
  balanceDueCents,
  cardCreditPrincipalCents,
  cardServicePrincipal,
  type LedgerPaidRow,
  type SnapshotMoney,
} from "./balance-pure";

// Service MX$1,000, client pays the 1.5% fee (absorb-card mode): charged 101500.
const snap: SnapshotMoney[] = [{ gross_cents: 100000, gross_charged_cents: 101500, base_reservation_fee_cents: 0 }];
const manual = (grossCents: number, status = "paid", currency: string | null = "MXN", extra: Partial<LedgerPaidRow> = {}): LedgerPaidRow => ({
  grossCents, status, currency, kind: "manual", ...extra,
});
const card = (
  grossCents: number,
  snaps: readonly SnapshotMoney[] | null,
  status = "paid",
  currency: string | null = "MXN",
  paymentLink = false,
): LedgerPaidRow => ({
  grossCents,
  status,
  currency,
  kind: "card",
  serviceSubtotalCents: snaps
    ? cardCreditPrincipalCents(grossCents, snaps, { paymentLink })
    : cardCreditPrincipalCents(grossCents, [], { paymentLink }),
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
test("payment-link card with no snapshot: credit gross (TUL-155 proven)", () => {
  assert.equal(cardCreditPrincipalCents(50000, [], { paymentLink: true }), 50000);
  assert.equal(balanceDueCents(100000, [card(50000, null, "paid", "MXN", true)], "MXN"), 50000);
  assert.equal(balanceDueCents(50000, [card(50000, null, "paid", "MXN", true)], "MXN"), 0);
});
test("non-link card with no snapshot stays unknown", () => {
  assert.equal(cardCreditPrincipalCents(10000, [], { paymentLink: false }), null);
  assert.equal(cardCreditPrincipalCents(10000, []), null);
});
test("a reservation fee in the snapshot makes the principal unknown", () => {
  assert.equal(cardServicePrincipal(101500, [{ ...snap[0], base_reservation_fee_cents: 500 }]), null);
  assert.equal(cardCreditPrincipalCents(101500, [{ ...snap[0], base_reservation_fee_cents: 500 }]), null);
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
