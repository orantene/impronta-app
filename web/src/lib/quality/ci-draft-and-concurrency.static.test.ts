/**
 * TUL-172: draft PRs must not run the structural quality gate, and superseded
 * PR runs must cancel, while main (and any non-PR) runs are never cancelled.
 *
 * WHY. Every push to a draft or stacked PR queued the full gate (15-25 min),
 * jamming the runner queue ahead of deploys. But `promote-production.yml`
 * advances the production pointer only on a run that SUCCEEDED on the exact
 * main commit, and a cancelled main run has no verdict (eight merged commits
 * once sat undeployed). So the two rules are pinned together here.
 *
 * Plain-text assertions on the workflow, like lane-enrolment.static.test.ts,
 * so no YAML parser dependency is needed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const WORKFLOWS = join(WEB_ROOT, "..", ".github", "workflows");
const ci = readFileSync(join(WORKFLOWS, "ci.yml"), "utf8");
const promote = readFileSync(join(WORKFLOWS, "promote-production.yml"), "utf8");

/** Drop whole-line comments so prose in comments cannot satisfy or break a match. */
const code = ci
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

test("pull_request trigger includes ready_for_review so a draft runs once it is ready", () => {
  const m = code.match(/^on:\n([\s\S]*?)^\S/m);
  assert.ok(m, "ci.yml has no on: block");
  const types = m[1].match(/pull_request:[\s\S]*?types:\s*\[([^\]]*)\]/);
  assert.ok(types, "pull_request trigger must declare explicit types");
  const list = types[1].split(",").map((t) => t.trim());
  for (const t of ["opened", "synchronize", "reopened", "ready_for_review"]) {
    assert.ok(list.includes(t), `pull_request types must include ${t} (got ${list.join(", ")})`);
  }
});

test("the gate job skips draft PRs but still runs on push and workflow_dispatch", () => {
  const job = code.match(/^  gate:\n([\s\S]*?)^    runs-on:/m);
  assert.ok(job, "ci.yml has no `gate` job");
  const cond = job[1].match(/^    if:\s*(.+)$/m);
  assert.ok(cond, "the gate job needs a job-level `if` that skips drafts");
  assert.match(cond[1], /github\.event\.pull_request\.draft\s*==\s*false/);
  assert.match(
    cond[1],
    /github\.event_name\s*!=\s*'pull_request'\s*\|\|/,
    "the draft test must be guarded by the event name so push/dispatch runs are never skipped",
  );
});

test("only pull_request runs are cancelled; main and other events always queue", () => {
  const cip = code.match(/^concurrency:\n([\s\S]*?)^\S/m);
  assert.ok(cip, "ci.yml has no top-level concurrency block");
  assert.match(cip[1], /group:.*github\.workflow.*github\.ref/, "group must be per workflow and ref");
  const cancel = cip[1].match(/cancel-in-progress:\s*(.+)$/m);
  assert.ok(cancel, "concurrency needs cancel-in-progress");
  assert.match(cancel[1], /github\.event_name\s*==\s*'pull_request'/);
});

test("promote-production still keys off the gate's exact workflow name on main", () => {
  assert.match(ci, /^name: CI — structural quality gate$/m);
  assert.match(promote, /workflows:\s*\["CI — structural quality gate"\]/);
  assert.match(promote, /branches:\s*\[main\]/);
});
