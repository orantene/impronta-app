import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  ignoreCommand?: string;
};
const cmd = cfg.ignoreCommand ?? "";

test("ignoreCommand builds the production branch", () => {
  assert.match(cmd, /\[ "\$VERCEL_GIT_COMMIT_REF" != "production" \]/);
});

// Exit 0 = SKIP the build, non-zero = build (Vercel's ignoreCommand contract).
function skips(ref: string, env: Record<string, string> = {}): boolean {
  const r = spawnSync("sh", ["-c", cmd], {
    env: { PATH: process.env.PATH ?? "", VERCEL_GIT_COMMIT_REF: ref, ...env },
  });
  assert.ok(r.status === 0 || r.status === 1, `ignoreCommand must exit 0 or 1, got ${r.status}`);
  return r.status === 0;
}

// Oct 15: main no longer builds on push (every main merge was a paid build).
// Only the `production` release pointer builds, unless the PM turns STAGING_BUILD=1 on for a staging
// build of main (CLI deploys skip this check but lose the branch-scoped Preview(main) env).
test("production always builds", () => {
  assert.equal(skips("production"), false);
  assert.equal(skips("production", { STAGING_BUILD: "1" }), false);
});

test("main is skipped by default (cost rule, Oct 15)", () => {
  assert.equal(skips("main"), true);
  assert.equal(skips("main", { STAGING_BUILD: "0" }), true);
});

test("main builds only while the STAGING_BUILD=1 flag is on", () => {
  assert.equal(skips("main", { STAGING_BUILD: "1" }), false);
});

test("the flag does not turn on builds for other branches", () => {
  assert.equal(skips("feature/x", { STAGING_BUILD: "1" }), true);
});

test("ignoreCommand no longer builds the retired program/journeys-2026-09 branch", () => {
  assert.ok(!cmd.includes("program/journeys-2026-09"));
});

test("ignoreCommand never keys on VERCEL_ENV (unset during the ignore step)", () => {
  assert.ok(!cmd.includes("VERCEL_ENV"));
});
