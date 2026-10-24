import assert from "node:assert/strict";
import { test } from "node:test";

import { customerDiscountLabel, formatDiscountPercent } from "./customer-discount-label";

test("percent has no trailing .0 and localizes", () => {
  assert.equal(formatDiscountPercent(20), "20");
  assert.equal(formatDiscountPercent(12.5), "12.5");
  assert.equal(customerDiscountLabel({ kind: "percent", value: 20 }), "20% off");
  assert.equal(customerDiscountLabel({ kind: "percent", value: 20, locale: "es-MX" }), "20% de descuento");
});

test("fixed amounts and the generic fallback never expose an internal name", () => {
  assert.match(customerDiscountLabel({ kind: "fixed", value: 10, currency: "usd", locale: "es" }), /^10\s+US\$ de descuento$/u);
  assert.equal(customerDiscountLabel({ kind: "fixed", value: 10, currency: "usd" }), "$10 off");
  assert.equal(customerDiscountLabel({ kind: "percent", value: 100 }), "Discount");
  assert.equal(customerDiscountLabel({ kind: "free_months", value: 3, locale: "es" }), "Descuento");
});
