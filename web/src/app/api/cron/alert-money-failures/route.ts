/**
 * Cron — money-failure alert sweep.
 *
 * Endpoint: GET /api/cron/alert-money-failures  (CRON_SECRET bearer auth)
 *
 * Read-only sweep that fires Sentry alerts when money-adjacent failures are
 * detected. Three signals checked:
 *
 *   1. failed_engine_effects  — unresolved rows older than 1 h (engine pipeline
 *      failures that haven't been retried/resolved).
 *   2. booking_payouts        — rows in status='held' older than 24 h (payouts
 *      stuck because no connected account was found; held_payouts reconcile
 *      cron handles the fix, this alert flags escaping cases).
 *   3. booking_transactions   — rows in status='failed' created in the last 24 h
 *      (recent payment failures needing human review).
 *
 * No DB writes — pure read + Sentry alert. A Sentry alert is only emitted when
 * at least one signal fires so the dashboard stays signal-to-noise clean.
 *
 * Scheduled every 2 h in `web/vercel.json`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/alert-money-failures
 */

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/alert-money-failures", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Unresolved failed_engine_effects older than 1 h.
    const { data: staleFailed, error: staleFailedErr } = await admin
      .from("failed_engine_effects")
      .select("id, listener_name, engine_action, failed_step, created_at")
      .eq("resolved", false)
      .lt("created_at", oneHourAgo)
      .order("created_at", { ascending: true })
      .limit(50);
    if (staleFailedErr) throw staleFailedErr;

    // 2. Held payout legs older than 24 h.
    const { data: staleHeld, error: staleHeldErr } = await admin
      .from("booking_payouts")
      .select("id, party, talent_profile_id, tenant_id, created_at")
      .eq("status", "held")
      .lt("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: true })
      .limit(50);
    if (staleHeldErr) throw staleHeldErr;

    // 3. Failed booking_transactions in the last 24 h.
    const { data: recentFailedTxns, error: recentFailedTxnsErr } = await admin
      .from("booking_transactions")
      .select("id, source_tenant_id, status, failed_at, created_at")
      .eq("status", "failed")
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(50);
    if (recentFailedTxnsErr) throw recentFailedTxnsErr;

    const staleFailedCount = (staleFailed ?? []).length;
    const staleHeldCount = (staleHeld ?? []).length;
    const recentFailedTxnCount = (recentFailedTxns ?? []).length;
    const totalAlerts = staleFailedCount + staleHeldCount + recentFailedTxnCount;

    void improntaLog("money.cron.alert_sweep", {
      staleFailedEffects: staleFailedCount,
      staleHeldPayouts: staleHeldCount,
      recentFailedTransactions: recentFailedTxnCount,
    });

    if (totalAlerts > 0) {
      // Best-effort Sentry alert — must not throw.
      try {
        Sentry.captureMessage(
          `[money-failures] ${totalAlerts} alert(s): ${staleFailedCount} stale engine effects, ${staleHeldCount} held payouts >24h, ${recentFailedTxnCount} failed transactions`,
          {
            level: "error",
            extra: {
              staleFailedEffectIds: (staleFailed ?? []).map((r) => r.id),
              staleFailedEffectListeners: (staleFailed ?? []).map(
                (r) => `${r.listener_name}/${r.engine_action}/${r.failed_step}`,
              ),
              staleHeldPayoutIds: (staleHeld ?? []).map((r) => r.id),
              recentFailedTransactionIds: (recentFailedTxns ?? []).map((r) => r.id),
            },
            tags: {
              cron: "alert-money-failures",
              hasStaleEngineEffects: String(staleFailedCount > 0),
              hasStaleHeldPayouts: String(staleHeldCount > 0),
              hasFailedTransactions: String(recentFailedTxnCount > 0),
            },
          },
        );
      } catch {
        // Observability must not affect the response.
      }
    }

    return NextResponse.json({
      ok: true,
      staleFailedEffects: staleFailedCount,
      staleHeldPayouts: staleHeldCount,
      recentFailedTransactions: recentFailedTxnCount,
      alertsFired: totalAlerts > 0,
    });
  } catch (err) {
    logServerError("cron/alert-money-failures", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
