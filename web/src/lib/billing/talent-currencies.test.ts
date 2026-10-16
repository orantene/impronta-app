import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENCY_LABELS,
  DEFAULT_CURRENCY_OPTIONS,
  TALENT_CURRENCY_OPTIONS,
  TALENT_LOCAL_CURRENCY_OPTIONS,
  isTalentCurrency,
} from "./currencies";
import { LANE_CURRENCIES } from "../payments/seller-currency-guard";

// TUL-654 option (a): the approved list exists, but only MXN/USD are offered until checkout can settle the rest.
test("by default a talent prices in MXN or USD only", () => {
  assert.deepEqual([...TALENT_CURRENCY_OPTIONS], ["MXN", "USD"]);
  for (const c of ["mxn", " usd "]) assert.equal(isTalentCurrency(c), true, c);
  for (const c of ["EUR", "GBP", "CAD", "CHF", "AUD", "ARS", "COP", "BRL", "", null, 5]) assert.equal(isTalentCurrency(c), false, String(c));
});

test("Oran's approved list is kept ready behind NEXT_PUBLIC_TALENT_LOCAL_CURRENCIES=1", () => {
  assert.deepEqual([...TALENT_LOCAL_CURRENCY_OPTIONS], ["MXN", "USD", "GBP", "CAD", "EUR", "CHF"]);
  for (const c of TALENT_LOCAL_CURRENCY_OPTIONS) assert.ok(CURRENCY_LABELS[c], `${c} has a label`);
});

test("the live charge path is unchanged: lanes still settle only MXN/USD", () => {
  assert.deepEqual([...LANE_CURRENCIES.us], ["USD"]);
  assert.deepEqual([...LANE_CURRENCIES.mx], ["MXN", "USD"]);
});

test("CHF stays out of the shared marketing/platform currency list", () => {
  assert.equal((DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes("CHF"), false);
});
