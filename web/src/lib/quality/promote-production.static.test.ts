/**
 * Pins the invariants of .github/workflows/promote-production.yml (TUL-197).
 *
 * The workflow is the live release path. It reconciles the `production` pointer
 * to the newest main commit whose structural gate run SUCCEEDED, so a red,
 * cancelled or queued newest head cannot freeze it. These checks are textual:
 * they cannot prove runtime behaviour (that needs a real run), they stop the
 * safety properties being edited away.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Reuse the repo's root resolver (`import.meta.dirname` is undefined under the
// tsx CJS transform this lane uses).
import { WEB_ROOT } from "./supabase-unchecked-read";

const RAW = readFileSync(join(WEB_ROOT, "..", ".github", "workflows", "promote-production.yml"), "utf8");
// Whole-line YAML comments out, so prose mentioning `--force` cannot satisfy or trip a check.
const YAML = RAW.split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

test("promote: never force-pushes and never uses a + refspec", () => {
  assert.doesNotMatch(YAML, /--force|--force-with-lease|git push[^\n]*\s-f\b/);
  assert.doesNotMatch(YAML, /git push[^\n]*\+\S*:/);
  const pushes = YAML.match(/git push[^\n]*/g) ?? [];
  assert.ok(pushes.length > 0, "workflow must push the pointer");
  for (const p of pushes) assert.match(p, /git push origin "\$SHA:refs\/heads\/production"/);
});

test("promote: fast-forward only (target must descend from production)", () => {
  assert.match(YAML, /merge-base --is-ancestor origin\/production "\$C"/);
  assert.match(YAML, /merge-base --is-ancestor origin\/production "\$SHA"/);
  assert.match(YAML, /merge-base --is-ancestor "\$SHA" origin\/production/);
  assert.match(YAML, /merge-base --is-ancestor "\$SHA" origin\/main/);
});

test("promote: target requires a successful structural gate run", () => {
  assert.match(YAML, /GATE_WORKFLOW: "CI — structural quality gate"/);
  const successQueries = YAML.match(/actions\/workflows\/ci\.yml\/runs\?[^"\s]*status=success/g) ?? [];
  assert.ok(successQueries.length >= 2, "explicit and fallback paths must both filter status=success");
  assert.match(YAML, /set -euo pipefail/);
  assert.doesNotMatch(YAML, /\|\| echo ""/, "an API failure must not be read as a verdict");
});

test("promote: falls back to the newest green commit on any gate conclusion", () => {
  assert.match(YAML, /types: \[completed\]/);
  assert.doesNotMatch(YAML, /conclusion == 'success'/, "must not skip on a red or cancelled head");
  assert.doesNotMatch(YAML, /\n    if: /, "no job-level skip condition");
  assert.match(YAML, /git rev-list --first-parent[^\n]*\$RANGE/);
  assert.match(YAML, /\n  schedule:/);
});

test("promote: own concurrency group that cancels superseded queued runs (TUL-412)", () => {
  const m = YAML.match(/\nconcurrency:\n\s+group: (\S+)\n\s+cancel-in-progress: (\S+)/);
  assert.ok(m, "top-level concurrency block missing");
  assert.equal(m[1], "promote-production");
  // true: reconcile recomputes newest green, so cancelling a queued promote
  // cannot freeze the pointer (TUL-412). Shared with no PR workflow.
  assert.equal(m[2], "true");
  const others = ["ci", "admin-boot", "builder-e2e", "builder-fidelity", "talent-website-e2e"];
  assert.ok(others.length > 0 && !others.includes(m[1]));
});

test("promote: does not trigger on pull requests", () => {
  assert.doesNotMatch(YAML, /\n\s+pull_request(_target)?:/);
});
