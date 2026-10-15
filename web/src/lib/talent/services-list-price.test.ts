import test from "node:test";
import assert from "node:assert/strict";

import { dashboardOfferingPriceLabel, listPrice, listPriceState } from "./services-list-price";

const nb = (s: string) => s.replace(/\u00a0/g, " ");

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

test("dashboardOfferingPriceLabel uses DS-17 format (TUL-336)", () => {
  const base = {
    priceType: "per_contact" as const,
    priceDisplay: "exact" as const,
    amountCents: 12000,
    currency: "MXN",
    visibility: "public" as const,
  };
  assert.match(nb(dashboardOfferingPriceLabel(base, "en")), /\$120 MXN/);
  assert.match(nb(dashboardOfferingPriceLabel({ ...base, priceDisplay: "from" }, "en")), /^from /);
  assert.equal(dashboardOfferingPriceLabel({ ...base, priceDisplay: "quote" }, "en"), "Quote on request");
  assert.equal(dashboardOfferingPriceLabel({ ...base, visibility: "on_request" }, "es"), "Bajo consulta");
  assert.match(nb(dashboardOfferingPriceLabel(base, "es")), /sesión/);
  assert.doesNotMatch(nb(dashboardOfferingPriceLabel(base, "es")), /session/);
});
