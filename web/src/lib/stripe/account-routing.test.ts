import test from "node:test";
import assert from "node:assert/strict";
import { resolveStripeAccountForSeller as r } from "./account-routing";

test("MX non-USDC routes to mx", () => {
  assert.equal(r({ payoutCountry: "MX", payoutRail: "connect_transfer", mxConfigured: true }), "mx");
  assert.equal(r({ payoutCountry: "mx", mxConfigured: true }), "mx");
});
test("USDC stays on us even in MX", () => {
  assert.equal(r({ payoutCountry: "MX", payoutRail: "usdc", mxConfigured: true }), "us");
});
test("non-MX and unknown country route to us", () => {
  assert.equal(r({ payoutCountry: "US", mxConfigured: true }), "us");
  assert.equal(r({ payoutCountry: null, mxConfigured: true }), "us");
});
test("MX key missing falls back to us with a warning", () => {
  const w: string[] = [];
  assert.equal(r({ payoutCountry: "MX", mxConfigured: false, warn: (m) => w.push(m) }), "us");
  assert.equal(w.length, 1);
});
test("MX key missing in production refuses (null) and logs an error", () => {
  const e: string[] = [];
  assert.equal(r({ payoutCountry: "MX", mxConfigured: false, isProduction: true, error: (m) => e.push(m) }), null);
  assert.equal(e.length, 1);
});
test("MX key missing outside production keeps the us fallback", () => {
  const w: string[] = [];
  assert.equal(r({ payoutCountry: "MX", mxConfigured: false, isProduction: false, warn: (m) => w.push(m) }), "us");
  assert.equal(w.length, 1);
});
