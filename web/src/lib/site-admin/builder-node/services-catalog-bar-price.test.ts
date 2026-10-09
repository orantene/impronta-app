import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogBarPriceLabel } from "./services-catalog-bar-price";

const base = { priceType: "fixed", currency: "MXN", variants: [] } as const;

test("quote-priced offering shows the quote label, never $0", () => {
  const item = { ...base, priceDisplay: "quote", amountCents: null } as never;
  assert.equal(catalogBarPriceLabel(item, "es"), "A cotizar");
  assert.equal(catalogBarPriceLabel(item, "en"), "Quote");
});

test("no amount at all reads as a quote", () => {
  const item = { ...base, priceDisplay: "exact", amountCents: null } as never;
  assert.equal(catalogBarPriceLabel(item, "es"), "A cotizar");
});

test("from pricing says lowercase desde / from + CODE", () => {
  const item = { ...base, priceDisplay: "from", amountCents: 50000 } as never;
  assert.match(catalogBarPriceLabel(item, "es"), /^desde .*500.*MXN/);
  assert.match(catalogBarPriceLabel(item, "en"), /^from .*500.*MXN/);
});

test("exact pricing is just the money with CODE", () => {
  const item = { ...base, priceDisplay: "exact", amountCents: 50000 } as never;
  const label = catalogBarPriceLabel(item, "es");
  assert.match(label, /\$500 MXN/);
  assert.doesNotMatch(label, /desde|cotizar|Consultar/i);
});

test("zero amount is Consultar, never $0 MXN", () => {
  const item = { ...base, priceDisplay: "exact", amountCents: 0 } as never;
  assert.equal(catalogBarPriceLabel(item, "es"), "Consultar");
  assert.equal(catalogBarPriceLabel(item, "en"), "Ask");
});
