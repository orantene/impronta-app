import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clientBalances,
  collectVerdict,
  purchaseOwedCents,
  unpaidPurchases,
  type ClientPurchase,
  type ClientRecord,
} from "./client-record";

function purchase(over: Partial<ClientPurchase> = {}): ClientPurchase {
  return {
    orderId: "o-1",
    status: "pending_payment",
    currency: "USD",
    totalCents: 5000,
    collectedCents: 0,
    createdAt: "2026-09-01T00:00:00Z",
    lineCount: 1,
    inquiryId: null,
    ...over,
  };
}

function record(over: Partial<ClientRecord> = {}): ClientRecord {
  return {
    customerId: "c-1",
    tenantId: "t-1",
    timeZone: "America/Mexico_City",
    displayName: "Casa Verde",
    email: "hola@casaverde.example",
    phoneE164: null,
    clientProfileId: null,
    userId: null,
    locale: "es",
    visits: 3,
    noShows: 0,
    lastSeenAt: "2026-09-01T00:00:00Z",
    tags: [],
    notes: null,
    purchases: [],
    projects: [],
    bookings: [],
    ...over,
  };
}

test("BALANCES ARE PER CURRENCY, NEVER ONE ADDED-UP NUMBER", () => {
  // 4500 ARS + 20 USD = 4520 of nothing. The screen renders one line each.
  const mixed = record({
    purchases: [
      purchase({ orderId: "o-1", currency: "ARS", totalCents: 450000 }),
      purchase({ orderId: "o-2", currency: "USD", totalCents: 2000 }),
    ],
  });
  const balances = clientBalances(mixed);
  assert.equal(balances.length, 2);
  assert.deepEqual(
    balances.map((b) => [b.currency, b.owedCents]),
    [
      ["ARS", 450000],
      ["USD", 2000],
    ],
  );
});

test("balances in one currency are summed, which is the ordinary case", () => {
  const one = record({
    purchases: [
      purchase({ orderId: "o-1", totalCents: 5000, collectedCents: 0 }),
      purchase({ orderId: "o-2", totalCents: 2000, collectedCents: 500 }),
    ],
  });
  assert.deepEqual(clientBalances(one), [{ currency: "USD", owedCents: 6500, collectedCents: 500 }]);
});

// ── THE RULE: only an order awaiting payment is money owed ───────────

test("A CANCELLED OR DRAFT ORDER IS NEVER PART OF WHAT A CLIENT OWES", () => {
  // The same rule the Orders desk applies, reached from the client record.
  // Without it, Collect names an amount and a record count over money nobody
  // owes and an operator asks a client to settle a voided sale.
  const messy = record({
    purchases: [
      purchase({ orderId: "o-owed", status: "pending_payment", totalCents: 6500 }),
      purchase({ orderId: "o-void", status: "cancelled", totalCents: 4000 }),
      purchase({ orderId: "o-cart", status: "draft", totalCents: 700 }),
      purchase({ orderId: "o-quote", status: "quoted", totalCents: 1200 }),
      // Refunded: the charge went paid -> refunded, so collected reads zero and
      // total - collected would resurrect the whole amount.
      purchase({ orderId: "o-back", status: "refunded", totalCents: 3000, collectedCents: 0 }),
    ],
  });

  assert.deepEqual(clientBalances(messy), [
    { currency: "USD", owedCents: 6500, collectedCents: 0 },
  ]);
  assert.deepEqual(
    unpaidPurchases(messy).map((p) => p.orderId),
    ["o-owed"],
    "only the order awaiting payment is a record a Collect applies to",
  );
  assert.deepEqual(collectVerdict(messy), {
    ok: true,
    currency: "USD",
    owedCents: 6500,
    recordCount: 1,
  });

  assert.equal(purchaseOwedCents(messy.purchases[1]!), 0, "cancelled");
  assert.equal(purchaseOwedCents(messy.purchases[2]!), 0, "draft");
  assert.equal(purchaseOwedCents(messy.purchases[3]!), 0, "quoted");
  assert.equal(purchaseOwedCents(messy.purchases[4]!), 0, "refunded");
});

test("a client whose only unsettled orders are cancelled has nothing to collect", () => {
  const voided = record({
    purchases: [purchase({ orderId: "o-void", status: "cancelled", totalCents: 4000 })],
  });
  assert.deepEqual(collectVerdict(voided), { ok: false, reason: "nothing_owed" });
  assert.deepEqual(clientBalances(voided), [{ currency: "USD", owedCents: 0, collectedCents: 0 }]);
});

test("A COLLECT ACROSS TWO CURRENCIES IS REFUSED, NOT GUESSED", () => {
  const mixed = record({
    purchases: [
      purchase({ orderId: "o-1", currency: "ARS", totalCents: 450000 }),
      purchase({ orderId: "o-2", currency: "USD", totalCents: 2000 }),
    ],
  });
  assert.deepEqual(collectVerdict(mixed), { ok: false, reason: "mixed_currency" });

  // The positive control: drop one currency and the same client collects.
  const single = record({
    purchases: [
      purchase({ orderId: "o-1", totalCents: 5000 }),
      purchase({ orderId: "o-2", totalCents: 1500 }),
    ],
  });
  assert.deepEqual(collectVerdict(single), {
    ok: true,
    currency: "USD",
    owedCents: 6500,
    recordCount: 2,
  });

  // And the currency split is made on what is OWED, not on what exists: a
  // cancelled peso order must not turn a dollar client into a refusal.
  const dollarsPlusVoidedPesos = record({
    purchases: [
      purchase({ orderId: "o-1", totalCents: 5000 }),
      purchase({ orderId: "o-2", currency: "ARS", status: "cancelled", totalCents: 450000 }),
    ],
  });
  assert.deepEqual(collectVerdict(dollarsPlusVoidedPesos), {
    ok: true,
    currency: "USD",
    owedCents: 5000,
    recordCount: 1,
  });
});

test("nothing owed is its own refusal, not an empty collect", () => {
  const settled = record({
    purchases: [purchase({ status: "paid", totalCents: 5000, collectedCents: 5000 })],
  });
  assert.deepEqual(collectVerdict(settled), { ok: false, reason: "nothing_owed" });
  assert.deepEqual(unpaidPurchases(settled), []);
  assert.deepEqual(collectVerdict(record()), { ok: false, reason: "nothing_owed" });
});

test("unpaid records come back newest first, so the operator sees the live one", () => {
  const many = record({
    purchases: [
      purchase({ orderId: "old", createdAt: "2026-01-01T00:00:00Z" }),
      purchase({ orderId: "new", createdAt: "2026-09-01T00:00:00Z" }),
      purchase({
        orderId: "paid",
        createdAt: "2026-09-02T00:00:00Z",
        status: "paid",
        collectedCents: 5000,
      }),
    ],
  });
  assert.deepEqual(unpaidPurchases(many).map((p) => p.orderId), ["new", "old"]);
});
