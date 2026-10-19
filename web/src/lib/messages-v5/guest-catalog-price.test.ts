/**
 * TUL-1272 item 10: the Concierge dock prices each row in the row's OWN currency
 * (an MXN service was shown as US$ because the dock hardcoded "USD").
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { guestRowPriceLabel } from "./guest-catalog-price";

test("a USD row and an MXN row each format in their own currency", () => {
  const usd = guestRowPriceLabel({ amountCents: 15_000, currency: "USD" });
  const mxn = guestRowPriceLabel({ amountCents: 150_000, currency: "MXN" });
  assert.match(usd ?? "", /150/);
  assert.match(usd ?? "", /USD/);
  assert.match(mxn ?? "", /1,500/);
  assert.match(mxn ?? "", /MXN/);
  assert.notEqual(usd, mxn);
});

test("a row with no currency stays USD (older rows), a lowercase code is normalised", () => {
  assert.match(guestRowPriceLabel({ amountCents: 15_000, currency: null }) ?? "", /USD/);
  assert.match(guestRowPriceLabel({ amountCents: 15_000 }) ?? "", /USD/);
  assert.match(guestRowPriceLabel({ amountCents: 150_000, currency: "mxn" }) ?? "", /MXN/);
});

test("no price shows nothing", () => {
  assert.equal(guestRowPriceLabel({ amountCents: null, currency: "MXN" }), null);
  assert.equal(guestRowPriceLabel({ amountCents: 0, currency: "MXN" }), null);
});
