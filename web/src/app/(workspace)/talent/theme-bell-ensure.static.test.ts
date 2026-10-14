import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-675: the talent shell makes sure the theme-update bell row exists before it loads the bell.
test("talent layout ensures theme updates before loading talent notifications", () => {
  const src = readFileSync(join(__dirname, "_talent-layout-inner.tsx"), "utf8");
  const fn = src.slice(src.indexOf("async function ensureThemeBellThenLoad"));
  assert.ok(fn.indexOf("ensureSiteThemeUpdates(") > 0);
  assert.ok(fn.indexOf("ensureSiteThemeUpdates(") < fn.indexOf("loadTalentSurfaceNotifications(readCtx)"));
  assert.match(src, /ensureThemeBellThenLoad\(talentSelfProfile\.id, readCtx\)/);
});
