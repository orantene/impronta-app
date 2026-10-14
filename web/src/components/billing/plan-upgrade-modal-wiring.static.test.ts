/**
 * TUL-829 wiring guard: every talent paywall CTA opens the shared
 * PlanUpgradeModal, whose one button goes through the server-routed
 * `upgradeTalentPlanFromModal` (Checkout / switch / fix payment). The workspace
 * modal hands the chosen interval to Checkout (TUL-830).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const TALENT_PAYWALL_CTAS = [
  "components/admin/shell/internal/talent-drawers/premium-pages.tsx",
  "app/(workspace)/[tenantSlug]/talent/settings/TalentSubscriptionShell.tsx",
];

for (const rel of TALENT_PAYWALL_CTAS) {
  test(`${rel} opens the shared upgrade modal instead of calling checkout`, () => {
    const src = read(rel);
    assert.match(src, /<PlanUpgradeModal\b/);
    assert.doesNotMatch(src, /startTalentUpgrade\(/);
  });
}

test("the shared modal's CTA is server-routed and carries the interval", () => {
  const src = read("components/billing/plan-upgrade-modal.tsx");
  assert.match(src, /upgradeTalentPlanFromModal\(tenantSlug, target, effective,/);
  assert.match(src, /loadTalentYearlyCheckoutPlans\(\)/);
});

test("the workspace modal passes the chosen interval to Checkout", () => {
  const global = read("components/admin/site-control-center/global-upgrade-modal.tsx");
  assert.match(global, /startWorkspaceUpgrade\(plan, slug, readPromoCodeFromUrl\(\), null, interval\)/);
  assert.match(global, /yearlyPlans=\{yearlyPlans\}/);
  const modal = read("components/admin/site-control-center/upgrade-modal.tsx");
  assert.match(modal, /onSelect\?\.\(plan\.key, cardCycle === "annual" \? "year" : "month"\)/);
});

test("upgrade modal copy has no em dashes in either language", () => {
  for (const file of ["en", "es"]) {
    const catalog = JSON.parse(readFileSync(join(process.cwd(), "messages", `${file}.json`), "utf8")) as {
      dashboard: { upgradeModal: Record<string, string> };
    };
    for (const [key, value] of Object.entries(catalog.dashboard.upgradeModal)) {
      assert.ok(!value.includes("—"), `${file}.dashboard.upgradeModal.${key}`);
    }
  }
});
