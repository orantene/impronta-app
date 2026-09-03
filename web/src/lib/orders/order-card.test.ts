import { test } from "node:test";
import assert from "node:assert/strict";
import { orderCardView, type OrderForCard } from "@/lib/orders/order-card";

function order(over: Partial<OrderForCard> = {}): OrderForCard {
  return { id: "o1", status: "paid", currency: "USD", totalCents: 3500, lineCount: 2, ...over };
}

test("the customer-facing noun comes from the words table, never hardcoded", () => {
  const asQuote = orderCardView(order({ status: "quoted" }), { viewerRole: "client", noun: "Quote" });
  const asOrder = orderCardView(order({ status: "quoted" }), { viewerRole: "client", noun: "Order" });
  assert.equal(asQuote.title, "Quote awaiting approval");
  assert.equal(asOrder.title, "Order awaiting approval");
});

test("a missing words row falls back to a word, not an empty string", () => {
  for (const noun of [null, undefined, "", "   "]) {
    const v = orderCardView(order(), { viewerRole: "client", noun });
    assert.equal(v.title, "Order paid", `noun=${JSON.stringify(noun)}`);
  }
});

test("an order that could not be loaded renders neutral, never $0.00", () => {
  const v = orderCardView(null, { viewerRole: "client", noun: "Order" });
  // "$0.00" is a lie a customer might act on. A blank card is merely unhelpful.
  assert.equal(v.unavailable, true);
  assert.equal(v.meta, "");
  assert.equal(v.showPayNow, false);
});

test("ONLY the client sees Pay now, and only when there is something to pay", () => {
  const pending = order({ status: "pending_payment", outstandingCents: 1200 });
  assert.equal(orderCardView(pending, { viewerRole: "client" }).showPayNow, true);
  // Staff seeing a Pay button would let them charge a client's card from the thread.
  assert.equal(orderCardView(pending, { viewerRole: "staff" }).showPayNow, false);
  assert.equal(orderCardView(pending, { viewerRole: "talent" }).showPayNow, false);
  // Nothing outstanding → no button, even for the client.
  assert.equal(
    orderCardView(order({ status: "pending_payment", outstandingCents: 0 }), { viewerRole: "client" }).showPayNow,
    false,
  );
  // And never on a settled order.
  assert.equal(orderCardView(order({ status: "paid" }), { viewerRole: "client" }).showPayNow, false);
});

test("a pending order shows what is OUTSTANDING, not the full total", () => {
  // A deposit was taken: showing the full total next to a Pay button would ask
  // the client to pay a sum they have already part-paid.
  const v = orderCardView(
    order({ status: "pending_payment", totalCents: 10000, outstandingCents: 2500 }),
    { viewerRole: "client" },
  );
  assert.match(v.meta, /^\$25\.00/);
});

test("staff add lines only while it is a draft or a quote", () => {
  for (const status of ["draft", "quoted"]) {
    assert.equal(orderCardView(order({ status }), { viewerRole: "staff" }).staffCanAddLines, true, status);
  }
  // A paid order's lines are settled: adding to one silently changes what the
  // client already agreed to. A balance goes on a NEW order.
  for (const status of ["pending_payment", "paid", "fulfilled", "refunded", "cancelled"]) {
    assert.equal(orderCardView(order({ status }), { viewerRole: "staff" }).staffCanAddLines, false, status);
  }
  // And never the client, whatever the state.
  assert.equal(orderCardView(order({ status: "draft" }), { viewerRole: "client" }).staffCanAddLines, false);
});

test("an unknown status degrades to draft rather than throwing or blanking", () => {
  const v = orderCardView(order({ status: "some_future_state" }), { viewerRole: "staff" });
  assert.equal(v.state, "draft");
  assert.equal(v.unavailable, false);
});

test("tone separates settled, awaiting and reversed", () => {
  assert.equal(orderCardView(order({ status: "paid" }), { viewerRole: "staff" }).tone, "success");
  assert.equal(orderCardView(order({ status: "pending_payment" }), { viewerRole: "staff" }).tone, "amber");
  assert.equal(orderCardView(order({ status: "refunded" }), { viewerRole: "staff" }).tone, "alert");
  assert.equal(orderCardView(order({ status: "draft" }), { viewerRole: "staff" }).tone, "info");
});

test("money formats explicitly, and non-USD says which currency", () => {
  assert.match(orderCardView(order({ totalCents: 3500 }), { viewerRole: "staff" }).meta, /^\$35\.00/);
  assert.match(orderCardView(order({ totalCents: 123456789 }), { viewerRole: "staff" }).meta, /^\$1,234,567\.89/);
  assert.match(orderCardView(order({ totalCents: 5, currency: "MXN" }), { viewerRole: "staff" }).meta, /^0\.05 MXN/);
  assert.match(orderCardView(order({ totalCents: 100 }), { viewerRole: "staff" }).meta, /^\$1\.00/);
});

test("item count is singular at one and omitted at zero", () => {
  assert.match(orderCardView(order({ lineCount: 1 }), { viewerRole: "staff" }).meta, /1 item$/);
  assert.match(orderCardView(order({ lineCount: 3 }), { viewerRole: "staff" }).meta, /3 items$/);
  assert.equal(orderCardView(order({ lineCount: 0 }), { viewerRole: "staff" }).meta, "$35.00");
});
