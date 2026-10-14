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

import { derivePricingViewer } from "./pricing-viewer-derive";
import type { PricingViewer } from "./pricing-cta-href";

const APP = "https://app.example.test";
const talent: PricingViewer = { kind: "talent", appUrl: APP, adminWorkspaceSlug: null };
const ws: PricingViewer = { kind: "workspace", appUrl: APP, adminWorkspaceSlug: "acme" };

test("signed-out stays on /start for both ladders and intervals", () => {
  for (const interval of ["month", "year"] as const) {
    assert.equal(
      buildPricingCtaHref({ packageSlug: "talent", tierKey: "pro", interval, viewer: { kind: "anon" } }),
      `/start?plan=talent_pro&interval=${interval}`,
    );
  }
});

test("signed-in talent goes straight to /talent/plan for paid plans", () => {
  assert.equal(
    buildPricingCtaHref({ packageSlug: "talent", tierKey: "max", interval: "year", viewer: talent }),
    `${APP}/talent/plan?plan=talent_portfolio&interval=year`,
  );
  assert.equal(
    buildPricingCtaHref({ packageSlug: "talent", tierKey: "pro", interval: "month", viewer: talent }),
    `${APP}/talent/plan?plan=talent_pro&interval=month`,
  );
});

test("signed-in talent free tier and workspace tiers fall back to /start", () => {
  assert.equal(
    buildPricingCtaHref({ packageSlug: "talent", tierKey: "free", interval: "year", viewer: talent }),
    "/start?plan=talent_basic&interval=year",
  );
  assert.equal(
    buildPricingCtaHref({ packageSlug: "workspace", tierKey: "agency", interval: "month", viewer: talent }),
    "/start?plan=agency&interval=month",
  );
});

test("workspace admin goes to the workspace plan page for paid plans only", () => {
  for (const interval of ["month", "year"] as const) {
    assert.equal(
      buildPricingCtaHref({ packageSlug: "workspace", tierKey: "agency", interval, viewer: ws }),
      `${APP}/acme/admin/account?plan=agency&interval=${interval}`,
    );
  }
  assert.equal(
    buildPricingCtaHref({ packageSlug: "workspace", tierKey: "free", interval: "year", viewer: ws }),
    "/start?plan=free&interval=year",
  );
  // A workspace admin who is not a talent keeps /start for talent plans.
  assert.equal(
    buildPricingCtaHref({ packageSlug: "talent", tierKey: "pro", interval: "month", viewer: ws }),
    "/start?plan=talent_pro&interval=month",
  );
});

test("talent who also admins a workspace gets both shortcuts", () => {
  const both: PricingViewer = { kind: "talent", appUrl: APP, adminWorkspaceSlug: "acme" };
  assert.equal(
    buildPricingCtaHref({ packageSlug: "workspace", tierKey: "studio", interval: "month", viewer: both }),
    `${APP}/acme/admin/account?plan=studio&interval=month`,
  );
});

test("derivePricingViewer maps identity to a viewer", () => {
  assert.deepEqual(derivePricingViewer({ appUrl: APP, isTalent: false, workspaces: [] }), { kind: "anon" });
  assert.deepEqual(
    derivePricingViewer({ appUrl: APP, isTalent: false, workspaces: [{ slug: "x", role: "editor" }] }),
    { kind: "anon" },
  );
  assert.deepEqual(
    derivePricingViewer({ appUrl: APP, isTalent: true, workspaces: [] }),
    { kind: "talent", appUrl: APP, adminWorkspaceSlug: null },
  );
  assert.deepEqual(
    derivePricingViewer({ appUrl: APP, isTalent: false, workspaces: [{ slug: "x", role: "viewer" }, { slug: "y", role: "owner" }] }),
    { kind: "workspace", appUrl: APP, adminWorkspaceSlug: "y" },
  );
});
