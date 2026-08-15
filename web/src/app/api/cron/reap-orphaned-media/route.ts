import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { reapOptionsFromEnv, runMediaReaper } from "@/lib/media/reap-orphaned-media-scan";
import {
  notifyPlatformOfReapReport,
  reapAlertThreshold,
  shouldAlertOnReapReport,
} from "@/lib/media/reap-orphaned-media-alert";

/**
 * Scheduled job — storage reaper for orphaned media objects.
 *
 * Media soft-delete sets `media_assets.deleted_at` but never removes the
 * storage object. Measured 2026-08-15: ~381 objects / ~81 MB (~23% of the
 * media bucket) were referenced by nothing, on a project that sits chronically
 * near the Supabase free-tier storage ceiling.
 *
 * This route is a THIN wrapper: auth, invoke, log, respond. All matching logic
 * lives in `@/lib/media/reap-orphaned-media` (pure, unit tested) and the I/O in
 * `@/lib/media/reap-orphaned-media-scan`.
 *
 * ─── DRY RUN BY DEFAULT ────────────────────────────────────────────────────
 *   MEDIA_REAPER_ENABLED=true            enable actual deletion (default OFF)
 *   MEDIA_REAPER_GRACE_DAYS=30           soft-delete grace period
 *   MEDIA_REAPER_MAX_DELETIONS=500       hard cap per run
 *   MEDIA_REAPER_ALLOW_UNACCOUNTED=true  also reap objects with NO media_assets
 *                                        row (default OFF; see the scan module)
 *   MEDIA_REAPER_ALERT_THRESHOLD=250     wouldDelete count that pages platform
 *                                        admins in-app (A10)
 *
 * With the flag off the run reports exactly what it WOULD delete and deletes
 * nothing. Any reference lookup that fails aborts the run with a 500 and
 * deletes nothing.
 *
 * The response body goes nowhere on a scheduled invocation, so the report is
 * ALSO structured-logged and, past the threshold, emitted as a platform
 * notification. See `@/lib/media/reap-orphaned-media-alert`.
 *
 * Auth: same contract as the other cron routes — Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/reap-orphaned-media
 *
 * Configured in `vercel.json`: weekly, Sunday 03:40 UTC.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/reap-orphaned-media", "CRON_SECRET env var not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  return await Sentry.withMonitor(
    "reap-orphaned-media",
    async () => {
      try {
        const outcome = await runMediaReaper(supabase, reapOptionsFromEnv());

        if (!outcome.ok) {
          // A referencing source did not answer. Nothing was deleted.
          logServerError(`cron/reap-orphaned-media.${outcome.stage}`, outcome.error);
          return NextResponse.json(
            { ok: false, aborted: true, stage: outcome.stage, error: outcome.error },
            { status: 500 },
          );
        }

        // A10 — the report has to survive the response body, which Vercel
        // discards for a cron invocation. `keptByReason` is the half that
        // explains the other numbers ("why is wouldDelete only 12?"), so it
        // ships as JSON in the log line rather than being dropped; the log
        // field type is scalar-only.
        void improntaLog("media_reaper.done", {
          dryRun: outcome.dryRun,
          graceDays: outcome.graceDays,
          maxDeletions: outcome.maxDeletions,
          scannedObjects: outcome.scanned.objects,
          scannedAssetRows: outcome.scanned.assetRows,
          scannedExternalRefs: outcome.scanned.externalRefs,
          wouldDeleteCount: outcome.wouldDelete.count,
          wouldDeleteBytes: outcome.wouldDelete.bytes,
          eligibleBeforeCapCount: outcome.eligibleBeforeCap.count,
          deletedCount: outcome.deleted?.count ?? 0,
          deletedBytes: outcome.deleted?.bytes ?? 0,
          cappedByLimit: outcome.cappedByLimit,
          keptByReason: JSON.stringify(outcome.keptByReason),
          samplePaths: JSON.stringify(outcome.samplePaths),
          durationMs: outcome.durationMs,
        });

        // A big pending deletion is exactly the thing nobody should have to go
        // looking for. Crossing the threshold (or hitting the per-run cap)
        // pages the platform admins in-app.
        const threshold = reapAlertThreshold();
        if (shouldAlertOnReapReport(outcome, threshold)) {
          const notified = await notifyPlatformOfReapReport(supabase, outcome);
          void improntaLog("media_reaper.alerted", {
            threshold,
            wouldDeleteCount: outcome.wouldDelete.count,
            cappedByLimit: outcome.cappedByLimit,
            notified,
          });
        }

        return NextResponse.json(outcome);
      } catch (error) {
        logServerError("cron/reap-orphaned-media", error);
        return NextResponse.json(
          { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
          { status: 500 },
        );
      }
    },
    {
      schedule: { type: "crontab", value: "40 3 * * 0" },
      checkinMargin: 5,
      maxRuntime: 55,
      timezone: "UTC",
    },
  );
}
