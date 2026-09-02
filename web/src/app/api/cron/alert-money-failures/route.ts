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
 *   4. provider_payouts       — payouts Stripe reports as FAILED in the last
 *      24 h. Money that did not arrive, on the platform's own bank account or a
 *      talent's. Nothing surfaced these before the payout table existed.
 *   5. UNATTRIBUTED PAID TIERS — a workspace or talent sitting on a paid tier
 *      with NO Stripe subscription and NO active plan override. Somebody set
 *      the tier directly, so there is no record of who granted it, why, or when
 *      it should end, and the override-expiry sweep cannot reach it because
 *      there is no override to expire. Three workspaces were in this state when
 *      the finance audit ran. This is deliberately DETECTION only: which of
 *      these are legitimate forever-comps (the platform's own workspace, say)
 *      and which are drift is a decision for the owner, not for a cron.
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

    // 4. Payouts Stripe reports as failed in the last 24 h. This is the signal
    //    that catches the platform's own bank account rejecting a payout — the
    //    account's external account has been in `verification_failed` and
    //    nothing anywhere would have noticed the first failure.
    const { data: failedPayouts, error: failedPayoutsErr } = await admin
      .from("provider_payouts")
      .select("id, stripe_payout_id, stripe_account_id, amount_cents, currency, failure_code, updated_at")
      .eq("status", "failed")
      .gte("updated_at", twentyFourHoursAgo)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (failedPayoutsErr) throw failedPayoutsErr;

    // 5. Paid tier with nothing governing it — no subscription, no active
    //    override. Read-only: the point is to make the state visible and
    //    attributable, not to strip anybody's plan.
    const { data: paidAgencies, error: paidAgenciesErr } = await admin
      .from("agencies")
      .select("id, slug, plan_tier")
      .not("plan_tier", "is", null)
      .neq("plan_tier", "free")
      .limit(200);
    if (paidAgenciesErr) throw paidAgenciesErr;

    const paidAgencyIds = (paidAgencies ?? []).map((r) => r.id as string);
    let unattributedTenants: Array<{ id: string; slug: string; plan: string }> = [];
    if (paidAgencyIds.length > 0) {
      const [{ data: subRows }, { data: overrideRows }] = await Promise.all([
        admin.from("workspace_subscriptions").select("tenant_id").in("tenant_id", paidAgencyIds),
        admin
          .from("workspace_plan_overrides")
          .select("tenant_id")
          .eq("status", "active")
          .in("tenant_id", paidAgencyIds),
      ]);
      const governed = new Set<string>([
        ...(subRows ?? []).map((r) => String((r as { tenant_id: string }).tenant_id)),
        ...(overrideRows ?? []).map((r) => String((r as { tenant_id: string }).tenant_id)),
      ]);
      unattributedTenants = (paidAgencies ?? [])
        .filter((r) => !governed.has(String(r.id)))
        .map((r) => ({
          id: String(r.id),
          slug: String(r.slug ?? ""),
          plan: String(r.plan_tier ?? ""),
        }));
    }

    // Same check on the talent side — `talent_plan_overrides` is the mirror of
    // the workspace table, so an ungoverned talent plan is the same defect and
    // is worth the same visibility. All six paid talents were in this state
    // when the finance audit ran.
    const { data: paidTalents, error: paidTalentsErr } = await admin
      .from("talent_profiles")
      .select("id, talent_plan_key")
      .not("talent_plan_key", "is", null)
      .neq("talent_plan_key", "talent_basic")
      .limit(500);
    if (paidTalentsErr) throw paidTalentsErr;

    const paidTalentIds = (paidTalents ?? []).map((r) => r.id as string);
    let unattributedTalents: Array<{ id: string; plan: string }> = [];
    if (paidTalentIds.length > 0) {
      const [{ data: tSubs }, { data: tOverrides }] = await Promise.all([
        admin.from("talent_subscriptions").select("talent_profile_id").in("talent_profile_id", paidTalentIds),
        admin
          .from("talent_plan_overrides")
          .select("talent_profile_id")
          .eq("status", "active")
          .in("talent_profile_id", paidTalentIds),
      ]);
      const governedTalents = new Set<string>([
        ...(tSubs ?? []).map((r) => String((r as { talent_profile_id: string }).talent_profile_id)),
        ...(tOverrides ?? []).map((r) => String((r as { talent_profile_id: string }).talent_profile_id)),
      ]);
      unattributedTalents = (paidTalents ?? [])
        .filter((r) => !governedTalents.has(String(r.id)))
        .map((r) => ({ id: String(r.id), plan: String(r.talent_plan_key ?? "") }));
    }

    const staleFailedCount = (staleFailed ?? []).length;
    const staleHeldCount = (staleHeld ?? []).length;
    const recentFailedTxnCount = (recentFailedTxns ?? []).length;
    const failedPayoutCount = (failedPayouts ?? []).length;
    const unattributedTenantCount = unattributedTenants.length;
    const unattributedTalentCount = unattributedTalents.length;
    const totalAlerts =
      staleFailedCount + staleHeldCount + recentFailedTxnCount + failedPayoutCount;

    void improntaLog("money.cron.alert_sweep", {
      staleFailedEffects: staleFailedCount,
      staleHeldPayouts: staleHeldCount,
      recentFailedTransactions: recentFailedTxnCount,
      failedPayouts: failedPayoutCount,
      unattributedPaidTenants: unattributedTenantCount,
      unattributedPaidTalents: unattributedTalentCount,
    });

    if (totalAlerts > 0) {
      // Best-effort Sentry alert — must not throw.
      try {
        Sentry.captureMessage(
          `[money-failures] ${totalAlerts} alert(s): ${staleFailedCount} stale engine effects, ${staleHeldCount} held payouts >24h, ${recentFailedTxnCount} failed transactions, ${failedPayoutCount} failed payouts`,
          {
            level: "error",
            extra: {
              staleFailedEffectIds: (staleFailed ?? []).map((r) => r.id),
              staleFailedEffectListeners: (staleFailed ?? []).map(
                (r) => `${r.listener_name}/${r.engine_action}/${r.failed_step}`,
              ),
              staleHeldPayoutIds: (staleHeld ?? []).map((r) => r.id),
              recentFailedTransactionIds: (recentFailedTxns ?? []).map((r) => r.id),
              failedPayoutIds: (failedPayouts ?? []).map((r) => r.stripe_payout_id),
              failedPayoutReasons: (failedPayouts ?? []).map(
                (r) => `${r.stripe_payout_id}: ${r.failure_code ?? "no code"} (${r.amount_cents} ${r.currency})`,
              ),
            },
            tags: {
              cron: "alert-money-failures",
              hasStaleEngineEffects: String(staleFailedCount > 0),
              hasStaleHeldPayouts: String(staleHeldCount > 0),
              hasFailedTransactions: String(recentFailedTxnCount > 0),
              hasFailedPayouts: String(failedPayoutCount > 0),
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
      failedPayouts: failedPayoutCount,
      unattributedPaidTenants: unattributedTenantCount,
      unattributedPaidTenantSlugs: unattributedTenants.map((t) => `${t.slug}:${t.plan}`),
      unattributedPaidTalents: unattributedTalentCount,
      alertsFired: totalAlerts > 0,
    });
  } catch (err) {
    logServerError("cron/alert-money-failures", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
