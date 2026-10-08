/**
 * ci-pr-trigger-types.static.test.ts - pins the TUL-219 decision that the
 * structural gate's `pull_request` trigger does NOT include `edited`.
 *
 * WHY: a bare `edited` queues a 15-25 minute gate on every title or body edit.
 * A job-level skip on `github.event.changes.base` does not help, because the
 * workflow-level concurrency group (keyed on the PR ref, cancel-in-progress)
 * would let a skipped `edited` run cancel the real in-flight gate, and a
 * skipped job counts as passing. Stacked PRs are handled by the no-stacking
 * rule and a re-push. See web/docs/development-workflow.md section 12.
 *
 * HOW TO REACT WHEN THIS FAILS: if you add `edited`, you must also give
 * `edited` runs their own concurrency group so they cannot cancel a gate, and
 * update the doc section and this test together.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

const ci = read(".github/workflows/ci.yml");
const doc = read("web/docs/development-workflow.md");
const claudeMd = read("CLAUDE.md");

function prTypes(): string[] {
  const m = ci.match(/^ {2}pull_request:\n(?: {4}.*\n)*? {4}types: \[([^\]]*)\]/m);
  assert.ok(m, "ci.yml pull_request trigger must declare an explicit types list");
  return m[1].split(",").map((s) => s.trim());
}

test("pull_request types are exactly the four reviewed ones, with no edited", () => {
  assert.deepEqual(prTypes(), [
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review",
  ]);
});

test("draft skip and event_name check on the gate job still hold", () => {
  assert.match(
    ci,
    /if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/,
  );
});

test("PR concurrency still cancels superseded runs and never cancels main", () => {
  assert.match(
    ci,
    /cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/,
  );
});

test("the decision is documented and the no-stacking rule is in CLAUDE.md", () => {
  assert.match(doc, /## \d+\. Stacked PRs and the CI trigger/);
  assert.match(doc, /deliberately NOT added/);
  assert.match(claudeMd, /Never stack PRs/);
  assert.match(claudeMd, /web\/AGENTS\.md/);
});
