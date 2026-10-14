import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("TUL-824: the rate feed never holds the services list for more than a short budget", () => {
  const src = read("../../../lib/talent/offerings-actions.ts");
  const body = src.slice(
    src.indexOf("export async function loadTalentOfferingsForEditor"),
    src.indexOf("type SaveResult"),
  );
  assert.match(body, /USD_RATES_BUDGET_MS/);
  assert.match(body, /Promise\.race/);
});

test("TUL-824: secondary mount loads wait for the list (server actions run one at a time)", () => {
  const hook = read("./use-offerings-editor.ts");
  const perf = hook.slice(hook.indexOf("loadTalentServicePerformance(talentId)") - 200, hook.indexOf("loadTalentServicePerformance(talentId)") + 400);
  assert.match(perf, /if \(isWorkspace \|\| loading\) return;/);
  const home = read("./ServicesHome.tsx");
  assert.match(home, /useLocationSettings\(talentId, !editor\.loading\)/);
  assert.match(home, /useHasBookableHours\(talentId, !editor\.loading\)/);
});

test("TUL-824: loading shows a skeleton, not bare text", () => {
  assert.match(read("./ServicesHome.tsx"), /<ServicesListSkeleton \/>/);
  assert.match(read("./ServicesListSkeleton.tsx"), /data-testid="services-list-skeleton"/);
});
