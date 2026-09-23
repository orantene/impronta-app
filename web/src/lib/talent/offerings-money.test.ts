/**
 * Region-aware money formatting.
 *
 * The bug this module exists for: `Intl.NumberFormat("es", {currency:"MXN"})`
 * prints "300 MXN", because collapsing the locale to a bare language throws
 * away the region, and the region is what decides whether a currency draws as
 * a symbol or a code. A Mexican beauty studio's menu should read "$300".
 *
 * Intl output varies by ICU version, so these assert the PROPERTY that matters
 * (a symbol, not a three-letter code; no stray decimals on whole amounts)
 * rather than pinning exact strings, which would make the suite fail on a Node
 * upgrade for no real reason. The one exception is the separator-free check.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMoney, moneyLocale } from "./offerings-money";

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
    // i.e. exactly today's behaviour — this module must not change how any
    // currency it does not know about is printed.
    assert.equal(moneyLocale("JPY", "es"), "es");
    assert.equal(moneyLocale("JPY", "en-GB"), "en");
  });

  it("reads the LANGUAGE from the ui locale, not the region", () => {
    assert.equal(moneyLocale("MXN", "en"), "en-US");
    assert.equal(moneyLocale("MXN", "ES-mx"), "es-MX");
  });
});

describe("formatMoney", () => {
  it("prints MXN with a symbol rather than a currency code", () => {
    const out = formatMoney(30000, "MXN", "es");
    assert.ok((out).includes("$"));
    assert.ok(!(out).includes("MXN"));
  });

  it("drops decimals on whole amounts and keeps them otherwise", () => {
    assert.ok(!(/[.,]00/).test(formatMoney(30000, "MXN", "es")));
    assert.ok((/50/).test(formatMoney(30050, "MXN", "es")));
  });

  it("does not crash on an invalid currency code", () => {
    // Intl throws on a malformed code; a catalogue row with bad data must
    // still render a price rather than take the whole page down.
    assert.doesNotThrow(() => formatMoney(1000, "NOTACURRENCY", "es"));
    assert.ok((formatMoney(1000, "NOTACURRENCY", "es")).includes("10"));
  });

  it("treats an empty currency as USD rather than throwing", () => {
    assert.ok((formatMoney(1000, "", "en")).includes("$"));
  });

  it("formats zero", () => {
    assert.ok((formatMoney(0, "MXN", "es")).includes("0"));
  });
});
