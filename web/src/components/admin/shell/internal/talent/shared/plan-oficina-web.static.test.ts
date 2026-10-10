/**
 * TUL-146 — ES must not show "Plan Web Office" next to "Oficina Web".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PROFILE = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/talent/shared/profile-sections-2.tsx"),
  "utf8",
);
const PLAN_CARD = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx"),
  "utf8",
);
const DENIED = readFileSync(
  join(process.cwd(), "src/lib/talent-site/free-site-capability-denied-copy.ts"),
  "utf8",
);

test("tier chip localizes meta.label on ES Plan prefix (no Plan Web Office)", () => {
  assert.match(PROFILE, /Plan \$\{copy\.t\(meta\.label\)\}/);
  assert.doesNotMatch(PROFILE, /Plan \$\{meta\.label\}/);
});

test("TalentPlanCard routes planLabel through dashboard copy", () => {
  assert.match(PLAN_CARD, /useDashboardText/);
  assert.match(PLAN_CARD, /copy\.t\(data\.planLabel\)/);
});

test("client denial copy uses Oficina Web in Spanish", () => {
  assert.match(DENIED, /parte de Oficina Web/);
  assert.doesNotMatch(DENIED, /parte de Web Office/);
});
