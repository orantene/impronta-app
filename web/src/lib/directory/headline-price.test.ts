import assert from "node:assert/strict";
import { test } from "node:test";

import { pickHeadlinePrice, type CatalogPriceRow } from "./headline-price";

const row = (
  amountCents: number,
  priceType: string,
  isFeatured = false,
  currency = "USD",
): CatalogPriceRow => ({ amountCents, currency, priceType, isFeatured });

/** More's real live catalog at the time the bug was found. */
const MORE = [
  row(8000, "per_contact"), // casting session (30 min)
  row(35000, "half_day"),
  row(50000, "day"), // e-commerce day rate
  row(60000, "day", true), // full-day shoot — FEATURED
];

/** Popi's real live catalog. */
const POPI = [
  row(12000, "hour"), // extra hour — an add-on
  row(40000, "event", true), // DJ set — FEATURED
  row(90000, "flat_package"), // wedding package
];

test("More's card shows her featured day rate, not her casting fee", () => {
  // Regression: this used to render "From $80" — a 30-minute casting session.
  assert.deepEqual(pickHeadlinePrice(MORE), { amountCents: 60000, currency: "USD" });
});

test("Popi's card shows her featured DJ set, not her extra-hour add-on", () => {
  assert.deepEqual(pickHeadlinePrice(POPI), { amountCents: 40000, currency: "USD" });
});

test("with nothing featured, the cheapest BOOKABLE unit wins over add-ons", () => {
  const noFeatured = MORE.map((r) => ({ ...r, isFeatured: false }));
  // $80 casting session is cheaper, but it is not something you book.
  assert.deepEqual(pickHeadlinePrice(noFeatured), {
    amountCents: 35000,
    currency: "USD",
  });
});

test("an all-hourly catalog still shows a price — hourly IS the rate there", () => {
  const hourlyOnly = [row(9000, "hour"), row(15000, "per_person")];
  assert.deepEqual(pickHeadlinePrice(hourlyOnly), {
    amountCents: 9000,
    currency: "USD",
  });
});

test("several featured rows resolve to the cheapest of them", () => {
  const many = [row(70000, "day", true), row(45000, "event", true), row(1000, "hour")];
  assert.equal(pickHeadlinePrice(many)?.amountCents, 45000);
});

test("currency comes from the winning row — amounts are never converted", () => {
  const mixed = [row(500000, "day", false, "MXN"), row(30000, "day", true, "USD")];
  assert.deepEqual(pickHeadlinePrice(mixed), { amountCents: 30000, currency: "USD" });
});

test("no priced rows → no chip", () => {
  assert.equal(pickHeadlinePrice([]), null);
  assert.equal(pickHeadlinePrice([row(0, "day"), row(-5, "event")]), null);
});
