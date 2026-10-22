import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const inner = readFileSync(join(__dirname, "_talent-layout-inner.tsx"), "utf8");

test("TUL-1255: the theme-bell fan-out cannot hold the talent shell past its budget", () => {
  assert.match(inner, /THEME_BELL_BUDGET_MS = 1500/);
  assert.match(inner, /Promise\.race\(\[\s*ensureSiteThemeUpdates\(admin, talentProfileId\)/);
});
