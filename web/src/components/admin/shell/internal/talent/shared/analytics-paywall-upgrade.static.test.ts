/**
 * BILL-B: the Free-tier "Page analytics are part of {plan}" paywall on the talent
 * profile had no button, so the talent had nowhere to go. It now carries an
 * upgrade button that goes through the one talent upgrade path
 * (`openUpgrade`, the modal or straight to /talent/plan), in en + es.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { translateDashboardText } from "../../dashboard-i18n";
import { buildUpgradeOffer, isUpgradeFeature, upgradePlanLabel } from "@/components/talent/upgrade/upgrade-modal-model";

const SRC = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/talent/shared/profile-sections-1.tsx"),
  "utf8",
);

function upsellBlock(): string {
  const start = SRC.indexOf("data-tulala-analytics-upsell");
  assert.ok(start > 0, "analytics upsell block missing");
  return SRC.slice(start, SRC.indexOf("</div>\n      </div>\n    );", start));
}

test("BILL-B: the analytics paywall has an upgrade button", () => {
  const block = upsellBlock();
  assert.match(block, /Page analytics are part of \{plan\}/);
  assert.match(block, /upgradePlanLabel\(copy\.isSpanish \? "es" : "en"\)/);
  assert.doesNotMatch(block, /part of Pro"|Pro or Portfolio/);
  assert.match(block, /<button[\s\S]*data-tulala-analytics-upgrade/);
  assert.match(block, /openUpgrade\(\{ feature: "page-analytics", from: "profile-analytics-upsell" \}\)/);
  assert.match(block, /copy\.t\("Upgrade plan"\)/);
  assert.match(SRC, /import \{ openUpgrade \} from "@\/components\/talent\/upgrade\/open-upgrade";/);
});

test("BILL-B: the button label reads in English and Spanish", () => {
  assert.equal(translateDashboardText("Upgrade plan", "en"), "Upgrade plan");
  assert.equal(translateDashboardText("Upgrade plan", "es"), "Mejorar plan");
  assert.equal(translateDashboardText("Page analytics are part of {plan}", "es"), "El análisis de la página es parte de {plan}");
});

test("BILL-B: the modal knows the page-analytics paywall in en + es", () => {
  assert.ok(isUpgradeFeature("page-analytics"));
  assert.equal(buildUpgradeOffer({ feature: "page-analytics", interval: "m", locale: "en" }).featureLabel, "Page analytics");
  assert.equal(buildUpgradeOffer({ feature: "page-analytics", interval: "m", locale: "es" }).featureLabel, "El análisis de la página");
});

test("BILL-B: the paywall names the same plan the upgrade modal sells (one plan name, from the catalog label)", () => {
  for (const locale of ["es", "en"] as const) {
    const offer = buildUpgradeOffer({ feature: "page-analytics", locale });
    assert.equal(upgradePlanLabel(locale), offer.planLabel, locale);
    const title = translateDashboardText("Page analytics are part of {plan}", locale).replace("{plan}", upgradePlanLabel(locale));
    assert.ok(title.endsWith(offer.planLabel), title);
  }
  assert.equal(upgradePlanLabel("es"), "Oficina Web");
  assert.equal(upgradePlanLabel("en"), "Web Office");
  assert.equal(upgradePlanLabel("es", " Server Label "), "Server Label");
  const drawer = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent-drawers/analytics.tsx"), "utf8");
  assert.doesNotMatch(drawer, /Pro and Portfolio/);
  assert.match(drawer, /are part of \{plan\}/);
});
