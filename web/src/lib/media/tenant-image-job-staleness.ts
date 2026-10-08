/**
 * tenant-image-job-staleness.ts — pure "is this image job stuck?" predicate
 * (TUL-140). No I/O, so the thresholds are testable without a database.
 *
 * Real durations (see tenant-image-jobs.server.ts + cron/tenant-images):
 *  - A `running` job lives inside ONE cron invocation, capped by
 *    `maxDuration = 60` s (the drain budget is 50 s). A healthy run is
 *    therefore over in about a minute; a row still `running` after
 *    10 minutes (10x the cap) belongs to a crashed or killed invocation.
 *  - A `queued` job can legitimately wait: a signup burst is paced at 5
 *    images/min, and a `daily_cap` pause deliberately leaves the job queued
 *    "for tomorrow". 48 hours clears one full cap reset with margin while
 *    still catching rows that are plainly dead (production has some from
 *    2026-09-16).
 *
 * `partial` is terminal: the runner only writes it together with
 * `finished_at` once no slot is left `queued` (some done, some failed or
 * blocked). It is never reaped and never re-claimed.
 */

export const RUNNING_STALE_MS = 10 * 60 * 1000;
export const QUEUED_STALE_MS = 48 * 60 * 60 * 1000;
export const STALE_JOB_ERROR = "timed out";

export interface StaleJobCandidate {
  status: string;
  created_at: string | null;
  started_at: string | null;
}

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** True only for `running` / `queued` rows older than their threshold. Terminal states are never stale. */
export function isStaleImageJob(job: StaleJobCandidate, nowMs: number): boolean {
  if (job.status === "running") {
    const since = ms(job.started_at) ?? ms(job.created_at);
    return since !== null && nowMs - since > RUNNING_STALE_MS;
  }
  if (job.status === "queued") {
    const since = ms(job.created_at);
    return since !== null && nowMs - since > QUEUED_STALE_MS;
  }
  return false;
}
