/**
 * Public catalogue money formatting (TUL-383): one `$700 MXN` shape on / and /en.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMoney, moneyLocale } from "./offerings-money";

const nb = (s: string) => s.replace(/\u00a0/g, " ");

describe("moneyLocale", () => {
  it("resolves a currency to its home market's locale", () => {
    assert.equal(moneyLocale("MXN", "es"), "es-MX");
    assert.equal(moneyLocale("ARS", "es-AR"), "es-AR");
    assert.equal(moneyLocale("EUR", "es"), "es-ES");
  });

  it("is case-insensitive about the currency code", () => {
    assert.equal(moneyLocale("mxn", "es"), "es-MX");
  });

  it("falls back to the bare language for an unmapped currency", () => {
    assert.equal(moneyLocale("JPY", "es"), "es");
    assert.equal(moneyLocale("JPY", "en-GB"), "en");
  });

  it("reads the LANGUAGE from the ui locale, not the region", () => {
    assert.equal(moneyLocale("MXN", "en"), "en-US");
    assert.equal(moneyLocale("MXN", "ES-mx"), "es-MX");
  });
});

describe("formatMoney (TUL-383: one public money format)", () => {
  it("MXN is $amount CODE on both es and en (never bare $ or MX$)", () => {
    assert.equal(nb(formatMoney(70000, "MXN", "es")), "$700 MXN");
    assert.equal(nb(formatMoney(70000, "MXN", "en")), "$700 MXN");
    assert.doesNotMatch(nb(formatMoney(70000, "MXN", "en")), /MX\$/);
  });

  it("drops decimals on whole amounts and keeps them otherwise", () => {
    assert.equal(nb(formatMoney(30000, "MXN", "es")), "$300 MXN");
    assert.equal(nb(formatMoney(30050, "MXN", "es")), "$300.50 MXN");
  });

  it("does not crash on an invalid currency code", () => {
    assert.doesNotThrow(() => formatMoney(1000, "NOTACURRENCY", "es"));
    assert.ok(nb(formatMoney(1000, "NOTACURRENCY", "es")).includes("10"));
  });

  it("treats an empty currency as USD rather than throwing", () => {
    assert.equal(nb(formatMoney(1000, "", "en")), "$10 USD");
  });

  it("formats zero", () => {
    assert.equal(nb(formatMoney(0, "MXN", "es")), "$0 MXN");
  });
});
