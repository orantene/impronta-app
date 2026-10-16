import test from "node:test";
import assert from "node:assert/strict";

import { profilePriceCurrency } from "./profile-price-currency";

test("TUL-707: footer currency is the talent's own, not the visitor's", () => {
  assert.equal(profilePriceCurrency([{ currency: "mxn", amountCents: 70000 }]), "MXN");
  assert.equal(profilePriceCurrency([{ currency: "USD", amountCents: null }, { currency: "EUR", amountCents: 5 }]), "EUR");
  assert.equal(profilePriceCurrency([]), null);
});
