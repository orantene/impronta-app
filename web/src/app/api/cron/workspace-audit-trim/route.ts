import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * Scheduled job: trim the Workspace Activity Log so it cannot grow unbounded.
 *
 * Calls `public.workspace_audit_events_trim(retain_days, max_rows_per_tenant)`
 * (SECURITY DEFINER, service-role only): deletes events older than 180 days,
 * then caps every tenant at its newest 50k rows. Both bounds live in the SQL
 * function's defaults — pass args here if they ever need tuning.
 *
 * Auth: same contract as the other cron routes — Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
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
    void improntaLog("workspace_audit_trim.done", {
      deletedByAge: (result as { deleted_by_age?: number } | null)?.deleted_by_age ?? 0,
      deletedByCap: (result as { deleted_by_cap?: number } | null)?.deleted_by_cap ?? 0,
    });
    return NextResponse.json({ ok: true, result: result ?? null });
  });
}
