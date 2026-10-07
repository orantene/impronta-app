/**
 * TUL-146: the Spanish rows for the English that leaked onto Spanish
 * dashboard screens. Pins three things: every row resolves through the real
 * dashboard translator, no row repeats a key another ES catalog already owns
 * (the later spread would silently change settled wording), and the
 * components that were fixed only pass literals the catalog can translate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PRESENCE_ES_TEXT } from "@/components/talent/studio/presence-es-text";
import { CLIENTS_ES_TEXT } from "./dashboard-i18n-clients";
import { DOMAIN_ERRORS_ES_TEXT } from "./dashboard-i18n-domain-errors";
import { FEES_ES_TEXT } from "./dashboard-i18n-fees";
import { LANGUAGES_ES_TEXT } from "./dashboard-i18n-languages";
import { LINKS_ES_TEXT } from "./dashboard-i18n-links";
import { LOCATION_ES_TEXT } from "./dashboard-i18n-location";
import { MONEY_ES_TEXT } from "./dashboard-i18n-money";
import { MONEY_HOME_ES_TEXT } from "./dashboard-i18n-money-home";
import { NOTIFICATIONS_ES_TEXT } from "./dashboard-i18n-notifications";
import { QUOTE_ES_TEXT } from "./dashboard-i18n-quote";
import { LEAKS_1007_ES_TEXT } from "./dashboard-i18n-leaks-1007";
import { SPANISH_LEAKS_ES_TEXT } from "./dashboard-i18n-spanish-leaks";
import { SWEEP_R1_ES_TEXT } from "./dashboard-i18n-sweep-r1";
import { TALENT_CLIENT_PANELS_ES_TEXT } from "./dashboard-i18n-talent-client-panels";
import { TALENT_EDITORS_ES_TEXT } from "./dashboard-i18n-talent-editors";
import { TALENT_GAPS_ES_TEXT } from "./dashboard-i18n-talent-gaps";
import { WEBSITE_ES_TEXT } from "./dashboard-i18n-website";
import { translateDashboardText } from "./dashboard-i18n";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "../../../../..");

const OTHER_CATALOGS: Record<string, Record<string, string>> = {
  CLIENTS_ES_TEXT,
  DOMAIN_ERRORS_ES_TEXT,
  FEES_ES_TEXT,
  LANGUAGES_ES_TEXT,
  LEAKS_1007_ES_TEXT,
  LINKS_ES_TEXT,
  LOCATION_ES_TEXT,
  MONEY_ES_TEXT,
  MONEY_HOME_ES_TEXT,
  NOTIFICATIONS_ES_TEXT,
  PRESENCE_ES_TEXT,
  QUOTE_ES_TEXT,
  SWEEP_R1_ES_TEXT,
  TALENT_CLIENT_PANELS_ES_TEXT,
  TALENT_EDITORS_ES_TEXT,
  TALENT_GAPS_ES_TEXT,
  WEBSITE_ES_TEXT,
};

/** Keys written inline in dashboard-i18n.ts (its table is not exported). */
function inlineKeys(): Set<string> {
  const src = readFileSync(join(HERE, "dashboard-i18n.ts"), "utf8");
  const keys = new Set<string>();
  for (const m of src.matchAll(/^\s{2}"((?:[^"\\]|\\.)+)":/gm)) keys.add(m[1].replace(/\\"/g, '"'));
  return keys;
}

test("every leak row resolves to its Spanish through the dashboard translator", () => {
  for (const [en, es] of Object.entries(SPANISH_LEAKS_ES_TEXT)) {
    assert.ok(es.trim().length > 0, `empty Spanish for "${en}"`);
    assert.equal(translateDashboardText(en, "es"), es, `"${en}" is not reaching the catalog`);
    assert.equal(translateDashboardText(en, "en"), en, "English must pass through untouched");
  }
});

test("no leak row repeats a key another Spanish catalog already owns", () => {
  const inline = inlineKeys();
  const clashes: string[] = [];
  for (const key of Object.keys(SPANISH_LEAKS_ES_TEXT)) {
    if (inline.has(key)) clashes.push(`${key}  (dashboard-i18n.ts)`);
    for (const [name, table] of Object.entries(OTHER_CATALOGS)) {
      if (key in table) clashes.push(`${key}  (${name})`);
    }
  }
  assert.deepEqual(clashes, [], `duplicate ES keys:\n${clashes.join("\n")}`);
});

test("Spanish rows carry no em dashes and no leftover English filler", () => {
  for (const [en, es] of Object.entries(SPANISH_LEAKS_ES_TEXT)) {
    assert.ok(!/[—–]/.test(es), `dash in "${en}"`);
  }
});

const FIXED_FILES = [
  "src/components/talent/services/TalentOrdersQueue.tsx",
  "src/components/talent/services/TalentOfferingsManager.tsx",
  "src/app/(workspace)/[tenantSlug]/talent/settings/DefaultCurrencyCard.tsx",
  "src/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityCard.tsx",
  "src/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityDrawer.tsx",
  "src/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx",
];

test("fixed components only hand copy.t() literals the Spanish catalog can translate", () => {
  // Words that are the same in Spanish; a missing row for these is not a leak.
  const SAME_IN_SPANISH = new Set(["Pro", "Portfolio", "extras", "Total", "Extra", "Flexible", "Menu"]);
  const missing: string[] = [];
  for (const rel of FIXED_FILES) {
    const src = readFileSync(join(WEB, rel), "utf8");
    for (const m of src.matchAll(/\bcopy\.t\(\s*"((?:[^"\\]|\\.)+)"/g)) {
      const literal = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (SAME_IN_SPANISH.has(literal)) continue;
      if (translateDashboardText(literal, "es") === literal) missing.push(`${rel.split("/").pop()}: ${literal}`);
    }
  }
  assert.deepEqual(missing, [], `copy.t literals with no Spanish row:\n${missing.join("\n")}`);
});

test("the services list no longer prints an English loading line for product orders", () => {
  const src = readFileSync(join(WEB, "src/components/talent/services/TalentOrdersQueue.tsx"), "utf8");
  assert.ok(!src.includes("Loading orders"), "TalentOrdersQueue must stay quiet while it loads");
});
