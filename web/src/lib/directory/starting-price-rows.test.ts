import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStartingPrices, type OfferingPriceRow } from "./starting-price-rows";

function row(over: Partial<OfferingPriceRow>): OfferingPriceRow {
  return {
    talent_profile_id: "t1",
    amount_cents: 50000,
    currency: "mxn",
    price_type: "flat_package",
    is_featured: false,
    booking_mode: "request",
    duration_minutes: 60,
    kind: "service",
    price_display: "exact",
    visibility: "public",
    ...over,
  };
}

test("D-10a: a talent whose only priced row is on_request gets no price-from, but stays bookable", () => {
  const out = buildStartingPrices([row({ visibility: "on_request" })]);
  assert.equal(out.prices.has("t1"), false);
  assert.equal(out.bookableIds.has("t1"), true);
});

test("D-10a: a mix takes the minimum over non-on_request rows only", () => {
  const out = buildStartingPrices([
    row({ visibility: "on_request", amount_cents: 10000 }),
    row({ amount_cents: 90000 }),
    row({ amount_cents: 70000 }),
  ]);
  assert.equal(out.prices.get("t1")?.amountCents, 70000);
  assert.equal(out.bookableIds.has("t1"), true);
});

test("D-10a: a public priced row still yields its price", () => {
  assert.equal(buildStartingPrices([row({})]).prices.get("t1")?.amountCents, 50000);
});
