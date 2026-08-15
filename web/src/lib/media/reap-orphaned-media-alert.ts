import "server-only";

/**
 * reap-orphaned-media-alert.ts — making the reaper's weekly report reachable.
 *
 * THE PROBLEM (A10). The reaper produced a full report and returned it as the
 * HTTP response body. Vercel discards a cron response body. So the ONLY signal
 * that ever left the Function was `logServerError` on an aborted run: a healthy
 * run that would delete 40,000 objects looked exactly like one that would
 * delete none, and the dry run — whose entire purpose is to be read before
 * D-1 flips `MEDIA_REAPER_ENABLED` — was unreadable by design.
 *
 * Two fixes, both here:
 *   1. the numbers that matter (`wouldDelete`, `keptByReason`) go into the
 *      structured log, where they are greppable in Vercel's log drain;
 *   2. crossing a threshold emits a PLATFORM notification, so a run that is
 *      about to remove a lot of files pages someone instead of scrolling past.
 *
 * The threshold is deliberately about `wouldDelete`, not `deleted`: in dry run
 * nothing is deleted, and dry run is exactly when a human needs to look.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitNotification } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";
import { reapAlertBody } from "@/lib/media/reap-orphaned-media";
import type { ReapReport } from "@/lib/media/reap-orphaned-media-scan";

export {
  DEFAULT_REAP_ALERT_THRESHOLD,
  reapAlertBody,
  reapAlertThreshold,
  shouldAlertOnReapReport,
} from "@/lib/media/reap-orphaned-media";

/**
 * Emit the platform-surface notification. Best effort, exactly like every other
 * notification path: a reaper run must never fail because an insert did.
 *
 * `tenantId: null` is required for a platform alert — the dispatcher resolves
 * the platform brand from it, so any `/platform/admin/*` link points at the
 * platform host rather than some agency's custom domain.
 */
export async function notifyPlatformOfReapReport(
  admin: SupabaseClient,
  report: ReapReport,
): Promise<number> {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("app_role", "super_admin");
    if (error) {
      logServerError("media-reaper.alertLookup", error);
      return 0;
    }
    const userIds = [
      ...new Set(
        ((data ?? []) as Array<{ id: string | null }>)
          .map((r) => r.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    await Promise.all(
      userIds.map((userId) =>
        emitNotification({
          userId,
          tenantId: null,
          kind: "system",
          surface: "platform",
          title: `Storage reaper flagged ${report.wouldDelete.count} orphaned objects`,
          body: reapAlertBody(report),
        }),
      ),
    );
    return userIds.length;
  } catch (err) {
    logServerError("media-reaper.alert", err);
    return 0;
  }
}
