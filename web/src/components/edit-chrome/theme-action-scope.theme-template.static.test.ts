import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * theme_template must never resolve to the tenant `agency_branding` action set.
 * Source-level proof (the module imports server actions that cannot load under
 * node:test): the theme_template branch returns BEFORE the tenant fallthrough
 * and does not reference any tenant action.
 */
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "theme-action-scope.ts"),
  "utf8",
);

test("theme_template branch exists and precedes the tenant fallthrough", () => {
  const branch = src.indexOf('surfaceKind === "theme_template"');
  const fallthrough = src.indexOf("homepage / cms_page / platform_lab");
  assert.ok(branch > 0, "theme_template branch missing");
  assert.ok(fallthrough > branch, "tenant fallthrough must come after the theme_template branch");
});

test("theme_template branch uses no tenant theme action", () => {
  const start = src.indexOf('surfaceKind === "theme_template"');
  const end = src.indexOf('if (surfaceKind === "talent_page")', start);
  const body = src.slice(start, end);
  for (const tenantAction of [
    "loadDesignAction",
    "saveDesignDraftFromEditAction",
    "saveComponentStylesDraftFromEditAction",
    "applyThemePresetFromEditAction",
    "publishDesignFromEditAction",
  ]) {
    assert.ok(!body.includes(tenantAction), `${tenantAction} leaked into theme_template`);
  }
  assert.match(body, /createThemeTemplateActionSet/);
});
