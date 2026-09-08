import assert from "node:assert/strict";
import { test } from "node:test";

import { instantBookPaymentChoice } from "./instant-book-payment-choice";

test("instant book sends deposit when the offering is a deposit", () => {
  assert.equal(instantBookPaymentChoice(false, "deposit"), "deposit");
  assert.equal(instantBookPaymentChoice(undefined, "deposit"), "deposit");
});

test("instant book keeps pay-in-person as intent, not a deposit", () => {
  assert.equal(instantBookPaymentChoice(true, "deposit"), "in_person");
  assert.equal(instantBookPaymentChoice(true, "full"), "in_person");
});

test("instant book charges full when the offering is not a deposit", () => {
  assert.equal(instantBookPaymentChoice(false, "full"), "full");
  assert.equal(instantBookPaymentChoice(false, "free"), "full");
  assert.equal(instantBookPaymentChoice(false, null), "full");
});
