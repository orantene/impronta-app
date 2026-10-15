/**
 * TUL-726: /talent/settings Spanish polish. Static checks that the contact
 * trust tiers, the Plan card and "Hide everywhere" read Spanish, and that
 * "What you are told about" opens the alert PREFERENCES, not the inbox.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/components/admin/shell/internal/talent-settings-es-polish.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createTranslator } from "@/i18n/messages";
import { PRESENCE_ES_TEXT } from "@/components/talent/studio/presence-es-text";

const rd = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const settings = rd("./talent/pages/SettingsPage.tsx");
const plan = rd("../../../../app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx");
const vis = rd("../../../../app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityCard.tsx");
const contact = rd("./talent-drawers/agency.tsx");
const wave2 = rd("./wave2.tsx");
const es = createTranslator("es");
const en = createTranslator("en");

test("tier labels and rationales are translated for all four trust tiers", () => {
  for (const tier of ["Basic", "Verified", "Silver", "Gold"]) {
    for (const part of ["Label", "Hint", "Rationale"]) {
      const key = `dashboard.talentDrawers.agency.trust${tier}${part}`;
      assert.notEqual(en(key), key, `missing en ${key}`);
      assert.notEqual(es(key), key, `missing es ${key}`);
      assert.notEqual(es(key), en(key), `untranslated es ${key}`);
    }
  }
  assert.ok(contact.includes("TRUST_TIER_KEYS") && !contact.includes("meta.rationale"));
});

test("independent talent copy has no agency wording", () => {
  for (const key of [
    "contactPreferencesDescSolo",
    "howThisWorksBodySolo",
    "selectivityNoteSolo",
  ]) {
    for (const t of [en, es]) {
      const v = t(`dashboard.talentDrawers.agency.${key}`);
      assert.ok(!/agenc|roster|coordinat/i.test(v), `agency wording in ${key}: ${v}`);
    }
  }
  assert.ok(contact.includes("const solo ="));
});

test("Plan card and Hide everywhere have Spanish strings", () => {
  for (const k of [
    "Compare plans", "Loading your plan…", "Plan gift active", "No expiry",
    "Hidden everywhere", "Visible across Tulala", "Profile visibility", "Manage →",
    "Ended today", "Ends today", "1 day left",
    "Who can contact you", "What you are told about", "Hide everywhere",
    "One switch that overrides every page and listing.",
  ]) {
    assert.ok(PRESENCE_ES_TEXT[k], `no ES for ${k}`);
  }
  for (const lit of ["\n        Compare plans\n", ">Plan gift active<", "Loading your plan…\n"]) {
    assert.ok(!plan.includes(lit), `hardcoded in plan card: ${lit}`);
  }
  for (const lit of ['"Hidden everywhere"\n', ">Profile visibility<", "Manage →\n"]) {
    assert.ok(!vis.includes(lit), `hardcoded in visibility card: ${lit}`);
  }
});

test("'What you are told about' opens the alert preferences pane", () => {
  assert.match(settings, /label: tx\("What you are told about"\)[\s\S]{0,200}openDrawer\("talent-notifications", \{ expanded: "settings" \}\)/);
  assert.match(wave2, /payload\?\.expanded === "settings"/);
});
