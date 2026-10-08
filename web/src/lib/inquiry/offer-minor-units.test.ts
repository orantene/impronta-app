/**
 * Run: node --require ./scripts/register-server-only-test.cjs --import tsx --test src/lib/inquiry/offer-minor-units.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OfferCurrencyUnreadableError, displayMinorDivisor, majorToMinor, majorToMinorForDisplay, tryMajorToMinor } from "./offer-minor-units";

describe("majorToMinor", () => {
  it("USD and MXN keep divisor 100 (byte-identical to Math.round(x * 100))", () => {
    assert.equal(majorToMinor(18, "USD"), 1800);
    assert.equal(majorToMinor(850, "MXN"), 85000);
    assert.equal(majorToMinor(18, "usd"), 1800);
    assert.equal(majorToMinor(18, " mxn "), 1800);
    for (const v of [0, 0.01, 10.005, 1.005, 19.99, 1234567.89, 0.1 + 0.2]) {
      assert.equal(majorToMinor(v, "USD"), Math.round(v * 100));
      assert.equal(majorToMinor(v, "MXN"), Math.round(v * 100));
    }
  });
  it("zero-decimal currencies use divisor 1", () => {
    assert.equal(majorToMinor(1000, "JPY"), 1000);
    assert.equal(majorToMinor(50000, "KRW"), 50000);
    assert.equal(majorToMinor(12345, "clp"), 12345);
    assert.equal(majorToMinor(99, "VND"), 99);
  });
  it("unreadable currency is refused", () => {
    for (const c of [null, undefined, "", "US", "USDX", "12$"]) {
      assert.throws(() => majorToMinor(10, c), OfferCurrencyUnreadableError);
      assert.equal(tryMajorToMinor(10, c), null);
    }
  });
});

describe("display-side helpers", () => {
  it("USD, MXN, absent and unreadable currencies keep divisor 100", () => {
    for (const c of ["USD", "MXN", null, undefined, "", "bad"]) {
      assert.equal(displayMinorDivisor(c), 100);
      assert.equal(majorToMinorForDisplay(10.005, c), Math.round(10.005 * 100));
    }
  });
  it("zero-decimal currencies use divisor 1", () => {
    assert.equal(majorToMinorForDisplay(1000, "JPY"), 1000);
    assert.equal(displayMinorDivisor("krw"), 1);
  });
});
