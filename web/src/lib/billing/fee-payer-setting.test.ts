import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLATFORM_TAKE_BPS,
  previewFeeLines,
} from "./fee-payer-setting";

test("US seller mode: client 101.50, talent about 96.76", () => {
  const l = previewFeeLines({ price: 100, currency: "USD", feePayer: "seller", provider: "stripe_us" });
  assert.equal(l.clientTotalMinor, 10150);
  assert.equal(l.clientProcessingMinor, 0);
  assert.equal(l.platformTakeBps, PLATFORM_TAKE_BPS);
  assert.equal(l.sellerReceivesMinor, 9676);
});

test("US client mode: client 104.84, talent 100.00 (exact engine gross)", () => {
  const l = previewFeeLines({ price: 100, currency: "USD", feePayer: "client", provider: "stripe_us" });
  assert.equal(l.clientTotalMinor, 10484);
  assert.equal(l.sellerReceivesMinor, 10000);
  assert.equal(l.serviceMinor + l.platformFeeMinor + l.clientProcessingMinor, l.clientTotalMinor);
});

test("MX client mode: 1,000 MXN becomes exactly 1,062.87", () => {
  const l = previewFeeLines({ price: 1000, currency: "MXN", feePayer: "client" });
  assert.equal(l.clientTotalMinor, 106287);
  assert.equal(l.sellerReceivesMinor, 100000);
});

test("zero price is safe", () => {
  const l = previewFeeLines({ price: 0, currency: "MXN", feePayer: "client" });
  assert.equal(l.clientTotalMinor, 0);
});

test("formatFeeMoney: MXN carries the MX$ prefix, USD stays $", async () => {
  const { formatFeeMoney } = await import("./fee-payer-setting");
  assert.equal(formatFeeMoney(100000, "MXN"), "MX$1,000.00");
  assert.equal(formatFeeMoney(10484, "usd"), "$104.84");
  assert.equal(formatFeeMoney(5000, "EUR"), "50.00 EUR");
});
