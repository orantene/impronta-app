import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const inner = readFileSync(join(__dirname, "_talent-layout-inner.tsx"), "utf8");

// TUL-1255: /talent/today stayed on the skeleton (or blank) because optional shell reads in the
// Promise.all had no time box. Each one below must stay bounded() with an empty fallback.
const BOUNDED = [
  "loadTalentInquiriesAllAgencies",
  "loadTalentAgencies",
  "loadShellCounts",
  "loadUserPrefs",
  "loadTenantIdentity",
  "loadProfileDisplayName",
  "getTalentConnectedAccountSnapshot",
  "loadTalentInboxSummary",
  "loadTalentPlanGrants",
];

test("TUL-1255: bounded() uses the shared 2 s loader budget", () => {
  assert.match(inner, /function bounded<T>\(promise: Promise<T>, fallback: T\): Promise<T> \{\s*return withTimeout\(promise, TALENT_LOADER_BUDGET_MS, fallback\);/);
});

for (const name of BOUNDED) {
  test(`TUL-1255: ${name} is time-boxed in the shell fan-out`, () => {
    const line = inner.split("\n").find((l) => l.includes(`timed("talent.${name}"`));
    assert.ok(line, `${name} span missing`);
    const idx = inner.indexOf(line!);
    const block = inner.slice(idx, idx + 400);
    assert.match(block, /bounded\(/, `${name} lost its time box`);
  });
}

test("TUL-1255: the owned-workspace slug read cannot hold the shell", () => {
  assert.match(inner, /return await bounded\(\s*loadOwnedBusinessWorkspace\(adminDb, subjectUserId\)/);
});
