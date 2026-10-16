import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync("src/components/admin/shell/internal/page-modules/OverviewBoard.tsx", "utf8");

test("TUL-1152: Overview header never reads the runtime clock during SSR/hydration", () => {
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /new Date\(\)/);
  assert.match(src, /greetingNeutral/);
  // Date label and time-of-day greeting only come from the snapshot (server nowIso + venue zone).
  assert.match(src, /if \(snapshot\) \{\s*const now = new Date\(snapshot\.nowIso\)/);
});

test("TUL-1152: neutral greeting key exists in en and es", () => {
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
    assert.match(m.dashboard.adminOverview.greetingNeutral, /\{name\}/);
  }
});
