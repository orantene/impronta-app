import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  ignoreCommand?: string;
};
const cmd = cfg.ignoreCommand ?? "";

test("ignoreCommand names exactly the production and staging refs", () => {
  assert.match(cmd, /\[ "\$VERCEL_GIT_COMMIT_REF" != "production" \]/);
  assert.match(cmd, /\[ "\$VERCEL_GIT_COMMIT_REF" != "staging" \]/);
});

// Exit 0 = SKIP the build, non-zero = build (Vercel's ignoreCommand contract).
function skips(ref: string, env: Record<string, string> = {}): boolean {
  const r = spawnSync("sh", ["-c", cmd], {
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", VERCEL_GIT_COMMIT_REF: ref, ...env },
  });
  assert.ok(r.status === 0 || r.status === 1, `ignoreCommand must exit 0 or 1, got ${r.status}`);
  return r.status === 0;
}

// Oct 15: main no longer builds on push (every main merge was a paid build).
// TUL-1765/1768: only the `production` and `staging` POINTER branches build. Both are moved only by a
// workflow a human dispatches, so one trigger = one build. The temporary STAGING_BUILD env switch is gone.
test("production always builds", () => {
  assert.equal(skips("production"), false);
});

test("staging (the pointer branch) always builds", () => {
  assert.equal(skips("staging"), false);
});

test("main is skipped (cost rule, Oct 15), whatever the environment says", () => {
  assert.equal(skips("main"), true);
  assert.equal(skips("main", { STAGING_BUILD: "1" }), true);
});

test("every other branch is skipped, including look-alikes", () => {
  for (const ref of ["feature/x", "integ/2026-10-21-b14", "staging-2", "xstaging", "staging/x", "production-old", "Staging", "release/production", ""]) {
    assert.equal(skips(ref), true, `${JSON.stringify(ref)} must be skipped`);
  }
});

test("the STAGING_BUILD switch is gone from the ignoreCommand", () => {
  assert.ok(!cmd.includes("STAGING_BUILD"));
});

test("ignoreCommand no longer builds the retired program/journeys-2026-09 branch", () => {
  assert.ok(!cmd.includes("program/journeys-2026-09"));
});

test("ignoreCommand never keys on VERCEL_ENV (unset during the ignore step)", () => {
  assert.ok(!cmd.includes("VERCEL_ENV"));
});
