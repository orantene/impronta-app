/**
 * One money formatter for the whole picker. The cards showed "$1,000.00 MXN"
 * while the checkout sheet and pay button showed "1000,00 MXN" through a
 * second formatter on the bare "es" locale. Both now read `money`, which is
 * `priceParts` joined.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { money, priceParts } from "./ticket-picker-copy";

test("money and priceParts agree, in both locales, for MXN and USD", () => {
  for (const loc of ["en", "es"] as const) {
    for (const cur of ["MXN", "USD", "mxn"]) {
      const p = priceParts(100000, cur, loc, "Free");
      assert.equal(money(100000, cur, loc, "Free"), `${p.amount} ${p.code}`);
      assert.equal(p.code, cur.toUpperCase());
    }
  }
});

test("es formats with the regional grouping (\"$1,000.00 MXN\"), never \"1000,00 MXN\"", () => {
  assert.equal(money(100000, "MXN", "es", "Gratis"), "$1,000.00 MXN");
  assert.equal(money(100000, "MXN", "en", "Free"), "$1,000.00 MXN");
  assert.equal(money(8900, "USD", "es", "Gratis"), "$89.00 USD");
  assert.equal(money(8900, "USD", "en", "Free"), "$89.00 USD");
});

test("zero is the free label with no code", () => {
  assert.equal(money(0, "MXN", "es", "Gratis"), "Gratis");
  assert.deepEqual(priceParts(0, "MXN", "en", "Free"), { amount: "Free", code: null });
});

test("a malformed currency code (Intl throws) still renders a number and the code", () => {
  assert.equal(money(1234, "??", "en", "Free"), "12.34 ??");
});
