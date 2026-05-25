import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LAYOUT = readFileSync(
  join(process.cwd(), "src/app/(workspace)/talent/layout.tsx"),
  "utf8",
);

test("platform talent layout uses profile-by-user and optional agency context", () => {
  assert.match(LAYOUT, /loadTalentSelfProfileByUser/);
  assert.match(LAYOUT, /getActiveTalentAgencyContext/);
  assert.match(LAYOUT, /platformTalentRoutes/);
  assert.match(LAYOUT, /login\?next=\/talent\/today/);
});

test("platform talent layout hides agency switcher unless hybrid", () => {
  assert.match(LAYOUT, /isHybrid && agencyOptions\.length > 1/);
  assert.doesNotMatch(LAYOUT, /\{agencyOptions\.length > 1 \?/);
});
