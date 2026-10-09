import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDomainPriceDisplay, localCentsFromUsd } from "./domain-price-display";
import type { UsdRates } from "./usd-equivalent";

const FX: UsdRates = { rateDate: "2026-09-23", perUsd: { MXN: 18.5 } };

test("localCentsFromUsd multiplies USD by units-per-USD", () => {
  // $135.00 USD * 18.5 = 2497.5 MXN → 249750 cents
  assert.equal(localCentsFromUsd(13500, "MXN", FX), 249750);
  assert.equal(localCentsFromUsd(13500, "USD", FX), 13500);
});

test("localCentsFromUsd refuses when FX is missing for a foreign currency", () => {
  assert.equal(localCentsFromUsd(13500, "MXN", null), null);
  assert.equal(localCentsFromUsd(0, "MXN", FX), null);
  assert.equal(localCentsFromUsd(13500, "ARS", FX), null);
});

test("buildDomainPriceDisplay shows talent currency with USD charge note", () => {
  const mxn = buildDomainPriceDisplay({
    usdCents: 13500,
    talentCurrency: "MXN",
    fx: FX,
    locale: "es",
  });
  assert.equal(mxn.converted, true);
  assert.match(mxn.primary.replace(/\u00a0/g, " "), /MXN/);
  assert.match(mxn.usdCharge.replace(/\u00a0/g, " "), /USD/);

  const usd = buildDomainPriceDisplay({
    usdCents: 13500,
    talentCurrency: "USD",
    fx: FX,
    locale: "en",
  });
  assert.equal(usd.converted, false);
  assert.equal(usd.primary, usd.usdCharge);
});

test("buildDomainPriceDisplay falls back to USD when FX is unavailable", () => {
  const d = buildDomainPriceDisplay({
    usdCents: 13500,
    talentCurrency: "MXN",
    fx: null,
    locale: "en",
  });
  assert.equal(d.converted, false);
  assert.equal(d.primary, d.usdCharge);
});
