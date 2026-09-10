import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clientBalances,
  collectVerdict,
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
    outstandingCents: 5000,
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
      purchase({ orderId: "o-1", currency: "ARS", totalCents: 450000, outstandingCents: 450000 }),
      purchase({ orderId: "o-2", currency: "USD", totalCents: 2000, outstandingCents: 2000 }),
    ],
  });
  const balances = clientBalances(mixed);
  assert.equal(balances.length, 2);
  assert.deepEqual(
    balances.map((b) => [b.currency, b.outstandingCents]),
    [
      ["ARS", 450000],
      ["USD", 2000],
    ],
  );
});

test("balances in one currency are summed, which is the ordinary case", () => {
  const one = record({
    purchases: [
      purchase({ orderId: "o-1", outstandingCents: 5000, collectedCents: 0 }),
      purchase({ orderId: "o-2", outstandingCents: 1500, collectedCents: 500 }),
    ],
  });
  assert.deepEqual(clientBalances(one), [
    { currency: "USD", outstandingCents: 6500, collectedCents: 500 },
  ]);
});

test("A COLLECT ACROSS TWO CURRENCIES IS REFUSED, NOT GUESSED", () => {
  const mixed = record({
    purchases: [
      purchase({ orderId: "o-1", currency: "ARS", outstandingCents: 450000 }),
      purchase({ orderId: "o-2", currency: "USD", outstandingCents: 2000 }),
    ],
  });
  assert.deepEqual(collectVerdict(mixed), { ok: false, reason: "mixed_currency" });

  // The positive control: drop one currency and the same client collects.
  const single = record({
    purchases: [
      purchase({ orderId: "o-1", outstandingCents: 5000 }),
      purchase({ orderId: "o-2", outstandingCents: 1500 }),
    ],
  });
  assert.deepEqual(collectVerdict(single), {
    ok: true,
    currency: "USD",
    outstandingCents: 6500,
    recordCount: 2,
  });
});

test("nothing owed is its own refusal, not an empty collect", () => {
  const settled = record({
    purchases: [purchase({ status: "paid", collectedCents: 5000, outstandingCents: 0 })],
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
      purchase({ orderId: "paid", createdAt: "2026-09-02T00:00:00Z", outstandingCents: 0 }),
    ],
  });
  assert.deepEqual(unpaidPurchases(many).map((p) => p.orderId), ["new", "old"]);
});
