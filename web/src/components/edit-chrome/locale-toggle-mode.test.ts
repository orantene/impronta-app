import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLocaleToggleMode } from "./locale-toggle-mode";

test("talent builder: single-locale composition list still gets the in-place toggle", () => {
  const r = resolveLocaleToggleMode({
    surfaceKind: "talent_page",
    talentBuilder: true,
    availableLocales: ["es"],
    tenantLocales: ["es", "en"],
  });
  assert.equal(r.mode, "inplace");
  assert.deepEqual([...r.locales], ["es", "en"]);
});

test("cms_page keeps the navigating toggle", () => {
  const r = resolveLocaleToggleMode({
    surfaceKind: "cms_page",
    talentBuilder: false,
    availableLocales: ["en", "es"],
    tenantLocales: ["en", "es"],
  });
  assert.equal(r.mode, "nav");
});

test("non-freeform multi-locale surfaces stay in place; single-language hides it", () => {
  assert.equal(
    resolveLocaleToggleMode({ surfaceKind: "homepage", talentBuilder: false, availableLocales: ["en", "es"], tenantLocales: [] }).mode,
    "inplace",
  );
  assert.equal(
    resolveLocaleToggleMode({ surfaceKind: "talent_page", talentBuilder: true, availableLocales: ["es"], tenantLocales: ["es"] }).mode,
    "none",
  );
});
