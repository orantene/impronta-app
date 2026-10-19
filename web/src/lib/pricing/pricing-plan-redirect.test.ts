import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { pricingPlanRedirect, pricingQueryHasPlan } from "./pricing-plan-redirect";

const APP = "https://app.tulala.digital";
const talent = { kind: "talent", appUrl: APP, adminWorkspaceSlug: null } as const;
const ws = { kind: "workspace", appUrl: APP, adminWorkspaceSlug: "acme" } as const;
const anon = { kind: "anon" } as const;

test("BILL-B: a signed-in talent with a paid talent plan goes to /talent/plan with plan + interval", () => {
  assert.equal(
    pricingPlanRedirect({ plan: "talent_portfolio", interval: "y", viewer: talent }),
    `${APP}/talent/plan?plan=talent_portfolio&interval=year`,
  );
  assert.equal(
    pricingPlanRedirect({ plan: "talent_pro", interval: "month", viewer: talent }),
    `${APP}/talent/plan?plan=talent_pro&interval=month`,
  );
});

test("BILL-B: signed-out visitors keep the plan through the /start front door", () => {
  assert.equal(
    pricingPlanRedirect({ plan: "talent_portfolio", interval: "year", viewer: anon }),
    "/start?plan=talent_portfolio&interval=year",
  );
});

test("BILL-B: a workspace admin with a workspace plan goes to the account page", () => {
  assert.equal(
    pricingPlanRedirect({ plan: "agency", interval: "y", viewer: ws }),
    `${APP}/acme/admin/account?plan=agency&interval=year`,
  );
});

test("BILL-B: no plan, free or junk renders /pricing as before", () => {
  for (const plan of [undefined, null, "", "free", "talent_basic", "network", "nope"]) {
    assert.equal(pricingPlanRedirect({ plan, interval: "year", viewer: talent }), null);
    assert.equal(pricingQueryHasPlan(plan, "year"), false);
  }
  assert.equal(pricingQueryHasPlan("talent_pro", undefined), true);
});

test("BILL-B: the /pricing page honours plan-bearing requests through the redirect helper", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(marketing)/pricing/page.tsx"), "utf8");
  assert.match(src, /plan\?: string/);
  assert.match(src, /pricingQueryHasPlan\(resolved\.plan, resolved\.interval\)/);
  assert.match(src, /pricingPlanRedirect\(/);
  assert.match(src, /redirect\(/);
});

test("BILL-B follow-up: the paywall source (from) survives the /pricing redirect; junk is dropped", () => {
  assert.equal(
    pricingPlanRedirect({ plan: "talent_portfolio", interval: "y", from: "profile-analytics-upsell", viewer: talent }),
    `${APP}/talent/plan?plan=talent_portfolio&interval=year&from=profile-analytics-upsell`,
  );
  assert.equal(
    pricingPlanRedirect({ plan: "talent_portfolio", interval: "year", from: "<x>", viewer: anon }),
    "/start?plan=talent_portfolio&interval=year",
  );
});
