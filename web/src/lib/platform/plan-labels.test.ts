import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAN_CATALOG } from "@/lib/access/plan-catalog";
import { PLAN_NAME_EN, planNameEn } from "./plan-labels";

const tiers = (JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8")) as {
  dashboard: { platform: { tier: Record<string, string> } };
}).dashboard.platform.tier;

test("workspace plan names match the customer-facing catalog", () => {
  for (const key of ["free", "website", "studio", "agency", "network", "legacy"] as const) {
    assert.equal(PLAN_NAME_EN[key], PLAN_CATALOG[key].displayName, key);
  }
});

test("platform admin tier messages agree with the shared names", () => {
  for (const [slug, label] of Object.entries(tiers)) {
    assert.equal(PLAN_NAME_EN[slug], label, slug);
  }
});

test("catalog slug 'hub' reads Network and unknown slugs pass through", () => {
  assert.equal(planNameEn("hub"), "Network");
  assert.equal(planNameEn("gold"), "gold");
});
