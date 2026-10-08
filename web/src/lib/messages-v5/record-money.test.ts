/**
 * TUL-281 follow-up: the messages-v5 amount chain. A record's own currency
 * code shows next to the amount ("$850 MXN"); a record with no usable
 * currency falls back to the platform currency WITH the code shown.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRecordMoney, recordCurrency } from "./record-money";

test("MXN renders as '$850 MXN', USD as '$850 USD' (code always shown)", () => {
  assert.equal(formatRecordMoney(85000, "MXN"), "$850 MXN");
  assert.equal(formatRecordMoney(85000, "USD"), "$850 USD");
  assert.equal(formatRecordMoney(85000, "mxn"), "$850 MXN");
});

test("cents survive; negatives lead with the sign; zero is '$0 MXN'", () => {
  assert.equal(formatRecordMoney(4850, "MXN"), "$48.50 MXN");
  assert.equal(formatRecordMoney(-12000, "MXN"), "-$120 MXN");
  assert.equal(formatRecordMoney(0, "MXN"), "$0 MXN");
});

test("zero-decimal currencies are not divided by 100", () => {
  assert.match(formatRecordMoney(5000, "JPY"), /5,000.*JPY$/);
});

test("unknown / blank / junk / missing currency falls back to the platform currency with the code shown", () => {
  for (const bad of [null, undefined, "", "  ", "??", "pesos", "12"]) {
    assert.equal(recordCurrency(bad), "USD", String(bad));
    assert.equal(formatRecordMoney(85000, bad), "$850 USD", String(bad));
  }
});

test("a non-finite amount shows zero rather than NaN", () => {
  assert.equal(formatRecordMoney(Number.NaN, "MXN"), "$0 MXN");
});
