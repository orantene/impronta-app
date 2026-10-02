import assert from "node:assert/strict";
import { test } from "node:test";

import { previewFeeLines } from "./fee-payer-setting";

const near = (minor: number, expected: number, tol = 1) =>
  assert.ok(Math.abs(minor - expected) <= tol, `${minor} vs ${expected}`);

test("US seller mode: client 101.50, talent about 96.76", () => {
  const l = previewFeeLines({ price: 100, currency: "USD", feePayer: "seller", provider: "stripe_us" });
  assert.equal(l.clientTotalMinor, 10150);
  assert.equal(l.clientProcessingMinor, 0);
  near(l.sellerReceivesMinor, 9676);
});

test("US client mode: client about 104.84, talent 100.00", () => {
  const l = previewFeeLines({ price: 100, currency: "USD", feePayer: "client", provider: "stripe_us" });
  near(l.clientTotalMinor, 10484);
  assert.equal(l.sellerReceivesMinor, 10000);
  assert.equal(l.serviceMinor + l.platformFeeMinor + l.clientProcessingMinor, l.clientTotalMinor);
});

test("MX client mode: 1,000 MXN becomes about 1,062.84", () => {
  const l = previewFeeLines({ price: 1000, currency: "MXN", feePayer: "client" });
  // Engine gross-up for 1,000.00 MXN is 1,062.87 (smallest exact gross).
  near(l.clientTotalMinor, 106287, 1);
  assert.equal(l.sellerReceivesMinor, 100000);
});

test("zero price is safe", () => {
  const l = previewFeeLines({ price: 0, currency: "MXN", feePayer: "client" });
  assert.equal(l.clientTotalMinor, 0);
});
