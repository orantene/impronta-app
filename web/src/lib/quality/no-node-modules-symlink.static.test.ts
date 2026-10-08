/**
 * Card 194 guard: the worktree test helper (scripts/dev/test-in-worktree.sh)
 * symlinks node_modules temporarily. Nothing named node_modules, and no symlink
 * at all, may ever be tracked under web/. Also covers the helper's refusal of
 * tsc / eslint / next build / npm ci style arguments.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

test("no tracked node_modules path or symlink under web/", () => {
  const out = execFileSync("git", ["ls-files", "-s", "--", "."], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const bad = out
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ mode: l.split(" ")[0], path: l.split("\t")[1] ?? "" }))
    .filter((e) => e.mode === "120000" || e.path.split("/").includes("node_modules"))
    .map((e) => e.path);
  assert.deepEqual(bad, [], `tracked node_modules/symlink paths: ${bad.join(", ")}`);
});

const script = path.join(process.cwd(), "scripts/dev/test-in-worktree.sh");
function check(...args: string[]) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, TEST_IN_WT_CHECK_ONLY: "1" },
  });
}

test("test-in-worktree refuses typecheck/lint/build/install requests", () => {
  const refused = [
    ["tsc"],
    ["tsc --noEmit"],
    ["--noEmit"],
    ["eslint", "src"],
    ["next", "build"],
    ["next build"],
    ["next dev"],
    ["npm ci"],
    ["npm", "ci"],
    ["--watch"],
  ];
  for (const args of refused) {
    const r = check(...args);
    assert.equal(r.status, 2, `should refuse: ${args.join(" ")}`);
    assert.match(r.stderr, /CI's job/);
  }
});

test("test-in-worktree accepts test files and --lane", () => {
  assert.equal(check("src/lib/quality/no-node-modules-symlink.static.test.ts").status, 0);
  assert.equal(check("--lane", "size-ratchet").status, 0);
});
