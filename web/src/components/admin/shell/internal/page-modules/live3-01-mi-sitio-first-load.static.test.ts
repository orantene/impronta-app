/**
 * live3-01-mi-sitio-first-load.static.test.ts — first "Mi sitio web" click
 * must not hard-nav to the legacy `/talent/public-page` alias.
 *
 * QA (dual-owner Grok Salon): account-menu fallback assigned that alias when
 * dashboard seed was missing; the redirect hop painted the global error card
 * until a full reload. Soft-nav to Presence (`setTalentPage("public-page")` →
 * `/talent/site`) is the recovery path.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/admin/shell/internal/page-modules/live3-01-mi-sitio-first-load.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CREATE_WEBSITE_HREF } from "@/lib/talent-site/my-website-target";

const HERE = dirname(fileURLToPath(import.meta.url));
const MENU = join(HERE, "TalentAccountMenuSection.tsx");
const PANEL = join(
  HERE,
  "../../../../talent/site/TalentSiteDashboardPanel.tsx",
);

test("create / Presence canonical href is /talent/site", () => {
  assert.equal(CREATE_WEBSITE_HREF, "/talent/site");
});

test("account menu soft-navs into Presence when seed is missing", () => {
  const src = readFileSync(MENU, "utf8");
  assert.doesNotMatch(src, /location\.assign\([^)]*public-page/);
  assert.match(src, /setTalentPage\("public-page"\)/);
});

test("dashboard panel retries a failed layout seed", () => {
  const src = readFileSync(PANEL, "utf8");
  assert.match(src, /if \(!initialLoad\.ok\) \{/);
  assert.match(src, /void reload\(\);/);
});
