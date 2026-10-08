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

test("from pricing says Desde / From", () => {
  const item = { ...base, priceDisplay: "from", amountCents: 50000 } as never;
  assert.match(catalogBarPriceLabel(item, "es"), /^Desde .*500/);
  assert.match(catalogBarPriceLabel(item, "en"), /^From .*500/);
});

test("exact pricing is just the money", () => {
  const item = { ...base, priceDisplay: "exact", amountCents: 50000 } as never;
  const label = catalogBarPriceLabel(item, "es");
  assert.match(label, /500/);
  assert.doesNotMatch(label, /Desde|cotizar/);
});
