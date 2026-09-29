import test from "node:test";
import assert from "node:assert/strict";

import { listPrice, listPriceState } from "./services-list-price";

test("quoted item says Quoted even with an amount", () => {
  const item = { amountCents: 60000, priceDisplay: "quote" as const, currency: "MXN" };
  assert.equal(listPriceState(item), "quote");
  assert.equal(listPrice(item, "Quoted", "No price yet"), "Quoted");
});

test("missing amount says No price yet", () => {
  const item = { amountCents: null, priceDisplay: "exact" as const, currency: "MXN" };
  assert.equal(listPriceState(item), "unset");
  assert.equal(listPrice(item, "Quoted", "No price yet"), "No price yet");
});

test("amount renders with currency", () => {
  const item = { amountCents: 60000, priceDisplay: "exact" as const, currency: "MXN" };
  assert.equal(listPriceState(item), "amount");
  assert.equal(listPrice(item, "Quoted", "No price yet"), "$600 MXN");
});
