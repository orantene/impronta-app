/**
 * TUL-551 / TUL-533 (GRK-064): the purchase panel never paints "$0 MXN" for a service whose own
 * price is zero, but a total that is zero because a promo covered it is still a price.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogPurchaseTotalLabel } from "./catalog-booking-price";

const money = (cents: number) => `${(cents / 100).toFixed(0)} MXN`;

describe("catalogPurchaseTotalLabel", () => {
  it("a normal total is formatted as money", () => {
    assert.equal(catalogPurchaseTotalLabel(55000, 55000, "es", money), "550 MXN");
    assert.equal(catalogPurchaseTotalLabel(55000, 55000, "en", money), "550 MXN");
  });

  it("a zero list price reads Consultar on ES and Ask on EN, never $0", () => {
    assert.equal(catalogPurchaseTotalLabel(0, 0, "es", money), "Consultar");
    assert.equal(catalogPurchaseTotalLabel(0, 0, "en", money), "Ask");
    assert.equal(catalogPurchaseTotalLabel(0, 0, "es-MX", money), "Consultar");
  });

  it("a total that is zero only because a promo covered the order stays a price", () => {
    assert.equal(catalogPurchaseTotalLabel(55000, 0, "es", money), "0 MXN");
    assert.equal(catalogPurchaseTotalLabel(55000, 0, "en", money), "0 MXN");
  });

  it("no total yet shows nothing", () => {
    assert.equal(catalogPurchaseTotalLabel(null, null, "es", money), "");
    assert.equal(catalogPurchaseTotalLabel(55000, null, "en", money), "");
  });

  it("an unknown list price with a total is formatted as money", () => {
    assert.equal(catalogPurchaseTotalLabel(null, 12000, "en", money), "120 MXN");
  });
});
