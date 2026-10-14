import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPricingCtaHref,
  parseBillingInterval,
  planKeyForTier,
} from "./pricing-cta-href";

test("talent tiers map to checkout plan keys", () => {
  assert.equal(planKeyForTier("talent", "pro"), "talent_pro");
  assert.equal(planKeyForTier("talent", "max"), "talent_portfolio");
  assert.equal(planKeyForTier("talent", "free"), "talent_basic");
});

test("workspace hub is the network plan", () => {
  assert.equal(planKeyForTier("workspace", "hub"), "network");
  assert.equal(planKeyForTier("workspace", "studio"), "studio");
});

test("href carries plan and interval to /start", () => {
  assert.equal(
    buildPricingCtaHref({ packageSlug: "talent", tierKey: "max", interval: "year" }),
    "/start?plan=talent_portfolio&interval=year",
  );
  assert.equal(
    buildPricingCtaHref({ packageSlug: "workspace", tierKey: "agency", interval: "month" }),
    "/start?plan=agency&interval=month",
  );
});

test("parseBillingInterval defaults to month for unknown values", () => {
  assert.equal(parseBillingInterval("year"), "year");
  assert.equal(parseBillingInterval("month"), "month");
  assert.equal(parseBillingInterval("weekly"), "month");
  assert.equal(parseBillingInterval(null), "month");
  assert.equal(parseBillingInterval(undefined), "month");
});
