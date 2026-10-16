// TUL-666: the talent upgrade path. The sidebar Plan control opens the
// tier-compare drawer, and /talent/plan (a URL talents and QA open directly)
// must be a real shell route that opens the same drawer, never a 404.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL = join(HERE, "..", "..", "..", "components", "admin", "shell", "internal");
const read = (p: string) => readFileSync(p, "utf8");

test("TUL-666: /talent/plan is a real route", () => {
  assert.ok(existsSync(join(HERE, "plan", "page.tsx")), "talent/plan/page.tsx missing");
});

test("TUL-666: /talent/plan opens the tier-compare drawer inside the shell", () => {
  const page = read(join(HERE, "plan", "page.tsx"));
  assert.match(page, /TalentPageRouteSyncer page="settings"/);
  assert.match(page, /TalentPlanRouteOpener/);
  const opener = read(join(HERE, "plan", "_talent-plan-route-opener.tsx"));
  assert.match(opener, /openDrawer\("talent-tier-compare"\)/);
});

test("TUL-666: the sidebar Plan control and the drawer switch agree on the drawer id", () => {
  assert.match(read(join(SHELL, "talent.tsx")), /data-tulala-talent-plan-nav/);
  assert.match(read(join(SHELL, "talent.tsx")), /openDrawer\("talent-tier-compare"\)/);
  assert.match(read(join(SHELL, "drawer-switch.tsx")), /case "talent-tier-compare":/);
});
