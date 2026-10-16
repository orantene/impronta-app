import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), "utf8");

test("mount no longer bails out when the FAB flag is unset", () => {
  const mount = read("MarketingSupportLauncherMount.tsx");
  assert.ok(!/if \(!SUPPORT_FAB_ENABLED\)\s*return null/.test(mount));
  assert.ok(mount.includes("showFab={SUPPORT_FAB_ENABLED}"));
  assert.ok(mount.includes("guestSupportMayServe"));
  assert.ok(mount.includes('ctx.kind !== "marketing"'));
});

test("launcher listens for the open event and hides the button when showFab is false", () => {
  const l = read("MarketingSupportLauncher.tsx");
  assert.ok(l.includes("TULALA_SUPPORT_OPEN_EVENT"));
  assert.ok(l.includes("showFab = true"));
  assert.ok(/\{showFab \? \(/.test(l));
  assert.ok(l.includes("{open ? ("));
});

test("hero CTA and header menu still dispatch the open event", () => {
  assert.ok(read("SupportStartHere.tsx").includes("TULALA_SUPPORT_OPEN_EVENT"));
  assert.ok(read("../marketing-support-menu.tsx").includes("openMarketingSupport()"));
});
