import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { formatTalentPlanPrice } from "./talent-plan-price";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("plan price carries the USD code in en and es", () => {
  assert.equal(formatTalentPlanPrice(1500, "en"), "$15 USD");
  assert.match(formatTalentPlanPrice(1500, "es"), /USD$/);
  assert.match(formatTalentPlanPrice(900, "es"), /^\$?9 USD$/);
});

test("MXN account context: invoice amounts keep their own code, plan stays USD", () => {
  assert.match(formatDashboardMoneyCents(30000, "MXN", "es"), /MXN$/);
  assert.match(formatTalentPlanPrice(1500, "es"), /USD$/);
});

test("no bare dollar plan prices remain on the talent plan surfaces", () => {
  const fixtures = read("components/admin/shell/internal/state/fixtures.ts");
  assert.doesNotMatch(fixtures, /monthlyPrice: "\$\d+ \/ mo"/);
  const shell = read("app/(workspace)/[tenantSlug]/talent/settings/TalentSubscriptionShell.tsx");
  assert.doesNotMatch(shell, /\$\d+ ?\/ ?(month|mo)\b/);
  const drawer = read("components/admin/shell/internal/talent-drawers/premium-pages.tsx");
  assert.match(drawer, /formatTalentPlanPrice/);
  assert.doesNotMatch(drawer, /return `\$\$\{\(cents/);
  assert.doesNotMatch(read("components/billing/plan-change-confirm.tsx"), /Intl\.NumberFormat/);
  assert.doesNotMatch(read("app/(workspace)/[tenantSlug]/talent/settings/TalentBillingCard.tsx"), /Intl\.NumberFormat\(loc, \{ style: "currency"/);
});

test("icon-only header buttons carry aria-label", () => {
  const files = [
    "components/admin/shell/internal/page-modules/WorkspaceTopbar.tsx",
    "components/admin/shell/internal/page-modules/MobileTopBar.tsx",
    "components/admin/shell/internal/shell-count-bubbles.tsx",
    "components/admin/channels/WhatsAppButton.tsx",
  ];
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/<button\b([^>]*?)>\s*(<Icon\b[^>]*\/>|<svg[\s\S]*?<\/svg>)\s*<\/button>/g)) {
      assert.match(m[1], /aria-label/, `${f}: icon-only button without aria-label`);
    }
  }
  assert.match(read("components/admin/shell/admin-shell-client.tsx"), /aria-label=\{copy\.t\("Send"\)\} onClick=\{\(\) => send\(input\)\}/);
});

import { talentPlanPriceLine } from "./talent-plan-price";

test("TUL-1297: a yearly plan prints the yearly amount, monthly equivalent as secondary (en + es)", () => {
  const en = talentPlanPriceLine({ monthlyCents: 1500, annualCents: 15000, interval: "year", locale: "en" });
  assert.equal(en.primary, "$150 USD / year");
  assert.match(en.secondary ?? "", /\$12\.50 USD a month/);
  const es = talentPlanPriceLine({ monthlyCents: 1500, annualCents: 15000, interval: "year", locale: "es" });
  assert.match(es.primary, /^\$150 USD \/ año$/);
  assert.match(es.secondary ?? "", /al mes/);
  assert.doesNotMatch(es.primary + (es.secondary ?? ""), /\/ mes|—|–/);
});

test("TUL-1297: monthly stays monthly and a missing yearly price falls back to monthly", () => {
  assert.equal(talentPlanPriceLine({ monthlyCents: 1500, annualCents: 15000, interval: "month" }).primary, "$15 USD / month");
  assert.equal(talentPlanPriceLine({ monthlyCents: 1500, annualCents: null, interval: "year", locale: "es" }).primary, "$15 USD / mes");
});

test("TUL-1297: the compare drawer has a yearly switch and the plan card prints the interval", () => {
  const drawer = read("components/admin/shell/internal/talent-drawers/premium-pages.tsx");
  assert.match(drawer, /TierIntervalToggle/);
  assert.match(drawer, /startTalentUpgrade\(planKey, tenantSlug, appliedCode \?\? urlPromo, null, interval\)/);
  assert.match(read("app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx"), /talentPlanPriceLine/);
  for (const f of ["../messages/en.json", "../messages/es.json"]) {
    const j = JSON.parse(readFileSync(join(root, f), "utf8"));
    const pp = j.dashboard.talentDrawers.premiumPages;
    for (const k of ["intervalLabel", "intervalMonthly", "intervalYearly", "upgradeToYear"]) {
      assert.ok(typeof pp[k] === "string" && pp[k].length > 0, `${f} ${k}`);
      assert.doesNotMatch(pp[k], /—|–/);
    }
  }
});
