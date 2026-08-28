import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { notifyDiscountEnding } from "@/lib/notifications/producers/trial-notify";
import { selectDiscountsEndingSoon, type SubscriptionDiscountRow } from "@/lib/billing/discount-ending-window";

/**
 * Scheduled job — warn accounts whose subscription discount is about to lapse.
 *
 * WHY A CRON AND NOT A WEBHOOK: Stripe fires `customer.subscription.trial_will_end`
 * before a trial converts, but emits NOTHING before a coupon expires. A
 * "two months free" offer simply produces a larger invoice in month three with
 * no prior signal. That silence is the most common way a generous campaign
 * turns into refund requests and cancellations, so the warning has to be swept
 * for rather than reacted to.
 *
 * It reads the discount_ends_at columns the webhook sync mirrors onto
 * workspace_subscriptions / talent_subscriptions, so it needs no Stripe call.
 *
 * Safe to run daily inside the whole window: the producer's eventId is keyed on
 * (subscription, end date) and the dispatch_log unique index collapses repeats
 * to a single send.
 *
 * Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/discount-ending-warnings
 *
 * Configured in `vercel.json`:
 *   { "path": "/api/cron/discount-ending-warnings", "schedule": "0 9 * * *" }
 * (Daily 09:00 UTC — discount expiry is day-granular, and a morning send beats
 * a 3am one for something a human is meant to read.)
 */
export const dynamic = "force-dynamic";

/** How many days ahead of the lapse we warn. */
const WARN_WITHIN_DAYS = 3;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/discount-ending-warnings", "CRON_SECRET env var not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const now = new Date();
  let notified = 0;

  try {
    const [workspaceRows, talentRows] = await Promise.all([
      supabase
        .from("workspace_subscriptions")
        .select("tenant_id, stripe_subscription_id, plan_key, status, discount_ends_at")
        .not("discount_ends_at", "is", null)
        .in("status", ["active", "past_due", "trialing"]),
      supabase
        .from("talent_subscriptions")
        .select("talent_profile_id, stripe_subscription_id, plan_key, status, discount_ends_at")
        .not("discount_ends_at", "is", null)
        .in("status", ["active", "past_due", "trialing"]),
    ]);

    if (workspaceRows.error) logServerError("cron/discount-ending-warnings.workspace", workspaceRows.error);
    if (talentRows.error) logServerError("cron/discount-ending-warnings.talent", talentRows.error);

    const workspaceDue = selectDiscountsEndingSoon(
      (workspaceRows.data ?? []) as SubscriptionDiscountRow[],
      now,
      WARN_WITHIN_DAYS,
    );
    const talentDue = selectDiscountsEndingSoon(
      (talentRows.data ?? []) as SubscriptionDiscountRow[],
      now,
      WARN_WITHIN_DAYS,
    );

    for (const row of workspaceDue) {
      if (!row.stripe_subscription_id) continue;
      await notifyDiscountEnding({
        scope: "workspace",
        tenantId: row.tenant_id ?? null,
        talentProfileId: null,
        subscriptionId: row.stripe_subscription_id,
        planKey: row.plan_key ?? null,
        discountEndsIso: row.discount_ends_at,
        nextAmountLabel: null,
      });
      notified++;
    }

    for (const row of talentDue) {
      if (!row.stripe_subscription_id) continue;
      await notifyDiscountEnding({
        scope: "talent",
        tenantId: null,
        talentProfileId: row.talent_profile_id ?? null,
        subscriptionId: row.stripe_subscription_id,
        planKey: row.plan_key ?? null,
        discountEndsIso: row.discount_ends_at,
        nextAmountLabel: null,
      });
      notified++;
    }

    return NextResponse.json({
      ok: true,
      windowDays: WARN_WITHIN_DAYS,
      scanned: (workspaceRows.data?.length ?? 0) + (talentRows.data?.length ?? 0),
      notified,
    });
  } catch (err) {
    logServerError("cron/discount-ending-warnings", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
