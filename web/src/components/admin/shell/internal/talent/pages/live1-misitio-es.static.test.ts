/**
 * live1 / TUL-39 — Mi sitio LegacyPresence + Portfolio upsell use t(), not
 * English string literals (ES shell was painting YOUR MULTI-PAGE WEBSITE…).
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/admin/shell/internal/talent/pages/live1-misitio-es.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

test("LegacyPresence eyebrows go through copy.t()", () => {
  const src = read("components/admin/shell/internal/talent/pages/PublicPageEditor.tsx");
  assert.match(src, /copy\.t\("Your multi-page website"\)/);
  assert.match(src, /copy\.t\("Your discovery profile"\)/);
  assert.doesNotMatch(src, /eyebrow="Your multi-page website"/);
  assert.doesNotMatch(src, /eyebrow="Your discovery profile"/);
});

test("UpsellCard Portfolio copy goes through copy.t()", () => {
  const src = read("components/talent/site/TalentMaxSiteManager.tsx");
  assert.match(src, /copy\.t\("PORTFOLIO FEATURE"\)/);
  assert.match(src, /copy\.t\("Your own website"\)/);
  assert.match(src, /copy\.t\("See plans"\)/);
  assert.doesNotMatch(src, /<Badge>PORTFOLIO FEATURE<\/Badge>/);
});

test("WEBSITE_ES_TEXT covers live1 Mi sitio keys", () => {
  const src = read("components/admin/shell/internal/dashboard-i18n-website.ts");
  for (const k of [
    "Your multi-page website",
    "Your discovery profile",
    "PORTFOLIO FEATURE",
    "Intro tagline",
    "Draft updated",
    "View published site",
  ]) {
    assert.match(src, new RegExp(`"${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});
