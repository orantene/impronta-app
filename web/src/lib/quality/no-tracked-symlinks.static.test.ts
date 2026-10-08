/**
 * No tracked symlinks. A `node_modules` symlink to a local checkout (made to run
 * tests in a worktree) was committed once and Turbopack aborted every Vercel
 * build on it. `.gitignore`'s `node_modules` now also matches the symlink form;
 * this test fails the gate if any symlink (mode 120000) is tracked.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("no symlinks are tracked in git", () => {
  const out = execFileSync("git", ["ls-files", "-s"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const links = out
    .split("\n")
    .filter((l) => l.startsWith("120000 "))
    .map((l) => l.split("\t")[1]);
  assert.deepEqual(links, [], `tracked symlinks: ${links.join(", ")}`);
});
