import assert from "node:assert/strict";
import test from "node:test";

import { cashierMayCancelSale } from "./cancel-eligibility";

test("a cashier may cancel an unpaid draft with no payment rows", () => {
  assert.equal(cashierMayCancelSale({ status: "draft", payments: [] }), true);
});

test("dead payment attempts do not block cancelling a draft", () => {
  assert.equal(cashierMayCancelSale({ status: "draft", payments: [{ status: "failed" }, { status: "expired" }] }), true);
});

test("any paid, partial, pending or unknown payment sends the cancel to a manager", () => {
  for (const status of ["paid", "partially_paid", "pending", "requested", "processing", "refunded", "something_new", null]) {
    assert.equal(cashierMayCancelSale({ status: "draft", payments: [{ status }] }), false, String(status));
  }
});

test("only a draft qualifies: pending_payment (reservation in flight), paid and cancelled do not", () => {
  for (const status of ["pending_payment", "paid", "fulfilled", "cancelled", "refunded", null, undefined]) {
    assert.equal(cashierMayCancelSale({ status, payments: [] }), false, String(status));
  }
});
