import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LAYOUT = readFileSync(
  join(process.cwd(), "src/app/(workspace)/talent/_talent-layout-inner.tsx"),
  "utf8",
);

test("platform talent layout uses profile-by-user and optional agency context", () => {
  assert.match(LAYOUT, /loadTalentSelfProfileByUser/);
  assert.match(LAYOUT, /getActiveTalentAgencyContext/);
  assert.match(LAYOUT, /platformTalentRoutes/);
  assert.match(LAYOUT, /login\?next=\/talent\/today/);
});

test("platform talent layout hides agency switcher unless hybrid", () => {
  // #839 removed the raw layout-level agency <select> strip; the switcher now
  // lives in the shell drawer, which receives isHybrid to gate hybrid-only chrome.
  assert.doesNotMatch(LAYOUT, /agencyOptions/);
  assert.doesNotMatch(LAYOUT, /<select\s/);
  assert.match(LAYOUT, /const isHybrid = membership != null/);
  assert.match(LAYOUT, /^\s+isHybrid,$/m);
});
