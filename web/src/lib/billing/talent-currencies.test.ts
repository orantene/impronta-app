import assert from "node:assert/strict";
import test from "node:test";

import { CURRENCY_LABELS, DEFAULT_CURRENCY_OPTIONS, TALENT_CURRENCY_OPTIONS, isTalentCurrency } from "./currencies";
import { LANE_CURRENCIES } from "../payments/seller-currency-guard";

// TUL-654: Oran's approved list is pricing/display only.
test("talents may price in the approved list, MXN and USD first", () => {
  assert.deepEqual([...TALENT_CURRENCY_OPTIONS], ["MXN", "USD", "GBP", "CAD", "EUR", "CHF"]);
  for (const c of TALENT_CURRENCY_OPTIONS) assert.ok(CURRENCY_LABELS[c], `${c} has a label`);
  for (const c of ["gbp", " eur ", "CHF", "cad"]) assert.equal(isTalentCurrency(c), true, c);
});

test("currencies awaiting a payout route stay refused", () => {
  for (const c of ["AUD", "ARS", "COP", "BRL", "", null, 5]) assert.equal(isTalentCurrency(c), false, String(c));
});

test("the live charge path is unchanged: lanes still settle only MXN/USD", () => {
  assert.deepEqual([...LANE_CURRENCIES.us], ["USD"]);
  assert.deepEqual([...LANE_CURRENCIES.mx], ["MXN", "USD"]);
});

test("CHF stays out of the shared marketing/platform currency list", () => {
  assert.equal((DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes("CHF"), false);
});
