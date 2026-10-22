/** TUL-1897 · plan-change surfaces name talent plans like the rest of the app, never "Portafolio". */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { talentPlanDisplayName, planIntentLabel } from "./plan-intent";

test("the paid talent plan is Oficina Web in es and Web Office in en, matching the upgrade modal", () => {
  assert.equal(talentPlanDisplayName("talent_portfolio", "es"), "Oficina Web");
  assert.equal(talentPlanDisplayName("talent_portfolio", "en"), "Web Office");
  assert.equal(talentPlanDisplayName("talent_portfolio", "es"), planIntentLabel({ plan: "talent_portfolio", interval: "year" }, "es"));
  assert.notEqual(talentPlanDisplayName("talent_portfolio", "es"), "Portafolio");
});

test("Free and unknown keys", () => {
  assert.equal(talentPlanDisplayName("talent_basic", "es"), "Gratis");
  assert.equal(talentPlanDisplayName("talent_basic", "en"), "Free");
  assert.equal(talentPlanDisplayName("legacy_x", "es"), "");
});

test("the plan-change modal names both plans through the one helper", () => {
  const src = readFileSync(join(process.cwd(), "src/components/billing/talent-plan-change-modal.tsx"), "utf8");
  assert.equal((src.match(/talentPlanDisplayName\(/g) ?? []).length, 2);
  assert.doesNotMatch(src, /planDisplayNameFor/);
});
