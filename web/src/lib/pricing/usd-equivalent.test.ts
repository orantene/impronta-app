import { test } from "node:test";
import assert from "node:assert/strict";

import { formatUsdEquivalent, needsUsdRates, usdEquivalentCents, usdEquivalentLabel, type UsdRates } from "./usd-equivalent";

const FX: UsdRates = { rateDate: "2026-09-23", perUsd: { MXN: 18.5, EUR: 0.9 } };

test("converts pesos to dollars at units-per-USD", () => {
  // 950 MXN / 18.5 = 51.35 USD
  assert.equal(usdEquivalentCents(95000, "MXN", FX), 5135);
  assert.equal(usdEquivalentCents(95000, "mxn ", FX), 5135);
});

test("prints whole dollars from ten up, cents below", () => {
  assert.equal(formatUsdEquivalent(5135, "en"), "≈ US$51");
  assert.equal(formatUsdEquivalent(270, "en"), "≈ US$2.70");
  assert.equal(formatUsdEquivalent(172973, "en"), "≈ US$1,730");
  assert.equal(usdEquivalentLabel(95000, "MXN", FX, "es"), "≈ US$51");
});

test("refuses instead of guessing", () => {
  assert.equal(usdEquivalentCents(95000, "USD", FX), null, "already dollars");
  assert.equal(usdEquivalentCents(95000, "MXN", null), null, "no rates");
  assert.equal(usdEquivalentCents(95000, "ARS", FX), null, "no rate for that currency");
  assert.equal(usdEquivalentCents(0, "MXN", FX), null, "free");
  assert.equal(usdEquivalentCents(null, "MXN", FX), null, "quote only");
  assert.equal(usdEquivalentCents(95000, "", FX), null, "no currency");
  assert.equal(usdEquivalentCents(95000, "MXN", { rateDate: "x", perUsd: { MXN: 0 } }), null, "zero rate");
  assert.equal(usdEquivalentCents(95000, "MXN", { rateDate: "x", perUsd: { MXN: Number.NaN } }), null, "NaN rate");
  assert.equal(usdEquivalentLabel(95000, "USD", FX, "en"), null);
});

test("a page only needs rates when something is priced outside USD", () => {
  assert.equal(needsUsdRates([{ currency: "USD", amountCents: 100 }]), false);
  assert.equal(needsUsdRates([{ currency: "MXN", amountCents: null }]), false);
  assert.equal(needsUsdRates([{ currency: "USD", amountCents: 100 }, { currency: "MXN", amountCents: 95000 }]), true);
});

test("a talent prices in pesos or dollars, nothing else", async () => {
  const { isTalentCurrency, TALENT_CURRENCY_OPTIONS } = await import("../billing/currencies");
  assert.deepEqual([...TALENT_CURRENCY_OPTIONS], ["MXN", "USD"]);
  assert.equal(isTalentCurrency("MXN"), true);
  assert.equal(isTalentCurrency(" usd "), true);
  assert.equal(isTalentCurrency("EUR"), false);
  assert.equal(isTalentCurrency(""), false);
  assert.equal(isTalentCurrency(null), false);
});
