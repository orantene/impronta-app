/**
 * TUL-488 / TUL-516 S1: Spanish-primary demos must list English so `/en` is a
 * locale, not a branded page-slug 404.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEMO_SITE_SETTINGS, demoSiteSettingsFor } from "./demo-site-settings";
import { demoSecondaryFromSiteLangs, finishedDemoSecondaryLocales } from "./finished-demo-locales";

test("every Spanish-primary DEMO_SITE_SETTINGS entry includes en", () => {
  for (const [code, settings] of Object.entries(DEMO_SITE_SETTINGS)) {
    if (settings.siteLangs[0] !== "es") continue;
    assert.ok(settings.siteLangs.includes("en"), `${code} Spanish-primary must list en`);
  }
});

test("default demo settings for an unknown Spanish-primary code include en", () => {
  const s = demoSiteSettingsFor("TAL-99999");
  assert.deepEqual(s.siteLangs, ["es", "en"]);
});

test("TUL-488 named demos (karla, saul, diego) ship es+en", () => {
  for (const code of ["TAL-93209", "TAL-93208", "TAL-93005"]) {
    const s = demoSiteSettingsFor(code);
    assert.equal(s.siteLangs[0], "es", code);
    assert.ok(s.siteLangs.includes("en"), code);
    assert.deepEqual(demoSecondaryFromSiteLangs(s.siteLangs), ["en"]);
  }
});

test("demoSecondaryFromSiteLangs drops the primary", () => {
  assert.deepEqual(demoSecondaryFromSiteLangs(["es", "en"]), ["en"]);
  assert.deepEqual(demoSecondaryFromSiteLangs(["en", "es"]), ["es"]);
  assert.deepEqual(demoSecondaryFromSiteLangs(["es"]), []);
  assert.deepEqual(demoSecondaryFromSiteLangs(["en"]), []);
});

test("finishedDemoSecondaryLocales still refuses English-primary and non-empty secondaries", () => {
  assert.equal(finishedDemoSecondaryLocales({ preferredLocale: "en", currentSecondary: [] }), null);
  assert.equal(finishedDemoSecondaryLocales({ preferredLocale: "es", currentSecondary: ["fr"] }), null);
});
