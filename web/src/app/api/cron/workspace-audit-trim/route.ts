import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * Scheduled job: trim the append-only audit tables so they cannot grow unbounded.
 *
 * TWO tables, two horizons, one cron (batch C / C10 — deliberately folded in
 * here rather than adding another schedule):
 *
 *  1. `workspace_audit_events` — via
 *     `public.workspace_audit_events_trim(retain_days, max_rows_per_tenant)`
 *     (SECURITY DEFINER, service-role only): deletes events older than 180 days,
 *     then caps every tenant at its newest 50k rows. Both bounds live in the SQL
 *     function's defaults — pass args here if they ever need tuning.
 *
 *  2. `media_asset_activity` — the per-asset media audit trail, which had NO
 *     retention job at all. Its `payload` carries actor user ids indefinitely,
 *     so it needs a horizon even though it is tiny today. Trimmed here with a
 *     plain service-role DELETE (no SECURITY DEFINER helper exists and this
 *     batch does not own migrations) on a deliberately LONG horizon — this is a
 *     provenance trail for ownership/release disputes, so 24 months, not 180
 *     days. Rows are also removed by cascade when their asset or tenant is
 *     deleted; this only handles rows whose asset is still alive.
 *
 * Auth: same contract as the other cron routes — Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`.
 */

/**
 * Retention horizon for `media_asset_activity`, in months. Long on purpose: the
 * trail is evidence for a media ownership claim or a release dispute, and the
 * objection/claim windows are measured in weeks, not years. Raise deliberately.
 */
const MEDIA_ACTIVITY_RETAIN_MONTHS = 24;

function mediaActivityCutoffIso(now: Date = new Date()): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MEDIA_ACTIVITY_RETAIN_MONTHS);
  return cutoff.toISOString();
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/workspace-audit-trim", "CRON_SECRET env var not set; refusing to run");
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

  return await Sentry.withMonitor("workspace-audit-trim", async () => {
    const { data, error } = await supabase.rpc("workspace_audit_events_trim");
    if (error) {
      logServerError("cron/workspace-audit-trim", error);
      return NextResponse.json({ error: "Trim failed" }, { status: 500 });
    }
    const result = Array.isArray(data) ? data[0] : data;

    // media_asset_activity, 24-month horizon. Runs AFTER the primary trim and
    // reports its own outcome: a failure here must be visible (not swallowed)
    // but must not make the workspace-audit trim look like it did not happen.
    const mediaCutoff = mediaActivityCutoffIso();
    const { count: mediaDeleted, error: mediaError } = await supabase
      .from("media_asset_activity")
      .delete({ count: "exact" })
      .lt("created_at", mediaCutoff);
    if (mediaError) {
      logServerError("cron/workspace-audit-trim:media_asset_activity", mediaError);
    }

    void improntaLog("workspace_audit_trim.done", {
      deletedByAge: (result as { deleted_by_age?: number } | null)?.deleted_by_age ?? 0,
      deletedByCap: (result as { deleted_by_cap?: number } | null)?.deleted_by_cap ?? 0,
      mediaActivityDeleted: mediaError ? null : (mediaDeleted ?? 0),
      mediaActivityRetainMonths: MEDIA_ACTIVITY_RETAIN_MONTHS,
      mediaActivityCutoff: mediaCutoff,
      mediaActivityError: mediaError ? mediaError.message : null,
    });

    return NextResponse.json({
      ok: !mediaError,
      result: result ?? null,
      mediaAssetActivity: mediaError
        ? { ok: false, error: "Media activity trim failed", cutoff: mediaCutoff }
        : { ok: true, deleted: mediaDeleted ?? 0, cutoff: mediaCutoff },
    });
  });
}
