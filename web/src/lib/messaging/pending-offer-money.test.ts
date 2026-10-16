import assert from "node:assert/strict";
import test from "node:test";

import { pendingOfferMoney } from "./pending-offer-money";

test("TUL-957: a sent 300 MXN offer shows as 300 owed, 0 paid", () => {
  assert.deepEqual(pendingOfferMoney(300, "mxn"), { totalCents: 30000, paidCents: 0, balanceCents: 30000, currency: "MXN" });
});

test("TUL-957: no amount, no line", () => {
  assert.equal(pendingOfferMoney(0, "MXN"), null);
  assert.equal(pendingOfferMoney(Number.NaN, "MXN"), null);
});
