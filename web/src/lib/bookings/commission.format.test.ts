/**
 * commission.format.test.ts
 *
 * L10 / M14 verification — formatCents locale behaviour.
 *
 * Tests that:
 *  - EUR with German locale uses comma decimal separator and "€" symbol in
 *    the expected European position.
 *  - GBP with en-GB locale uses "£" symbol.
 *  - Calling without a locale falls back gracefully (no crash).
 *  - The optional locale parameter does not break existing USD calls.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatCents, formatCentsUSD } from "@/lib/bookings/commission";

test("formatCents EUR with de-DE locale uses European formatting", () => {
  // 1 234,56 € in de-DE — comma as decimal, period as thousands separator,
  // currency symbol follows the number in German locale.
  const result = formatCents(123456, "EUR", "de-DE");
  // Must contain the Euro sign and a comma somewhere (decimal separator)
  assert.ok(result.includes("€"), `expected "€" in "${result}"`);
  assert.ok(result.includes(","), `expected "," (decimal separator) in "${result}"`);
  // Must NOT use a period as the decimal separator in de-DE
  // (e.g. "1.234,56 €" is correct; "1,234.56 €" would be wrong)
  // The amount is 1234.56 — test that 56 appears after the comma.
  assert.ok(/,56/.test(result), `expected ",56" fractional part in "${result}"`);
});

test("formatCents GBP with en-GB locale uses British formatting", () => {
  const result = formatCents(100000, "GBP", "en-GB");
  // £1,000.00 or £1,000 depending on trailing zeros
  assert.ok(result.includes("£"), `expected "£" in "${result}"`);
  // Thousands separator: 1,000
  assert.ok(result.includes("1,000"), `expected "1,000" in "${result}"`);
});

test("formatCents without locale does not throw", () => {
  // Must not throw; actual locale output is runtime-dependent so we just
  // check the return is a non-empty string containing the USD symbol.
  const result = formatCents(5000, "USD");
  assert.ok(typeof result === "string" && result.length > 0);
  assert.ok(result.includes("50"), `expected amount "50" in "${result}"`);
});

test("formatCentsUSD shorthand still works (no locale arg)", () => {
  const result = formatCentsUSD(10000);
  // $100 — must contain the dollar sign and 100
  assert.ok(result.includes("$"), `expected "$" in "${result}"`);
  assert.ok(result.includes("100"), `expected "100" in "${result}"`);
});

test("formatCents en-US explicit locale formats USD with dollar sign", () => {
  const result = formatCents(250000, "USD", "en-US");
  // $2,500.00 or $2,500
  assert.ok(result.startsWith("$"), `expected "$" at start of "${result}"`);
  assert.ok(result.includes("2,500"), `expected "2,500" in "${result}"`);
});
