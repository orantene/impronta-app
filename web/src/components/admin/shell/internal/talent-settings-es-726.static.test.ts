/**
 * TUL-726 (EXP9, Max Settings in Spanish): four Settings surfaces showed
 * English, and "De qué te avisan" opened the notifications inbox instead of
 * the alert preferences.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/components/admin/shell/internal/talent-settings-es-726.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { createTranslator } from "@/i18n/messages";
import { translateDashboardText } from "./dashboard-i18n";
import { CLIENT_TRUST_META } from "./state/fixtures";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const settingsDir = "../../../../app/(workspace)/[tenantSlug]/talent/settings/";
const plan = read(`${settingsDir}TalentPlanCard.tsx`);
const visCard = read(`${settingsDir}ProfileVisibilityCard.tsx`);
const visDrawer = read(`${settingsDir}ProfileVisibilityDrawer.tsx`);
const contact = read("./talent-drawers/agency.tsx");
const wave2 = read("./wave2.tsx");
const es = createTranslator("es");
const en = createTranslator("en");

const SETTINGS_STRINGS = [
  "Loading your plan…",
  "Could not load your plan.",
  "Plan gift active",
  "Profile visibility",
  "Control where your profile appears.",
  "Visible across Tulala",
  "Hidden everywhere",
  "Agency sites",
  "Paused: your profile is hidden everywhere",
  "Shown on this agency's site",
  "Hidden from this agency's site",
  "Trusted",
];

test("Plan and Hide everywhere strings have Spanish", () => {
  for (const s of SETTINGS_STRINGS) {
    assert.notEqual(translateDashboardText(s, "es"), s, `no Spanish for: ${s}`);
  }
});

test("Plan and visibility surfaces route their copy through the dictionary", () => {
  for (const [name, src] of [["plan", plan], ["card", visCard], ["drawer", visDrawer]] as const) {
    assert.ok(blankComments(src).includes("useDashboardText"), `${name} does not use useDashboardText`);
  }
  assert.ok(!/>\s*Compare plans\s*\n/.test(plan), "Compare plans is bare English");
  assert.ok(!/>\s*Manage →\s*</.test(visCard), "Manage is bare English");
  assert.ok(!/^\s*Hide everywhere/m.test(visDrawer));
});

test("trust tier labels and descriptions are translated in the contact drawer", () => {
  assert.ok(contact.includes("t(meta.label)") || contact.includes("copy.t(meta.label)"), "tier label is raw");
  assert.ok(contact.includes("t(meta.rationale)") || contact.includes("copy.t(meta.rationale)"), "tier rationale is raw");
  for (const meta of Object.values(CLIENT_TRUST_META)) {
    for (const s of [meta.label, meta.rationale]) {
      assert.notEqual(translateDashboardText(s, "es"), s, `no Spanish for tier text: ${s}`);
    }
  }
});

test("independent talent sees no agency wording in contact preferences", () => {
  for (const key of [
    "dashboard.talentDrawers.agency.contactPreferencesDescSolo",
    "dashboard.talentDrawers.agency.howThisWorksBodySolo",
    "dashboard.talentDrawers.agency.selectivityNoteSolo",
  ]) {
    assert.notEqual(en(key), key, `missing en: ${key}`);
    assert.notEqual(es(key), key, `missing es: ${key}`);
    assert.ok(!/agenc|roster/i.test(en(key) + es(key)), `agency wording in ${key}`);
  }
  assert.ok(contact.includes("bridgeTalentAgencies"), "drawer does not branch on having agencies");
});

test("De qué te avisan opens the alert preferences, not the inbox list", () => {
  assert.ok(wave2.includes("prefsMode"), "no preferences-only mode");
  assert.equal(es("dashboard.talentNotifications.seeAll"), "Ver mis notificaciones");
  assert.notEqual(en("dashboard.talentNotifications.seeAll"), "dashboard.talentNotifications.seeAll");
});
