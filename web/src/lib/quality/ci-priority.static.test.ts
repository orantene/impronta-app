/**
 * ci-priority.static.test.ts pins TUL-412: main, integ/* batches, promote and
 * the alias job must not wait 30-50 min behind a flood of ordinary PR gates on
 * the shared ubuntu-latest pool.
 *
 * Levers (GitHub has no runner-priority API):
 *   1. The heavy structural gate runs on main, on integ/* PRs, and on ordinary
 *      PRs labelled full-ci. Any other ordinary PR fails a seconds-long
 *      policy step (required check stays red, so it cannot merge around the
 *      gate) and frees the runner; its integ batch's gate covers it.
 *   2. Concurrency stays PER-REF (a shared group would cancel queued gates).
 *   3. promote-production cancels a superseded queued run (it reconciles).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
const activeYaml = (raw: string) =>
  raw
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

const ci = activeYaml(read(".github/workflows/ci.yml"));
const promote = activeYaml(read(".github/workflows/promote-production.yml"));

test("concurrency stays per-ref; no shared ordinary-PR pool", () => {
  assert.match(ci, /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}/);
  assert.doesNotMatch(ci, /ordinary-pr-pool/);
});

test("the gate's first step is the policy step, reading labels live", () => {
  const steps = ci.split("\n    steps:\n")[1] ?? "";
  assert.match(steps.trimStart(), /^- name: Gate policy \(ordinary PRs ship via an integ batch\)\n\s+id: policy/);
  assert.match(ci, /gh pr view "\$PR_NUMBER" --json labels/);
  assert.match(ci, /grep -qx "full-ci"/);
  assert.match(ci, /startsWith\(github\.head_ref, 'integ\/'\)/);
  assert.match(ci, /pull-requests: read/);
  // It runs before checkout, so it must not inherit the job default working-directory (web/).
  assert.match(steps, /id: policy\n\s+working-directory: \.\n/);
});

test("an unlabelled ordinary PR fails (not skips) the gate", () => {
  assert.match(ci, /echo "run=false" >> "\$GITHUB_OUTPUT"\n\s+echo "::error::[^\n]*full-ci[^\n]*"\n\s+exit 1/);
});

test("every heavy step is conditioned on the policy output", () => {
  assert.doesNotMatch(ci, /if: \$\{\{ !cancelled\(\) \}\}/);
  const gated = ci.match(/steps\.policy\.outputs\.run == 'true'/g) ?? [];
  assert.ok(gated.length >= 50, `only ${gated.length} steps gated on the policy`);
});

test("no labeled trigger (a label event would cancel an in-flight gate)", () => {
  assert.doesNotMatch(ci, /types: \[[^\]]*labeled/);
});

test("promote cancels superseded queued runs in its own group", () => {
  const m = promote.match(/\nconcurrency:\n\s+group: (\S+)\n\s+cancel-in-progress: (\S+)/);
  assert.ok(m, "promote concurrency block missing");
  assert.equal(m[1], "promote-production");
  assert.equal(m[2], "true");
});
