import type { SupabaseClient } from "@supabase/supabase-js";

import { RETENTION_PERIODS } from "@/lib/legal/retention-config";

import { daysBefore, errorMessage, headCount } from "./retention-db";

/**
 * 90-day trims (policy: logs kept RETENTION_PERIODS.logsDays days) for the two
 * database log tables that had no job: `analytics_events` and
 * `notification_dispatch_log`. Both have `id uuid primary key` and
 * `created_at`, and NO table has a foreign key pointing at either of them
 * (verified in supabase/migrations), so deleting a row cannot cascade anywhere.
 *
 * Deliberately NOT touched: `workspace_audit_events` (its own job keeps 180
 * days), and every booking, payment, order, ledger or transaction table.
 *
 * Dry run: an exact head count of rows older than the cutoff, nothing written.
 * Enforce: delete in bounded batches by primary key, at most
 * LOG_TRIM_MAX_BATCHES per table per run, so one cron call stays bounded; the
 * next daily run continues.
 */

export const LOG_TRIM_TABLES = ["analytics_events", "notification_dispatch_log"] as const;
export type LogTrimTable = (typeof LOG_TRIM_TABLES)[number];

export const LOG_TRIM_BATCH = 500;
export const LOG_TRIM_MAX_BATCHES = 20;

export type LogTrimReport = {
  cutoff: string;
  /** Exact count of rows older than the cutoff, read before any delete. */
  olderThanCutoff: number;
  deleted: number;
};

async function trimTable(
  admin: SupabaseClient,
  table: LogTrimTable,
  cutoffIso: string,
  enforce: boolean,
  batch: number,
  maxBatches: number,
  errors: string[],
): Promise<LogTrimReport> {
  const report: LogTrimReport = { cutoff: cutoffIso, olderThanCutoff: 0, deleted: 0 };
  try {
    report.olderThanCutoff = await headCount(
      admin.from(table).select("id", { count: "exact", head: true }).lt("created_at", cutoffIso),
      table,
    );
    if (!enforce || report.olderThanCutoff === 0) return report;

    for (let i = 0; i < maxBatches; i++) {
      const { data, error } = await admin
        .from(table)
        .select("id")
        .lt("created_at", cutoffIso)
        .order("created_at", { ascending: true })
        .limit(batch);
      if (error) throw new Error(`${table}.select: ${error.message}`);
      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      if (ids.length === 0) break;
      // Re-assert the cutoff on the delete: a row can only be removed if it is still old.
      const { error: dErr } = await admin.from(table).delete().in("id", ids).lt("created_at", cutoffIso);
      if (dErr) throw new Error(`${table}.delete: ${dErr.message}`);
      report.deleted += ids.length;
      if (ids.length < batch) break;
    }
  } catch (e) {
    errors.push(`log_trim ${table}: ${errorMessage(e)}`);
  }
  return report;
}

export async function runLogTrims(
  admin: SupabaseClient,
  opts: { now: Date; enforce: boolean; batch?: number; maxBatches?: number; errors: string[] },
): Promise<{ analyticsEvents: LogTrimReport; notificationDispatchLog: LogTrimReport }> {
  const cutoffIso = daysBefore(opts.now, RETENTION_PERIODS.logsDays).toISOString();
  const batch = opts.batch ?? LOG_TRIM_BATCH;
  const maxBatches = opts.maxBatches ?? LOG_TRIM_MAX_BATCHES;
  const analyticsEvents = await trimTable(admin, "analytics_events", cutoffIso, opts.enforce, batch, maxBatches, opts.errors);
  const notificationDispatchLog = await trimTable(
    admin,
    "notification_dispatch_log",
    cutoffIso,
    opts.enforce,
    batch,
    maxBatches,
    opts.errors,
  );
  return { analyticsEvents, notificationDispatchLog };
}
