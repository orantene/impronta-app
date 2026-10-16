import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  fixtureRoleProblem,
  fixtureRoleProblems,
} from "../../../e2e-isolated/live-qa-pack-fixture-roles";
import { WEB_ROOT } from "./supabase-unchecked-read";

test("TUL-595: a client profile is refused as the superAdmin fixture, with the fix named", () => {
  const msg = fixtureRoleProblem("superAdmin", "u-1", { app_role: "client" });
  assert.ok(msg);
  assert.match(msg, /app_role="client"/);
  assert.match(msg, /not "super_admin"/);
  assert.match(msg, /update public\.profiles set app_role='super_admin' where id='u-1'/);
});

test("TUL-595: a super_admin profile is accepted as superAdmin", () => {
  assert.equal(fixtureRoleProblem("superAdmin", "u-1", { app_role: "super_admin" }), null);
});

test("a missing profile row is reported", () => {
  assert.match(fixtureRoleProblem("studio", "u-2", null) ?? "", /no profiles row/);
});

test("clientPortal must be a client; talent fixtures must not", () => {
  assert.equal(fixtureRoleProblem("clientPortal", "c", { app_role: "client" }), null);
  assert.ok(fixtureRoleProblem("clientPortal", "c", { app_role: "talent" }));
  assert.ok(fixtureRoleProblem("myself", "t", { app_role: "client" }));
  assert.equal(fixtureRoleProblem("myself", "t", { app_role: "talent" }), null);
});

test("only supplied fixtures are checked; every mismatch is listed together", () => {
  const profiles = new Map([
    ["a", { app_role: "client" }],
    ["b", { app_role: "talent" }],
    ["c", { app_role: "talent" }],
  ]);
  const problems = fixtureRoleProblems(
    { superAdmin: { userId: "a" }, myself: { userId: "b" }, clientPortal: { userId: "c" } },
    profiles,
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0] ?? "", /superAdmin/);
  assert.match(problems[1] ?? "", /clientPortal/);
  assert.deepEqual(fixtureRoleProblems({}, profiles), []);
});

test("the pack validates fixture roles in beforeAll and the seed creates a super_admin fixture", () => {
  const spec = readFileSync(join(WEB_ROOT, "e2e-isolated/live-qa-pack.spec.ts"), "utf8");
  assert.match(spec, /fixtureRoleProblems\(/, "live-qa-pack.spec.ts must call fixtureRoleProblems");
  const seed = readFileSync(join(WEB_ROOT, "scripts/seed-journeys-program.mjs"), "utf8");
  assert.match(seed, /qa-journeys-super-admin@impronta\.test[^\n]*appRole: "super_admin"/);
});
