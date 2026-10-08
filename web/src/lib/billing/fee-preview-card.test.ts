/**
 * Money-page fee card (QA D5-01): the preview numbers for a 100.00 booking,
 * and that every figure carries its currency code in the dashboard format.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PROCESSOR_FEE_RATES } from "./commission";
import {
  formatFeeCardMoney,
  formatTakePercent,
  previewFeeLines,
} from "./fee-payer-setting";

const base = { takeBps: 150, takeFloorCents: 0 } as const;

test("USD 100.00, talent pays (Yo la pago): client 101.50, talent nets 96.76", () => {
  const l = previewFeeLines({ ...base, price: 100, currency: "USD", feePayer: "seller", processorFeeRates: DEFAULT_PROCESSOR_FEE_RATES.default });
  assert.equal(l.clientTotalMinor, 10150);
  assert.equal(l.platformFeeMinor, 150);
  assert.equal(l.sellerReceivesMinor, 9676);
});

test("USD 100.00, client pays: client total includes service fee and card fee, talent nets 100", () => {
  const l = previewFeeLines({ ...base, price: 100, currency: "USD", feePayer: "client", processorFeeRates: DEFAULT_PROCESSOR_FEE_RATES.default });
  assert.equal(l.sellerReceivesMinor, 10000);
  assert.ok(l.clientTotalMinor > 10150);
  assert.equal(l.clientTotalMinor, 10000 + l.platformFeeMinor + l.clientProcessingMinor);
});

test("MXN 1000.00: both payer settings keep the same invariants", () => {
  const rates = DEFAULT_PROCESSOR_FEE_RATES.mxn;
  const s = previewFeeLines({ ...base, price: 1000, currency: "MXN", feePayer: "seller", processorFeeRates: rates });
  const c = previewFeeLines({ ...base, price: 1000, currency: "MXN", feePayer: "client", processorFeeRates: rates });
  assert.equal(s.clientTotalMinor, 101500);
  assert.equal(s.platformFeeMinor, 1500);
  assert.equal(c.sellerReceivesMinor, 100000);
  assert.ok(s.sellerReceivesMinor < 100000);
});

test("card money always carries the currency code", () => {
  assert.equal(formatFeeCardMoney(10000, "USD"), "$100 USD");
  assert.equal(formatFeeCardMoney(10150, "usd"), "$101.50 USD");
  assert.equal(formatFeeCardMoney(9676, "USD"), "$96.76 USD");
  assert.equal(formatFeeCardMoney(100000, "MXN"), "$1,000 MXN");
  for (const m of [0, 10000, 101500]) {
    for (const cur of ["USD", "MXN"]) assert.match(formatFeeCardMoney(m, cur), new RegExp(` ${cur}$`));
  }
});

test("zero renders one way, in both locales", () => {
  assert.equal(formatFeeCardMoney(0, "USD"), "$0 USD");
  assert.equal(formatFeeCardMoney(0, "USD", "es"), "$0 USD");
  assert.equal(formatFeeCardMoney(0, "MXN", "es"), "$0 MXN");
  assert.doesNotMatch(formatFeeCardMoney(0, "USD"), /^USD/);
});

test("service fee percent label", () => {
  assert.equal(formatTakePercent(150), "1.5%");
  assert.equal(formatTakePercent(600), "6%");
});
