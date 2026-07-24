#!/usr/bin/env node
/**
 * Honest status for the Builder fidelity workflow.
 *
 * `gh run list` reports the WORKFLOW conclusion. `builder-fidelity.yml` sets
 * `continue-on-error: true` on the fidelity job, which forces that conclusion
 * to `success` even when the job fails. Six weeks of real failures hid behind
 * that, and it recently caused a reviewer to blame an unrelated PR for an
 * inherited red.
 *
 * This prints the JOB-level conclusion, which is the truth.
 *
 *   npm run ci:fidelity-status            # last 5 runs on main
 *   npm run ci:fidelity-status -- <ref>   # e.g. a branch name
 *
 * Requires the `gh` CLI, authenticated. Read-only.
 */
import { execFileSync } from "node:child_process";

const REPO = "orantene/impronta-app";
const WORKFLOW = "builder-fidelity.yml";
const ref = process.argv[2] ?? "main";
const LIMIT = 5;

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let runs;
try {
  runs = JSON.parse(
    gh([
      "run", "list",
      "--repo", REPO,
      "--workflow", WORKFLOW,
      "--branch", ref,
      "--limit", String(LIMIT),
      "--json", "databaseId,headSha,conclusion,displayTitle,createdAt",
    ]),
  );
} catch (err) {
  console.error(`Could not list runs (is \`gh\` authenticated?): ${err.message}`);
  process.exit(2);
}

if (runs.length === 0) {
  console.log(`No ${WORKFLOW} runs found for ref "${ref}".`);
  process.exit(0);
}

console.log(`\n${WORKFLOW} — ref "${ref}"\n`);
console.log("  workflow says | job says  | commit    | title");
console.log("  --------------|-----------|-----------|------------------------------");

let anyJobFailed = false;

for (const run of runs) {
  let jobs = [];
  try {
    jobs = JSON.parse(
      gh(["run", "view", String(run.databaseId), "--repo", REPO, "--json", "jobs"]),
    ).jobs;
  } catch {
    // A run still in progress can 404 its jobs; report what we have.
  }

  const fidelity = jobs.find((j) => j.name === "Fidelity goldens");
  const jobConclusion = fidelity?.conclusion || "(pending)";
  if (jobConclusion === "failure") anyJobFailed = true;

  const workflowSays = (run.conclusion || "(pending)").padEnd(13);
  const jobSays = jobConclusion.padEnd(9);
  const title = run.displayTitle.slice(0, 46);
  const mismatch = run.conclusion === "success" && jobConclusion === "failure" ? "  <-- LIES" : "";

  console.log(`  ${workflowSays} | ${jobSays} | ${run.headSha.slice(0, 9)} | ${title}${mismatch}`);
}

console.log("");
if (anyJobFailed) {
  console.log("  The fidelity JOB is failing. Any run above marked LIES reports success");
  console.log("  at the workflow level purely because of `continue-on-error: true`.");
  console.log("");
  if (ref === "main") {
    console.log("  This is the inherited red on main (stale goldens since 2026-06-14).");
    console.log("  A branch showing the same failure is inheriting it, not causing it.");
  } else {
    console.log(`  If "${ref}" and main are both red, "${ref}" is inheriting it, not`);
    console.log("  causing it — unless your change touches builder render code.");
    console.log("  Compare with: npm run ci:fidelity-status main");
  }
} else {
  console.log("  Fidelity job is not currently failing on this ref.");
}
console.log("");
