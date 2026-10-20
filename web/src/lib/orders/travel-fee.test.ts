/**
 * E5 (TUL-1270 M2): the travel fee a talent sets in Defaults was saved and never
 * reached a guest. The Defaults copy promises "added to home visits and paid on
 * the day", so the rule is: once per visit, only when the service happens at the
 * client's place, never part of the online charge.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { travelFeeOnDayCents } from "./travel-fee";
import { cardFeeCopy, cardFeeSummary } from "./checkout-quote-display";
import { CatalogWhoSummary } from "@/components/public-booking/catalog-who-summary";

test("a home visit carries the talent's travel fee, once per visit", () => {
  assert.equal(travelFeeOnDayCents({ where: ["client"], sellingDefaults: { travelFeeCents: 15000 } }), 15000);
  assert.equal(travelFeeOnDayCents({ where: ["studio", "client"], sellingDefaults: { travelFeeCents: 15000 } }), 15000);
});

test("no travel fee at the studio, remote, with no fee set, or with a malformed fee", () => {
  for (const where of [["studio"], ["remote"], ["agreed"], []] as const) {
    assert.equal(travelFeeOnDayCents({ where, sellingDefaults: { travelFeeCents: 15000 } }), 0);
  }
  for (const travelFeeCents of [null, undefined, 0, -100, 150.5, "15000", Number.NaN]) {
    assert.equal(travelFeeOnDayCents({ where: ["client"], sellingDefaults: { travelFeeCents } }), 0);
  }
  assert.equal(travelFeeOnDayCents({ where: ["client"], sellingDefaults: null }), 0);
});

test("the quote summary shows a travel-only fee and never adds it to pay now", () => {
  const s = cardFeeSummary({ principalCents: 50000, collectCents: 50000, cardFeeCents: 0, currency: "MXN", travelFeeOnDayCents: 15000 });
  assert.ok(s);
  assert.equal(s?.feeCents, 0);
  assert.equal(s?.payNowCents, 50000, "the travel fee is paid on the day, not online");
  assert.equal(s?.travelFeeOnDayCents, 15000);
  assert.equal(cardFeeSummary({ principalCents: 50000, collectCents: 50000, cardFeeCents: 0, currency: "MXN" }), null);
});

test("the who-step recap shows the travel fee line in en and es, without a card fee line", () => {
  const day = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  const base = { service: "Manicure", day, time: "10:00", tz: null, total: "$500.00" };
  const fee = { feeLabel: null, payNowLabel: null, travelFeeLabel: "$150.00" };
  const en = renderToStaticMarkup(React.createElement(CatalogWhoSummary, { ...base, es: false, cardFee: fee }));
  assert.match(en, /data-catalog-travel-fee/);
  assert.match(en, /Travel fee, paid on the day[\s\S]*\$150\.00/);
  assert.doesNotMatch(en, /data-catalog-card-fee/);
  assert.doesNotMatch(en, /data-catalog-pay-now/);
  const es = renderToStaticMarkup(React.createElement(CatalogWhoSummary, { ...base, es: true, cardFee: fee }));
  assert.match(es, /Traslado, se paga el día de la cita/);
  for (const v of [cardFeeCopy(false).travelOnDay, cardFeeCopy(true).travelOnDay]) assert.doesNotMatch(v, /—/);
});
