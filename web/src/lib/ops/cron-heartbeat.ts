/**
 * cron-heartbeat.ts — a job says "I ran", so that NOT running is detectable.
 *
 * WHY THIS EXISTS. `ingest-balance-transactions` and `project-ledger` are the
 * only writers of the books. Both alert loudly when they FAIL. Neither can
 * alert when it does not RUN: a job that never starts emits nothing, and
 * silence is indistinguishable from a healthy run that had nothing to do.
 *
 * The finance audit named this the top untracked risk: the ledger could stop
 * being written and the first symptom would be someone noticing, later, that
 * the books end abruptly. Discovery at audit time rather than incident time,
 * on the one system whose whole purpose is to be trustworthy after the fact.
 *
 * A heartbeat inverts the signal: absence of a recent row is the alarm.
 *
 * DELIBERATELY BEST-EFFORT. Recording a heartbeat must never change a job's
 * outcome. A ledger projection that worked and then failed to write its
 * heartbeat has still projected the ledger correctly, and turning that into a
 * 500 would trade a real success for an observability detail. So every failure
 * here is swallowed after being logged — the cost is a false staleness alarm,
 * which is the safe direction to be wrong in.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/** Jobs that write a heartbeat. Adding one here is not enough — the alert
 *  sweep's expectations table must also learn its schedule, or a job could
 *  heartbeat forever with nothing checking that it still does. */
export type HeartbeatJob = "project-ledger" | "ingest-balance-transactions";

/** Detail strings are capped in the schema; truncate rather than let the
 *  insert fail on a runaway error message and lose the heartbeat entirely. */
const MAX_DETAIL = 2000;

export function truncateDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const trimmed = detail.trim();
  if (!trimmed) return null;
  return trimmed.length <= MAX_DETAIL ? trimmed : `${trimmed.slice(0, MAX_DETAIL - 1)}…`;
}

/**
 * Record that `job` completed. Call it on BOTH paths — success and failure.
 *
 * A job that runs and fails every time is alive but broken; that is the job's
 * own alert to raise, not a staleness alarm. Recording only successes would
 * conflate the two and make a hard-failing job look like a stopped one.
 */
export async function recordCronHeartbeat(input: {
  job: HeartbeatJob;
  ok: boolean;
  detail?: string | null;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;

    const now = new Date().toISOString();
    const detail = truncateDetail(input.detail);

    // Read the current row only to carry the failure streak and the last good
    // run forward. A missing row is the first heartbeat, not an error.
    const { data: existing, error: readErr } = await admin
      .from("cron_heartbeats")
      .select("last_ok_at, consecutive_failures")
      .eq("job", input.job)
      .maybeSingle<{ last_ok_at: string | null; consecutive_failures: number }>();
    // Read the error. A failed read looks identical to "no prior heartbeat",
    // which would silently reset the failure streak and lose last_ok_at --
    // making a job that has been failing for hours look freshly healthy.
    if (readErr) {
      logServerError("ops.cron-heartbeat.read", readErr);
      return;
    }

    const { error } = await admin.from("cron_heartbeats").upsert(
      {
        job: input.job,
        last_run_at: now,
        // Preserved across failures so "last known good" survives a bad streak.
        last_ok_at: input.ok ? now : (existing?.last_ok_at ?? null),
        last_status: input.ok ? "ok" : "error",
        last_detail: detail,
        consecutive_failures: input.ok ? 0 : (existing?.consecutive_failures ?? 0) + 1,
        updated_at: now,
      },
      { onConflict: "job" },
    );

    if (error) logServerError("ops.cron-heartbeat.upsert", error);
  } catch (err) {
    // Never let observability change the job's outcome.
    logServerError("ops.cron-heartbeat", err);
  }
}

/**
 * How long a job may be silent before it counts as stopped.
 *
 * The CEO's rule is "alert if either misses two runs", so the threshold is two
 * intervals plus a grace margin for a slow run or a late scheduler tick. Being
 * generous here is deliberate: a staleness alarm that cries wolf on ordinary
 * scheduling jitter gets muted, and a muted alarm is worse than none.
 */
export const HEARTBEAT_EXPECTATIONS: Record<HeartbeatJob, { intervalMinutes: number; graceMinutes: number }> = {
  // vercel.json: `50 * * * *` — hourly.
  "project-ledger": { intervalMinutes: 60, graceMinutes: 15 },
  // vercel.json: `35 * * * *` — hourly.
  "ingest-balance-transactions": { intervalMinutes: 60, graceMinutes: 15 },
};

/** Minutes of silence after which a job is considered stopped. */
export function stalenessThresholdMinutes(job: HeartbeatJob): number {
  const e = HEARTBEAT_EXPECTATIONS[job];
  return e.intervalMinutes * 2 + e.graceMinutes;
}

export type HeartbeatRow = {
  job: string;
  last_run_at: string;
  last_ok_at: string | null;
  last_status: string;
  consecutive_failures: number;
};

export type HeartbeatVerdict =
  | { job: HeartbeatJob; state: "ok" }
  | { job: HeartbeatJob; state: "never_ran" }
  | { job: HeartbeatJob; state: "stale"; minutesSince: number; thresholdMinutes: number }
  | { job: HeartbeatJob; state: "failing"; consecutiveFailures: number };

/**
 * Pure: classify each expected job from the rows present. No I/O, so the
 * decision table is testable without a database.
 *
 * `never_ran` is deliberately distinct from `stale`. A missing row on a freshly
 * deployed job is expected and self-resolves within an interval; a row that has
 * gone quiet is a job that used to work and stopped. Collapsing them would make
 * every deploy of this feature page someone.
 */
export function classifyHeartbeats(
  rows: HeartbeatRow[],
  now: Date,
  jobs: HeartbeatJob[] = Object.keys(HEARTBEAT_EXPECTATIONS) as HeartbeatJob[],
): HeartbeatVerdict[] {
  const byJob = new Map(rows.map((r) => [r.job, r]));

  return jobs.map((job): HeartbeatVerdict => {
    const row = byJob.get(job);
    if (!row) return { job, state: "never_ran" };

    const threshold = stalenessThresholdMinutes(job);
    const minutesSince = Math.floor((now.getTime() - new Date(row.last_run_at).getTime()) / 60000);

    // Staleness first: a job that has STOPPED matters more than one that is
    // running and failing, and a stopped job's last status is frozen at
    // whatever it was, so checking failures first would mislabel it.
    if (minutesSince > threshold) {
      return { job, state: "stale", minutesSince, thresholdMinutes: threshold };
    }
    if (row.consecutive_failures >= 2) {
      return { job, state: "failing", consecutiveFailures: row.consecutive_failures };
    }
    return { job, state: "ok" };
  });
}
