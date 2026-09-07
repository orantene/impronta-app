/**
 * The floors are not proportional, and that is the whole point.
 *
 * A check that reasons "about half a dollar" and converts would pass an MXN 5
 * charge, which Stripe refuses: the peso floor is MXN 10, twenty times the USD
 * 0.50 one. These tests pin the shape of the mistake, not just the values.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkChargeMinimum,
  chargeMinimumMinor,
  SUPPORTED_MINIMUM_CURRENCIES,
} from "./charge-minimums";

test("the peso floor is TWENTY TIMES the dollar floor, not near it", () => {
  // If someone ever 'simplifies' this table to one number, this fails first.
  assert.equal(chargeMinimumMinor("USD"), 50);
  assert.equal(chargeMinimumMinor("MXN"), 1000);
  assert.equal(chargeMinimumMinor("MXN")! / chargeMinimumMinor("USD")!, 20);
});

test("a 5-peso charge is REFUSED — the case that would have reached Stripe", () => {
  const v = checkChargeMinimum(500, "MXN"); // MXN 5.00
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.reason, "below_minimum");
  assert.equal(v.minimumMinor, 1000);
});

test("exactly at the floor is allowed; one minor unit under is not", () => {
  assert.equal(checkChargeMinimum(1000, "MXN").ok, true);
  assert.equal(checkChargeMinimum(999, "MXN").ok, false);
  assert.equal(checkChargeMinimum(50, "USD").ok, true);
  assert.equal(checkChargeMinimum(49, "USD").ok, false);
});

test("zero-decimal currencies are not multiplied by 100", () => {
  // JPY 50 means amount=50. Treating it as two-decimal would demand JPY 5000 --
  // a 100x over-refusal that looks like a working guard.
  assert.equal(chargeMinimumMinor("JPY"), 50);
  assert.equal(checkChargeMinimum(50, "JPY").ok, true);
  assert.equal(checkChargeMinimum(49, "JPY").ok, false);
});

test("GBP is 0.30, not 0.50 — the table is transcribed, not assumed", () => {
  assert.equal(chargeMinimumMinor("GBP"), 30);
  assert.equal(checkChargeMinimum(30, "GBP").ok, true);
});

test("an UNKNOWN currency is refused, never waved through", () => {
  // Stripe does not list CLP or PEN. Absence of a known floor is not evidence
  // that the amount clears it, and a wrongly accepted charge fails in front of
  // a buyer who has already decided to pay.
  for (const c of ["CLP", "PEN", "XYZ", ""]) {
    const v = checkChargeMinimum(100_000, c);
    assert.equal(v.ok, false, `${c} must be refused`);
    if (!v.ok && c !== "") assert.equal(v.reason, "unknown_currency");
  }
});

test("case and whitespace do not change the verdict", () => {
  assert.equal(checkChargeMinimum(1000, "mxn").ok, true);
  assert.equal(checkChargeMinimum(1000, " MXN ").ok, true);
  assert.equal(checkChargeMinimum(999, "mxn").ok, false);
});

test("zero and negative are refused as not_positive, distinct from below_minimum", () => {
  // Distinct reasons because they need different messages: 'raise your price'
  // versus 'this is not a charge at all'.
  for (const amt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const v = checkChargeMinimum(amt, "USD");
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.reason, "not_positive", `${amt}`);
  }
});

test("every listed currency has a positive integer floor in MINOR units", () => {
  // Guards a transcription slip: a floor of 0 would silently allow everything,
  // and a fractional one would compare wrongly against integer minor units.
  for (const c of SUPPORTED_MINIMUM_CURRENCIES) {
    const m = chargeMinimumMinor(c)!;
    assert.ok(Number.isInteger(m) && m > 0, `${c} floor is ${m}`);
  }
  assert.ok(SUPPORTED_MINIMUM_CURRENCIES.includes("MXN"));
  assert.ok(SUPPORTED_MINIMUM_CURRENCIES.includes("ARS"));
});
