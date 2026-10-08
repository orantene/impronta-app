/**
 * ci-priority.static.test.ts — pins TUL-412 CI priority so main / integ /
 * promote / alias never sit behind a flood of ordinary PR gates.
 *
 * Levers (GitHub has no runner-priority API):
 *   1. Ordinary PR structural gates share one concurrency slot.
 *   2. integ/* keeps a per-ref slot; main stays per-sha and never cancels.
 *   3. promote + alias cancel superseded queued runs (reconcile / re-query
 *      makes replacement safe).
 *   4. Draft PRs still skip the heavy gate job (pinned elsewhere).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

function activeYaml(raw: string): string {
  return raw
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

const ci = read(".github/workflows/ci.yml");
const promote = activeYaml(read(".github/workflows/promote-production.yml"));
const alias = activeYaml(read(".github/workflows/vercel-post-deploy-alias.yml"));

test("ordinary PR gates share one concurrency slot (not per-ref)", () => {
  assert.match(ci, /ordinary-pr-pool/);
  assert.match(ci, /startsWith\(github\.head_ref, 'integ\/'\)/);
  // main still keys on sha so concurrent main runs never cancel each other
  assert.match(ci, /github\.ref == 'refs\/heads\/main' && format\('\{0\}-\{1\}', github\.workflow, github\.sha\)/);
});

test("cancel-in-progress stays false on main and on the ordinary PR pool", () => {
  assert.match(
    ci,
    /cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' && \(github\.event_name != 'pull_request' \|\| startsWith\(github\.head_ref, 'integ\/'\)\) \}\}/,
  );
});

test("promote cancels superseded queued runs in its own group", () => {
  const m = promote.match(/\nconcurrency:\n\s+group: (\S+)\n\s+cancel-in-progress: (\S+)/);
  assert.ok(m, "promote concurrency block missing");
  assert.equal(m[1], "promote-production");
  assert.equal(m[2], "true");
});

test("alias cancels superseded queued runs and may use a dedicated runner", () => {
  const m = alias.match(/\nconcurrency:\n\s+group: (\S+)\n\s+cancel-in-progress: (\S+)/);
  assert.ok(m, "alias concurrency block missing");
  assert.equal(m[1], "vercel-alias-production");
  assert.equal(m[2], "true");
  assert.match(alias, /vars\.ALIAS_RUNNER \|\| vars\.PROMOTE_RUNNER \|\| 'ubuntu-latest'/);
});
