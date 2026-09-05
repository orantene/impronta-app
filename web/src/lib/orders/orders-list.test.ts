import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketOf,
  filterOrders,
  totalsFor,
  canRefund,
  outstandingCents,
  type OrderListRow,
} from "@/lib/orders/orders-list";

function row(over: Partial<OrderListRow> = {}): OrderListRow {
  return {
    id: "aaaaaaaa-1111-2222-3333-444444444444",
    status: "paid",
    currency: "USD",
    totalCents: 5000,
    collectedCents: 5000,
    sourceChannel: "menu",
    createdAt: "2026-09-03T00:00:00Z",
    customerName: "Ana Ruiz",
    customerEmail: "ana@example.com",
    lineCount: 2,
    inquiryId: null,
    ...over,
  };
}

test("buckets group the states a desk actually thinks in", () => {
  assert.equal(bucketOf("draft"), "open");
  assert.equal(bucketOf("quoted"), "open");
  assert.equal(bucketOf("pending_payment"), "to_pay");
  assert.equal(bucketOf("paid"), "settled");
  assert.equal(bucketOf("fulfilled"), "settled");
  for (const s of ["cancelled", "refunded", "partially_refunded"]) {
    assert.equal(bucketOf(s), "reversed", s);
  }
});

test("an unknown status shows in open rather than vanishing", () => {
  // A row a staff member cannot see is worse than one in a slightly wrong column.
  assert.equal(bucketOf("some_future_state"), "open");
  const rows = [row({ status: "some_future_state" })];
  assert.equal(filterOrders(rows, { bucket: "open" }).length, 1);
  assert.equal(filterOrders(rows, { bucket: "all" }).length, 1);
});

test("search matches name, email, and an id PREFIX", () => {
  const rows = [row()];
  assert.equal(filterOrders(rows, { query: "ana" }).length, 1);
  assert.equal(filterOrders(rows, { query: "ANA@EXAMPLE" }).length, 1);
  // The id is what a staff member has when a customer reads it off a receipt.
  assert.equal(filterOrders(rows, { query: "aaaaaaaa" }).length, 1);
  // A mid-string id fragment is NOT a match — that is a scan, not a lookup.
  assert.equal(filterOrders(rows, { query: "2222" }).length, 0);
  assert.equal(filterOrders(rows, { query: "zzz" }).length, 0);
});

test("a null name or email does not throw the list", () => {
  const rows = [row({ customerName: null, customerEmail: null })];
  assert.equal(filterOrders(rows, { query: "ana" }).length, 0);
  assert.equal(filterOrders(rows, { query: "" }).length, 1);
});

test("bucket and channel and query compose", () => {
  const rows = [
    row({ id: "o1", status: "paid", sourceChannel: "menu" }),
    row({ id: "o2", status: "paid", sourceChannel: "offer" }),
    row({ id: "o3", status: "pending_payment", sourceChannel: "menu" }),
  ];
  assert.deepEqual(
    filterOrders(rows, { bucket: "settled", channel: "menu" }).map((r) => r.id),
    ["o1"],
  );
});

test("outstanding is clamped — over-collection is a refund, not a negative", () => {
  assert.equal(outstandingCents({ totalCents: 5000, collectedCents: 7500 }), 0);
  assert.equal(outstandingCents({ totalCents: 5000, collectedCents: 2000 }), 3000);
});

test("totals describe the rows ON SCREEN, not the tenant", () => {
  const rows = [
    row({ status: "paid", totalCents: 5000 }),
    row({ status: "pending_payment", totalCents: 8000, collectedCents: 2000 }),
    row({ status: "refunded", totalCents: 9999 }),
  ];
  const t = totalsFor(rows);
  assert.equal(t.count, 3);
  assert.equal(t.settledCents, 5000);
  assert.equal(t.outstandingCents, 6000);
  // A figure beside a filtered list that describes something else is how a
  // staff member reads a number and acts on the wrong one.
  const filtered = filterOrders(rows, { bucket: "settled" });
  assert.equal(totalsFor(filtered).settledCents, 5000);
  assert.equal(totalsFor(filtered).outstandingCents, 0);
});

test("refund needs money to have ACTUALLY moved", () => {
  assert.equal(canRefund({ status: "paid", collectedCents: 5000 }), true);
  assert.equal(canRefund({ status: "fulfilled", collectedCents: 5000 }), true);
  assert.equal(canRefund({ status: "partially_refunded", collectedCents: 5000 }), true);
  // Would call Stripe for a charge that never completed.
  assert.equal(canRefund({ status: "pending_payment", collectedCents: 0 }), false);
  // Refunding a shopping basket.
  assert.equal(canRefund({ status: "draft", collectedCents: 0 }), false);
  assert.equal(canRefund({ status: "cancelled", collectedCents: 0 }), false);
  // Settled state but nothing collected — a free reserve. Nothing to give back.
  assert.equal(canRefund({ status: "paid", collectedCents: 0 }), false);
});

// ── Mixed-currency totals ───────────────────────────────────────────────────
//
// `orders.currency` is per ROW. The totals strip used to sum every row and
// label the result with the FIRST row's currency, on the stated assumption
// that "every row in a filtered view shares a currency in practice". Nothing
// enforced that, and when it is false the figure is plausibly shaped,
// confidently labelled, and wrong in a way nobody can see.

test("single currency: the flat figures are populated and named", () => {
  const rows = [
    row({ id: "a", status: "paid", currency: "USD", totalCents: 5000, collectedCents: 5000 }),
    row({ id: "b", status: "pending_payment", currency: "USD", totalCents: 3000, collectedCents: 0 }),
  ];
  const t = totalsFor(rows);
  assert.equal(t.currency, "USD", "a single-currency list names its currency");
  assert.equal(t.settledCents, 5000);
  assert.equal(t.outstandingCents, 3000);
  assert.equal(t.byCurrency.length, 1);
});

test("MIXED currencies are never added together", () => {
  const rows = [
    row({ id: "a", status: "paid", currency: "USD", totalCents: 5000, collectedCents: 5000 }),
    row({ id: "b", status: "paid", currency: "ARS", totalCents: 100000, collectedCents: 100000 }),
  ];
  const t = totalsFor(rows);
  assert.equal(t.byCurrency.length, 2, "one bucket per currency");
  const usd = t.byCurrency.find((c) => c.currency === "USD")!;
  const ars = t.byCurrency.find((c) => c.currency === "ARS")!;
  assert.equal(usd.settledCents, 5000);
  assert.equal(ars.settledCents, 100000);
  // The old behaviour would have produced 105000 labelled "USD".
  assert.notEqual(usd.settledCents + ars.settledCents, usd.settledCents);
});

test("a mixed list refuses to name one currency, and zeroes the flat figures", () => {
  // A caller that ignores `currency` must show an obvious nothing rather than a
  // convincing wrong number.
  const rows = [
    row({ id: "a", status: "paid", currency: "USD", totalCents: 5000, collectedCents: 5000 }),
    row({ id: "b", status: "paid", currency: "ARS", totalCents: 100000, collectedCents: 100000 }),
  ];
  const t = totalsFor(rows);
  assert.equal(t.currency, null, "no single currency can be named");
  assert.equal(t.settledCents, 0);
  assert.equal(t.outstandingCents, 0);
  assert.equal(t.count, 2, "the row COUNT is still meaningful across currencies");
});

test("currency codes are compared case-insensitively", () => {
  // 'usd' and 'USD' are one currency, not two buckets.
  const rows = [
    row({ id: "a", status: "paid", currency: "usd", totalCents: 1000, collectedCents: 1000 }),
    row({ id: "b", status: "paid", currency: "USD", totalCents: 2000, collectedCents: 2000 }),
  ];
  const t = totalsFor(rows);
  assert.equal(t.byCurrency.length, 1);
  assert.equal(t.currency, "USD");
  assert.equal(t.settledCents, 3000);
});

test("an empty list names no currency and totals nothing", () => {
  const t = totalsFor([]);
  assert.equal(t.count, 0);
  assert.equal(t.currency, null);
  assert.deepEqual(t.byCurrency, []);
});
