/**
 * theme-editor-es.static.test.ts — Spanish chrome for the Theme drawer
 * (live1 theme-editor / Diseño → Tema).
 *
 * CardHead / FieldLabel / Segmented already translate at the kit boundary, so
 * catalog entries alone cover most tab bodies. The drawer HEAD, tabs, footer,
 * and AdvancedTab bare prose do not — they need explicit `t()` calls. This
 * guard pins both the catalog and the wire-up.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/theme-editor-es.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ES_TEXT } from "./editor-i18n-es";
import { ES_THEME_TEXT } from "./editor-i18n-es-theme";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAWER = join(HERE, "theme-drawer.tsx");
const ES_MAIN = join(HERE, "editor-i18n-es.ts");

/** Keys unique to the theme catalog (must live in ES_THEME_TEXT). */
const THEME_UNIQUE_KEYS = [
  "Theme · loading…",
  "Theme · Custom",
  "Loading theme…",
  "Site theme",
  "Never published",
  "This page has no theme to edit yet.",
  "Discard changes",
  "Yes, publish",
  "Publish theme",
  "Theme JSON",
  "Power tools",
  "Effects",
  "Components",
] as const;

/** Chrome keys that may already live in other catalogs but must resolve. */
const CHROME_KEYS = [
  ...THEME_UNIQUE_KEYS,
  "Theme",
  "Unsaved",
  "Published",
  "Colors",
  "Typography",
  "Layout",
  "Code",
  "Save draft",
] as const;

test("ES_THEME_TEXT is spread into ES_TEXT", () => {
  const main = readFileSync(ES_MAIN, "utf8");
  assert.match(
    main,
    /import \{\s*ES_THEME_TEXT\s*\} from "\.\/editor-i18n-es-theme"/,
  );
  assert.match(main, /\.\.\.ES_THEME_TEXT/);
});

test("theme-unique chrome keys live in ES_THEME_TEXT", () => {
  const missing = THEME_UNIQUE_KEYS.filter((k) => !ES_THEME_TEXT[k]?.trim());
  assert.deepEqual(
    missing,
    [],
    `missing from ES_THEME_TEXT: ${missing.join(", ")}`,
  );
});

test("theme chrome keys resolve in ES_TEXT", () => {
  const missing = CHROME_KEYS.filter((k) => !ES_TEXT[k]?.trim());
  assert.deepEqual(missing, [], `missing from ES_TEXT: ${missing.join(", ")}`);
});

test("ThemeDrawer wires useEditorLocale and t() on chrome", () => {
  const source = readFileSync(DRAWER, "utf8");
  assert.match(source, /useEditorLocale/);
  assert.match(source, /const \{ t \} = useEditorLocale\(\)/);
  assert.match(source, /floatLabel=\{t\("Theme"\)\}/);
  assert.match(source, /t\("Theme · loading…"\)/);
  assert.match(source, /t\("Never published"\)/);
  assert.match(source, /t\(tabItem\.label\)/);
  assert.match(source, /t\("Publish theme"\)/);
  assert.match(source, /t\("Theme JSON"\)/);
});
