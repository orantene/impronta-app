/**
 * vercel-alias-concurrency.static.test.ts (TUL-485) pins the post-deploy alias
 * workflow's concurrency so a preview (or non-success) deployment_status event
 * can never cancel the pending PRODUCTION alias run.
 *
 * GitHub keeps one pending run per concurrency group, and the job-level `if`
 * filters only after the group is chosen. A group shared with preview events
 * therefore drops production runs; that left the custom domains on a stale
 * build for 38 minutes on 2026-10-08.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const raw = readFileSync(path.join(REPO_ROOT, ".github/workflows/vercel-post-deploy-alias.yml"), "utf8");
const yaml = raw
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const block = yaml.match(/\nconcurrency:\n([\s\S]*?)\n(?=\S)/)?.[1] ?? "";

test("the shared alias group is joined ONLY by successful production events", () => {
  assert.ok(block, "top-level concurrency block missing");
  assert.match(block, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(block, /github\.event\.deployment_status\.environment == 'Production'/);
  assert.match(block, /'vercel-alias-production'/);
});

test("every other event gets a unique per-run group", () => {
  assert.match(block, /format\('vercel-alias-other-\{0\}', github\.run_id\)/);
});

test("production alias runs are never cancelled in progress", () => {
  assert.match(block, /cancel-in-progress: false/);
  assert.doesNotMatch(block, /cancel-in-progress: true/);
});

test("the group is not a bare constant shared by all events", () => {
  assert.doesNotMatch(block, /group: vercel-alias-production\s*$/m);
});
