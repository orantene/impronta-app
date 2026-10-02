import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(dir, "design-panel.tsx"), "utf8");
const drawer = readFileSync(join(dir, "theme-drawer.tsx"), "utf8");

test("theme_template never renders the agency Brand tab", () => {
  assert.match(panel, /surfaceKind === "theme_template"/);
  assert.match(panel, /!open \|\| isThemeTemplate\) return null/);
  assert.match(panel, /canEditTheme && !isThemeTemplate/);
});

test("theme_template hides Publish theme but keeps Save draft and Discard", () => {
  const i = drawer.indexOf('surfaceKind === "theme_template" ? null');
  const pub = drawer.indexOf("Publish theme\n");
  assert.ok(i > 0 && pub > i, "Publish theme must sit inside the theme_template gate");
  assert.match(drawer, /Save draft/);
  assert.match(drawer, /Discard changes/);
});
