// TUL-1772: classify a finished gate run for main-red-alert.yml.
//
// GitHub reports a job killed by `timeout-minutes` as conclusion `cancelled`, the same value a
// manual cancel or a concurrency supersede produces, so the run conclusion alone cannot tell
// "gate ran out of time" (main is unvetted: ALARM) from "someone cancelled it" (no information:
// stay quiet). The one reliable discriminator is the job's check-run annotations:
//   timeout   -> failure annotation "The job has exceeded the maximum execution time of 45m0s"
//   cancelled -> failure annotation "The run was canceled by @user." / "...by a newer run"
// (Read from real runs on 2026-10-21: main push run 39634612316, job 119341623849 vs PR run
// 39644602050, job 119376728006.) Step timestamps are NOT used: a cancel near the limit is
// indistinguishable by duration, and the timeout value is not in the jobs payload.

const TIMEOUT_RE = /exceeded the maximum execution time/i;

/**
 * Pure classifier.
 * @param {{conclusion: string|null, jobs?: Array<{id:number, conclusion:string|null}>,
 *          annotations?: Record<string, Array<{message?:string}>>}} input
 * @returns {{action: "alarm"|"clear"|"ignore", verb: "failed"|"timed out"|null, reason: string}}
 */
function classifyRun({ conclusion, jobs = [], annotations = {} }) {
  if (conclusion === "failure") return { action: "alarm", verb: "failed", reason: "run failed" };
  if (conclusion === "timed_out") return { action: "alarm", verb: "timed out", reason: "run timed_out" };
  if (conclusion === "success") return { action: "clear", verb: null, reason: "run succeeded" };
  if (conclusion === "cancelled") {
    for (const job of jobs) {
      if (job.conclusion !== "cancelled" && job.conclusion !== "timed_out") continue;
      const notes = annotations[String(job.id)] ?? [];
      if (job.conclusion === "timed_out" || notes.some((n) => TIMEOUT_RE.test(n.message ?? ""))) {
        return { action: "alarm", verb: "timed out", reason: `job ${job.id} hit its timeout-minutes` };
      }
    }
    return { action: "ignore", verb: null, reason: "cancelled without a timeout annotation (superseded or manual cancel)" };
  }
  return { action: "ignore", verb: null, reason: `conclusion ${conclusion} carries no signal` };
}

/** Fetches jobs + annotations (only for a cancelled run) and classifies. */
async function classifyWorkflowRun({ github, owner, repo, run }) {
  if (run.conclusion !== "cancelled") return classifyRun({ conclusion: run.conclusion });
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    owner,
    repo,
    run_id: run.id,
    per_page: 100,
  });
  const annotations = {};
  for (const job of jobs) {
    if (job.conclusion !== "cancelled") continue;
    const { data } = await github.rest.checks.listAnnotations({ owner, repo, check_run_id: job.id, per_page: 50 });
    annotations[String(job.id)] = data;
  }
  return classifyRun({ conclusion: run.conclusion, jobs, annotations });
}

module.exports = { classifyRun, classifyWorkflowRun, TIMEOUT_RE };
