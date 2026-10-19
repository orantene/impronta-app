/**
 * BILL-B: the Free-tier "Page analytics are part of Pro" paywall on the talent
 * profile had no button, so the talent had nowhere to go. It now carries an
 * upgrade button that goes through the one talent upgrade path
 * (`openUpgrade`, the modal or straight to /talent/plan), in en + es.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { translateDashboardText } from "../../dashboard-i18n";
import { buildUpgradeOffer, isUpgradeFeature } from "@/components/talent/upgrade/upgrade-modal-model";

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
  assert.match(block, /Page analytics are part of Pro/);
  assert.match(block, /<button[\s\S]*data-tulala-analytics-upgrade/);
  assert.match(block, /openUpgrade\(\{ feature: "page-analytics", from: "profile-analytics-upsell" \}\)/);
  assert.match(block, /copy\.t\("Upgrade plan"\)/);
  assert.match(SRC, /import \{ openUpgrade \} from "@\/components\/talent\/upgrade\/open-upgrade";/);
});

test("BILL-B: the button label reads in English and Spanish", () => {
  assert.equal(translateDashboardText("Upgrade plan", "en"), "Upgrade plan");
  assert.equal(translateDashboardText("Upgrade plan", "es"), "Mejorar plan");
  assert.equal(translateDashboardText("Page analytics are part of Pro", "es"), "El análisis de la página es parte de Pro");
});

test("BILL-B: the modal knows the page-analytics paywall in en + es", () => {
  assert.ok(isUpgradeFeature("page-analytics"));
  assert.equal(buildUpgradeOffer({ feature: "page-analytics", interval: "m", locale: "en" }).featureLabel, "Page analytics");
  assert.equal(buildUpgradeOffer({ feature: "page-analytics", interval: "m", locale: "es" }).featureLabel, "El análisis de la página");
});
