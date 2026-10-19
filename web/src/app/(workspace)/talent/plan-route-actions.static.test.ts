/**
 * BILL-B: /talent/plan?plan=&interval= sat on a long skeleton with a queue of
 * server-action POSTs before it reached Stripe or the plan-change confirm.
 * Next runs a page's server actions one at a time, so every extra action fired
 * on mount waits in the same queue as the upgrade. This pins the structure:
 *  - the shell starts on Settings for /talent/plan (no Today mount + swap);
 *  - the plan intent is parsed once, on the server, and passed as a prop;
 *  - the client opener fires the upgrade action at most once per mount.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

test("BILL-B: the shell's first page for /talent/plan is Settings, not Today", () => {
  const layout = read("_talent-layout-inner.tsx");
  const map = layout.slice(layout.indexOf("const TALENT_SEGMENT_MAP"), layout.indexOf("};", layout.indexOf("const TALENT_SEGMENT_MAP")));
  assert.match(map, /\n\s+plan: "settings",/);
});

test("BILL-B: the plan page parses the intent on the server and passes it as a prop", () => {
  const page = read("plan/page.tsx");
  assert.doesNotMatch(page, /^"use client"/);
  assert.match(page, /searchParams/);
  assert.match(page, /parsePlanIntent\(first\(sp\.plan\), first\(sp\.interval\)\)/);
  assert.match(page, /<TalentPlanRouteOpener intent=\{intent\} \/>/);
});

test("BILL-B: the opener calls the upgrade action once per mount and reads no URL intent", () => {
  const opener = read("plan/_talent-plan-route-opener.tsx");
  assert.doesNotMatch(opener, /readPlanIntentFromUrl/);
  const calls = opener.match(/startTalentUpgrade\(/g) ?? [];
  assert.equal(calls.length, 1, "exactly one startTalentUpgrade call site");
  const effect = opener.slice(opener.indexOf("useEffect(() => {"), opener.indexOf("startTalentUpgrade("));
  assert.match(effect, /if \(ran\.current \|\| !openDrawer\) return;\s*ran\.current = true;/);
  // No other server action fires on mount from the opener (preview/confirm run
  // only inside the confirm dialog, after the upgrade answered).
  const mountEffect = opener.slice(opener.indexOf("useEffect(() => {"), opener.indexOf("const slug = tenantSlug;"));
  assert.doesNotMatch(mountEffect, /previewTalentPlanChange|confirmTalentPlanChange|loadTalentPlanSummary/);
});
