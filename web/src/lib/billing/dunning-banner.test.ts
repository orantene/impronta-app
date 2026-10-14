import assert from "node:assert/strict";
import test from "node:test";
import { dunningBanner } from "./dunning-banner";

test("past_due shows the banner with the period end", () => {
  assert.deepEqual(dunningBanner({ status: "past_due", currentPeriodEnd: "2026-11-01T00:00:00.000Z" }), {
    accessUntil: "2026-11-01T00:00:00.000Z",
  });
});

test("healthy, trialing, ended or missing subscriptions show nothing", () => {
  for (const status of ["active", "trialing", "cancelled", "incomplete", null]) {
    assert.equal(dunningBanner({ status, currentPeriodEnd: null }), null, String(status));
  }
  assert.equal(dunningBanner(null), null);
  assert.equal(dunningBanner(undefined), null);
});
