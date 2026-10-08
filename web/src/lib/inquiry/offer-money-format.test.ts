/**
 * TUL-281: the ONE money display for the messages sheets. `formatOfferMoney`
 * (symbol + ISO code, e.g. "$850 MXN") on MXN, USD, zero, negative and
 * unknown-currency records, plus the helpers the string-fed view-models use.
 * Run: node --require ./scripts/register-server-only-test.cjs --import tsx --test src/lib/inquiry/offer-money-format.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLATFORM_FALLBACK_CURRENCY,
  amountFromMoneyText,
  currencyFromMoneyText,
  formatOfferMoney,
  moneySymbol,
} from "./offer-currency";

describe("formatOfferMoney", () => {
  it("MXN reads '$850 MXN', never a bare '$'", () => {
    assert.equal(formatOfferMoney(850, "MXN"), "$850 MXN");
    assert.equal(formatOfferMoney(850, "mxn", { maximumFractionDigits: 0 }), "$850 MXN");
  });
  it("USD reads '$850 USD' so the two dollars are told apart", () => {
    assert.equal(formatOfferMoney(850, "USD"), "$850 USD");
    assert.equal(formatOfferMoney(1200, "USD", { maximumFractionDigits: 0 }), "$1,200 USD");
  });
  it("keeps cents when the amount has them, drops them when asked", () => {
    assert.equal(formatOfferMoney(850.5, "MXN"), "$850.50 MXN");
    assert.equal(formatOfferMoney(850.5, "MXN", { maximumFractionDigits: 0 }), "$851 MXN");
  });
  it("zero still carries the code", () => {
    assert.equal(formatOfferMoney(0, "MXN"), "$0 MXN");
  });
  it("negative puts the sign before the symbol (commission rows)", () => {
    assert.equal(formatOfferMoney(-120, "MXN"), "-$120 MXN");
    assert.equal(formatOfferMoney(-0, "MXN"), "$0 MXN");
    // The sheets also render deductions as an en dash plus a positive amount.
    assert.equal(`–${formatOfferMoney(120, "MXN")}`, "–$120 MXN");
  });
  it("other currencies keep their own symbol plus the code", () => {
    assert.equal(formatOfferMoney(700, "EUR"), "€700 EUR");
    assert.equal(formatOfferMoney(700, "GBP"), "£700 GBP");
  });
  it("unknown, blank or junk currency falls back to the platform currency, code shown", () => {
    for (const bad of [null, undefined, "", "pesos", "12", "US"]) {
      assert.equal(formatOfferMoney(850, bad), `$850 ${PLATFORM_FALLBACK_CURRENCY}`, String(bad));
    }
  });
  it("a well-formed but unregistered code never throws and keeps the code", () => {
    const out = formatOfferMoney(850, "ZZZ");
    assert.match(out, /850/);
    assert.ok(out.endsWith("ZZZ"), out);
  });
  it("es locale keeps the code too", () => {
    assert.ok(formatOfferMoney(850, "MXN", { locale: "es" }).endsWith("MXN"));
  });
});

describe("moneySymbol", () => {
  it("is the glyph only, from the record's currency", () => {
    assert.equal(moneySymbol("MXN"), "$");
    assert.equal(moneySymbol("EUR"), "€");
    assert.equal(moneySymbol("GBP"), "£");
    assert.equal(moneySymbol("BRL"), "R$");
  });
  it("unknown currency uses the platform glyph", () => {
    assert.equal(moneySymbol(null), "$");
    assert.equal(moneySymbol("nope"), "$");
  });
});

describe("string-fed view-models", () => {
  it("currencyFromMoneyText reads a trailing ISO code first", () => {
    assert.equal(currencyFromMoneyText("$850 MXN"), "MXN");
    assert.equal(currencyFromMoneyText("€1,200"), "EUR");
    assert.equal(currencyFromMoneyText("£300"), "GBP");
  });
  it("a bare '$' is ambiguous: null, so the caller falls back to the platform currency", () => {
    assert.equal(currencyFromMoneyText("$850"), null);
    assert.equal(currencyFromMoneyText(""), null);
    assert.equal(currencyFromMoneyText(undefined), null);
  });
  it("amountFromMoneyText strips symbols and the code", () => {
    assert.equal(amountFromMoneyText("$1,250 MXN"), 1250);
    assert.ok(Number.isNaN(amountFromMoneyText("—")));
  });
  it("round trip: an MXN take-home keeps MXN in the derived breakdown rows", () => {
    const takeHome = formatOfferMoney(800, "MXN", { maximumFractionDigits: 0 });
    const gross = amountFromMoneyText(takeHome) / 0.8;
    assert.equal(
      formatOfferMoney(gross, currencyFromMoneyText(takeHome), { maximumFractionDigits: 0 }),
      "$1,000 MXN",
    );
  });
});
