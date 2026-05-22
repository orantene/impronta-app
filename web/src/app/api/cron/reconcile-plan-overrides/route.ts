import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Scheduled job — reconcile expired workspace plan overrides.
 *
 * Calls public.reconcile_expired_plan_overrides() (SECURITY DEFINER,
 * idempotent): for every active override whose expires_at has passed it
 * reverts agencies.plan_tier / talent_seat_limit to the base snapshot — or
 * to a live paid subscription's plan if one exists — and marks the override
 * row 'expired'.
 *
 * The platform tenant list and each workspace's own plan loader already call
 * this reconcile lazily; this daily sweep guarantees that a *dormant*
 * workspace (one nobody has opened) also drops back on time when its comp /
 * trial override lapses.
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/reconcile-plan-overrides
 *
 * Configured in `vercel.json`:
 *   "crons": [
 *     { "path": "/api/cron/reconcile-plan-overrides", "schedule": "0 3 * * *" }
 *   ]
 * (Daily 03:00 UTC — override expiry is day-granular, so daily is ample.)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError(
      "cron/reconcile-plan-overrides",
      "CRON_SECRET env var not set; refusing to run",
    );
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const startedAt = Date.now();
    const { data, error } = await supabase.rpc(
      "reconcile_expired_plan_overrides",
      { p_tenant_id: null },
    );
    if (error) {
      logServerError("cron/reconcile-plan-overrides.rpc", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const reconciled = typeof data === "number" ? data : 0;
    return NextResponse.json({
      ok: true,
      reconciled,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logServerError("cron/reconcile-plan-overrides", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
