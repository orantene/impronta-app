/**
 * TUL-429 (admin Orders): a refunded or cancelled order has no balance owed.
 * Run: node_modules/.bin/tsx --test src/lib/orders/orders-list-refunded-owes-nothing.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { outstandingCents } from "./orders-list";

test("a refunded order (collected 0 because the money went back) owes nothing, not its whole total", () => {
  assert.equal(outstandingCents({ status: "refunded", totalCents: 100000, collectedCents: 0 }), 0);
  assert.equal(outstandingCents({ status: "partially_refunded", totalCents: 100000, collectedCents: 70000 }), 0);
});

test("cancelled and void orders owe nothing", () => {
  for (const status of ["cancelled", "canceled", "void", "voided", " Refunded "]) {
    assert.equal(outstandingCents({ status, totalCents: 100000, collectedCents: 0 }), 0, status);
  }
});

test("unchanged: a pending order owes total minus what was collected, clamped at 0", () => {
  assert.equal(outstandingCents({ status: "pending_payment", totalCents: 100000, collectedCents: 0 }), 100000);
  assert.equal(outstandingCents({ status: "pending_payment", totalCents: 100000, collectedCents: 30000 }), 70000);
  assert.equal(outstandingCents({ status: "paid", totalCents: 100000, collectedCents: 100000 }), 0);
  assert.equal(outstandingCents({ status: "pending_payment", totalCents: 100000, collectedCents: 150000 }), 0);
  assert.equal(outstandingCents({ totalCents: 100000, collectedCents: 0 }), 100000, "callers without a status keep the old math");
});
