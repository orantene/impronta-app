/**
 * TUL-1772: the red-main alarm must fire when a gate hits its timeout-minutes (GitHub reports
 * that as conclusion `cancelled`) and stay silent when a run was merely superseded / cancelled.
 * Fixtures mirror the real API shapes read on 2026-10-21 (run 39634612316 timeout vs run
 * 39644602050 manual cancel).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const require = createRequire(import.meta.url);
const { classifyRun, classifyWorkflowRun } = require(path.join(REPO_ROOT, ".github/scripts/classify-gate-run.cjs")) as {
  classifyRun: (i: {
    conclusion: string | null;
    jobs?: Array<{ id: number; conclusion: string | null }>;
    annotations?: Record<string, Array<{ message?: string }>>;
  }) => { action: string; verb: string | null };
  classifyWorkflowRun: (i: {
    github: unknown;
    owner: string;
    repo: string;
    run: { id: number; conclusion: string };
  }) => Promise<{ action: string; verb: string | null }>;
};

const TIMEOUT_NOTES = [
  { annotation_level: "failure", message: "The job has exceeded the maximum execution time of 45m0s" },
  { annotation_level: "failure", message: "The operation was canceled." },
];
const CANCEL_NOTES = [
  { annotation_level: "failure", message: "The run was canceled by @orantene." },
  { annotation_level: "failure", message: "The operation was canceled." },
];
const jobs = [
  { id: 1, conclusion: "cancelled" },
  { id: 2, conclusion: "skipped" },
];

test("timed out job reported as cancelled -> alarm, verb 'timed out'", () => {
  const v = classifyRun({ conclusion: "cancelled", jobs, annotations: { "1": TIMEOUT_NOTES } });
  assert.deepEqual([v.action, v.verb], ["alarm", "timed out"]);
});

test("superseded / manually cancelled run -> no alarm", () => {
  const v = classifyRun({ conclusion: "cancelled", jobs, annotations: { "1": CANCEL_NOTES } });
  assert.equal(v.action, "ignore");
  assert.equal(classifyRun({ conclusion: "cancelled" }).action, "ignore");
});

test("failure -> alarm 'failed'; timed_out -> alarm 'timed out'; success -> clear", () => {
  assert.deepEqual(
    ["failure", "timed_out", "success"].map((c) => classifyRun({ conclusion: c }).action),
    ["alarm", "alarm", "clear"],
  );
  assert.equal(classifyRun({ conclusion: "failure" }).verb, "failed");
});

test("skipped / neutral / null -> ignore", () => {
  for (const c of ["skipped", "neutral", null]) assert.equal(classifyRun({ conclusion: c }).action, "ignore");
});

test("classifyWorkflowRun fetches annotations only for a cancelled run and only for cancelled jobs", async () => {
  const calls: number[] = [];
  const github = {
    paginate: async () => jobs,
    rest: {
      actions: { listJobsForWorkflowRun: {} },
      checks: {
        listAnnotations: async ({ check_run_id }: { check_run_id: number }) => {
          calls.push(check_run_id);
          return { data: TIMEOUT_NOTES };
        },
      },
    },
  };
  const t = await classifyWorkflowRun({ github, owner: "o", repo: "r", run: { id: 9, conclusion: "cancelled" } });
  assert.equal(t.action, "alarm");
  assert.deepEqual(calls, [1]);
  calls.length = 0;
  const f = await classifyWorkflowRun({ github, owner: "o", repo: "r", run: { id: 9, conclusion: "failure" } });
  assert.equal(f.action, "alarm");
  assert.deepEqual(calls, []);
});

test("workflow pin: cancelled passes the job if, skipped/neutral do not, script is called, issue protocol intact", () => {
  const raw = readFileSync(path.join(REPO_ROOT, ".github/workflows/main-red-alert.yml"), "utf8");
  const yml = raw
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const ifLine = yml.match(/^\s+if: (.*)$/m)?.[1] ?? "";
  assert.match(ifLine, /"cancelled"/);
  assert.doesNotMatch(ifLine, /"skipped"|"neutral"/);
  assert.match(yml, /\.github\/scripts\/classify-gate-run\.cjs/);
  assert.match(yml, /classifyWorkflowRun/);
  assert.match(yml, /sparse-checkout: \.github\/scripts/);
  assert.match(yml, /actions: read/);
  assert.match(yml, /checks: read/);
  // TUL-1403 concurrency key still includes sha + conclusion + gate name.
  assert.match(yml, /group: main-red-alert-\$\{\{ github\.event\.workflow_run\.head_sha \}\}-\$\{\{ github\.event\.workflow_run\.conclusion \}\}-\$\{\{ github\.event\.workflow_run\.name \}\}/);
  // Issue behaviour unchanged.
  assert.match(yml, /labels: "main-red"/);
  assert.match(yml, /verdict\.action === "alarm"/);
  assert.match(yml, /verdict\.action === "clear" && existing/);
  assert.match(yml, /every watched gate passed/);
  assert.ok(existsOk(path.join(REPO_ROOT, ".github/scripts/classify-gate-run.cjs")));
});

function existsOk(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
