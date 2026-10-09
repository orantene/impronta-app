import test from "node:test";
import assert from "node:assert/strict";

import { deskRefundAmountDefault, parseDeskRefundAmount } from "./desk-refund-amount";

test("blank amount means the full remaining", () => {
  const r = parseDeskRefundAmount("", "MXN", 15_000);
  assert.deepEqual(r, { ok: true, cents: 15_000, capped: false });
});

test("major units parse to minor units when equal to the max", () => {
  // Remaining exactly 300.00 MXN.
  const r = parseDeskRefundAmount("300", "MXN", 30_000);
  assert.deepEqual(r, { ok: true, cents: 30_000, capped: false });
});

test("a partial under the max is capped", () => {
  // Remaining 1500.00 MXN = 150_000 cents; ask 300.00.
  const r = parseDeskRefundAmount("300", "MXN", 150_000);
  assert.deepEqual(r, { ok: true, cents: 30_000, capped: true });
});

test("over the remaining refuses", () => {
  const r = parseDeskRefundAmount("200", "MXN", 10_000);
  assert.deepEqual(r, { ok: false, reason: "exceeds" });
});

test("zero-decimal currencies have no invented .00", () => {
  assert.equal(deskRefundAmountDefault(1500, "JPY"), "1500");
  const r = parseDeskRefundAmount("300", "JPY", 1500);
  assert.deepEqual(r, { ok: true, cents: 300, capped: true });
});

test("default string for a 100-divisor currency drops trailing .00", () => {
  assert.equal(deskRefundAmountDefault(15_000, "MXN"), "150");
  assert.equal(deskRefundAmountDefault(15_050, "MXN"), "150.50");
});
