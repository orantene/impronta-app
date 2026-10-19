import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { cardFeeCopy } from "./checkout-quote-display";
import { CatalogWhoSummary } from "@/components/public-booking/catalog-who-summary";

test("fee copy exists in en and es, with no em dash", () => {
  const en = cardFeeCopy(false);
  const es = cardFeeCopy(true);
  assert.equal(en.fee, "Card processing fee");
  assert.equal(es.fee, "Comisión de tarjeta");
  for (const v of [...Object.values(en), ...Object.values(es)]) assert.doesNotMatch(v, /—/);
  assert.notEqual(en.payNow, es.payNow);
});

test("the who-step summary renders the fee line and the pay-now total only when given", () => {
  const day = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  const base = { es: false, service: "Cut", day, time: "10:00", tz: null, total: "$1,000.00" };
  const without = renderToStaticMarkup(React.createElement(CatalogWhoSummary, base));
  assert.doesNotMatch(without, /data-catalog-card-fee/);
  const withFee = renderToStaticMarkup(
    React.createElement(CatalogWhoSummary, { ...base, cardFee: { feeLabel: "$15.00", payNowLabel: "$1,015.00" } }),
  );
  assert.match(withFee, /data-catalog-card-fee/);
  assert.match(withFee, /Card processing fee/);
  assert.match(withFee, /\$15\.00/);
  assert.match(withFee, /data-catalog-pay-now[\s\S]*\$1,015\.00/);
  const es = renderToStaticMarkup(
    React.createElement(CatalogWhoSummary, { ...base, es: true, cardFee: { feeLabel: "$15.00", payNowLabel: "$1,015.00" } }),
  );
  assert.match(es, /Comisión de tarjeta/);
});
