import assert from "node:assert/strict";
import { test } from "node:test";

import { pickReceipt, receiptBelongsTo } from "./receipt-shape";

const good = { order: { tenantId: "t1", totalCents: 2000 }, sessions: [], admissions: [] };

test("an unknown code refuses in every shape the function has ever returned", () => {
  assert.equal(pickReceipt([]), null, "SETOF zero rows (…806) — the shape that threw on 2026-09-05");
  assert.equal(pickReceipt([null]), null, "a set of one NULL row");
  assert.equal(pickReceipt(null), null, "scalar jsonb NULL (…805)");
  assert.equal(pickReceipt(undefined), null);
  assert.equal(pickReceipt({}), null, "an object without an order");
  assert.equal(pickReceipt({ order: null }), null);
  assert.equal(pickReceipt({ order: { tenantId: 7 } }), null, "a tenant id that is not a string");
  assert.equal(pickReceipt("NOTACODE"), null);
});

test("a receipt is accepted as a set of one and as a scalar", () => {
  assert.equal(pickReceipt([good])?.order.tenantId, "t1");
  assert.equal(pickReceipt(good)?.order.tenantId, "t1");
});

test("a valid code from another tenant is exactly an unknown code", () => {
  const r = pickReceipt(good)!;
  assert.equal(receiptBelongsTo(r, "t1"), true);
  assert.equal(receiptBelongsTo(r, "t2"), false);
});

test("nothing on the refusal path can throw", () => {
  for (const raw of [[], [null], null, undefined, {}, { order: {} }, 0, "", [[]], [{ order: "x" }]]) {
    assert.doesNotThrow(() => pickReceipt(raw));
  }
});
