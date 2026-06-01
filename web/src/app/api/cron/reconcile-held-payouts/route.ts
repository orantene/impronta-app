/**
 * Cron — held-payouts reconciliation sweep.
 *
 * Endpoint: GET /api/cron/reconcile-held-payouts  (CRON_SECRET bearer auth)
 *
 * Backstop for the account.updated release path: scans `booking_payouts` rows
 * still in status='held', and for each distinct payee whose connected account
 * is NOW transfer-enabled, re-attempts the held legs (reusing the original
 * Stripe idempotency key, so no double-pay). Catches the case where the
 * account.updated webhook was missed or fired before the account was enabled.
 *
 * Scheduled daily in `web/vercel.json`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/reconcile-held-payouts
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { releaseHeldPayouts } from "@/lib/payments/booking-payouts-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/reconcile-held-payouts", "CRON_SECRET not set; refusing to run");
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
    // Distinct held payees: talents + workspaces with at least one held leg.
    const { data: held, error } = await admin
      .from("booking_payouts")
      .select("party, talent_profile_id, tenant_id")
      .eq("status", "held");
    if (error) throw error;

    const talentIds = new Set<string>();
    const tenantIds = new Set<string>();
    for (const r of (held ?? []) as Array<{ party: string; talent_profile_id: string | null; tenant_id: string | null }>) {
      if (r.party === "talent" && r.talent_profile_id) talentIds.add(r.talent_profile_id);
      else if (r.party === "workspace" && r.tenant_id) tenantIds.add(r.tenant_id);
    }

    let released = 0;
    let stillHeld = 0;
    let failed = 0;
    for (const talentProfileId of talentIds) {
      const out = await releaseHeldPayouts({ talentProfileId }, { sb: admin });
      for (const o of out) {
        if (o.result === "released") released++;
        else if (o.result === "still_held") stillHeld++;
        else failed++;
      }
    }
    for (const tenantId of tenantIds) {
      const out = await releaseHeldPayouts({ tenantId }, { sb: admin });
      for (const o of out) {
        if (o.result === "released") released++;
        else if (o.result === "still_held") stillHeld++;
        else failed++;
      }
    }

    const result = { payees: talentIds.size + tenantIds.size, released, stillHeld, failed };
    void improntaLog("payouts.cron.reconcile", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/reconcile-held-payouts", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
