import "server-only";

/**
 * TUL-1601 · The I/O side of automatic monthly rent: the webhook apply deps, and keeping the Stripe subscription in
 * step with the plan (ended -> cancelled now, paused -> collection paused, active -> resumed), on the platform the
 * subscription lives on (the studio's: US or MX, TUL-1610). Every call is tenant-scoped and fail-soft toward NOT charging.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { afterResponse } from "@/lib/server/after-response";
import { logServerError } from "@/lib/server/safe-error";
import { getStripeFor, type StripeAccountKey } from "@/lib/stripe/client";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { applyRentSubscriptionEvent, type ApplyOutcome, type RentAutopayApplyDeps } from "./rent-autopay-apply";
import type { RentSubscriptionEvent } from "./rent-autopay-routing";

export async function cancelRentSubscription(subscriptionId: string, platform: StripeAccountKey = "us"): Promise<boolean> {
  const stripe = getStripeFor(platform);
  if (!stripe) return false;
  try {
    // Ended now: no proration, no refund of a month already paid, no further invoices.
    await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
    return true;
  } catch (err) {
    logServerError("rent.autopay.cancel", err);
    return false;
  }
}

function buildApplyDeps(admin: SupabaseClient, account: StripeAccountKey): RentAutopayApplyDeps {
  return {
    async loadPlan(planId, tenantId) {
      const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId)
        .select("status, autopay_status, stripe_subscription_id, talent_profile_id")
        .eq("id", planId)
        .maybeSingle();
      if (error || !data) return null;
      const r = data as { status: string; autopay_status: string; stripe_subscription_id: string | null; talent_profile_id: string };
      return { status: r.status, autopayStatus: r.autopay_status, subscriptionId: r.stripe_subscription_id, talentProfileId: r.talent_profile_id };
    },
    async setAutopay(planId, tenantId, patch) {
      const { error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId)
        .update({
          autopay_status: patch.autopayStatus,
          ...(patch.subscriptionId !== undefined ? { stripe_subscription_id: patch.subscriptionId } : {}),
          ...(patch.clearFirstPeriod ? { autopay_first_period: null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", planId);
      if (error) logServerError("rent.autopay.setAutopay", error);
      return !error;
    },
    async loadInvoice(planId, tenantId, period) {
      const { data } = await tenantScopedQuery(admin, "studio_rent_invoices", tenantId)
        .select("status, stripe_invoice_id, source")
        .eq("plan_id", planId)
        .eq("period", period)
        .maybeSingle();
      const r = data as { status: string; stripe_invoice_id: string | null; source: string } | null;
      return r ? { status: r.status, stripeInvoiceId: r.stripe_invoice_id, source: r.source } : null;
    },
    async writeInvoice(row) {
      const { error } = await tenantScopedQuery(admin, "studio_rent_invoices", row.tenantId).upsert(
        {
          plan_id: row.planId,
          talent_profile_id: row.talentProfileId,
          period: row.period,
          amount_cents: row.amountCents,
          currency: row.currency,
          status: row.status,
          source: "autopay",
          stripe_invoice_id: row.stripeInvoiceId,
          ...(row.status === "paid" ? { paid_at: new Date().toISOString() } : {}),
        },
        { onConflict: "plan_id,period" },
      );
      if (error) logServerError("rent.autopay.writeInvoice", error);
      return !error;
    },
    // The event arrived on the platform the subscription lives on.
    cancelSubscription: (id) => cancelRentSubscription(id, account),
    async notify(kind, p) {
      try {
        const [{ data: tp }, { data: ag }] = await Promise.all([
          admin.from("talent_profiles").select("user_id").eq("id", p.talentProfileId).maybeSingle(),
          admin.from("agencies").select("display_name").eq("id", p.tenantId).maybeSingle(),
        ]);
        const userId = (tp as { user_id?: string | null } | null)?.user_id ?? null;
        if (!userId) return;
        afterResponse(() =>
          dispatchEventNotifications({
            type: kind === "autopay_failed" ? "rent.autopay_failed" : "rent.autopay_canceled",
            tenantId: p.tenantId,
            userId,
            eventId: `rent-autopay:${p.planId}:${kind}:${p.period ?? "plan"}`,
            payload: {
              workspaceName: (ag as { display_name?: string | null } | null)?.display_name ?? null,
              period: p.period ?? null,
              rentUrl: `${getAppUrl()}/talent/rent-proposals`,
            },
          }).catch((err) => logServerError("rent.autopay.notify", err)),
        );
      } catch (err) {
        logServerError("rent.autopay.notify", err);
      }
    },
    alert(detail) {
      logServerError("rent.autopay.doublePayment", new Error(detail));
    },
  };
}

/** Webhook entry: apply one classified rent-subscription event. Never throws. */
export async function handleRentSubscriptionEvent(admin: SupabaseClient, ev: RentSubscriptionEvent, account: StripeAccountKey = "us"): Promise<ApplyOutcome> {
  try {
    return await applyRentSubscriptionEvent(ev, buildApplyDeps(admin, account));
  } catch (err) {
    logServerError("rent.autopay.handle", err);
    return "unavailable";
  }
}

/**
 * Keep the subscription in step with the plan, and tell Stripe FIRST: the caller changes the plan only when this
 * returns ok, so a Stripe failure can never leave a plan ended while the member keeps being charged.
 * ended: cancelled now. paused: collection paused (invoices voided, nothing charged). active: collection resumed.
 * A plan with no live subscription is ok. A live subscription with no Stripe client is NOT ok.
 */
export async function syncRentAutopayWithPlan(
  admin: SupabaseClient,
  p: { tenantId: string; planId: string; planStatus: "active" | "paused" | "ended" },
  deps: { stripeFor?: (k: StripeAccountKey) => Stripe | null } = {},
): Promise<{ ok: boolean }> {
  try {
    const { data } = await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId)
      .select("stripe_subscription_id, autopay_status, autopay_platform")
      .eq("id", p.planId)
      .maybeSingle();
    const r = data as { stripe_subscription_id: string | null; autopay_status: string; autopay_platform: StripeAccountKey | null } | null;
    const platform: StripeAccountKey = r?.autopay_platform === "mx" ? "mx" : "us";
    if (!r?.stripe_subscription_id || r.autopay_status === "off" || r.autopay_status === "canceled") return { ok: true };
    const stripe = (deps.stripeFor ?? getStripeFor)(platform);
    if (!stripe) return { ok: false };
    if (p.planStatus === "ended") {
      await stripe.subscriptions.cancel(r.stripe_subscription_id, { invoice_now: false, prorate: false });
      await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).update({ autopay_status: "canceled" }).eq("id", p.planId);
      return { ok: true };
    }
    await stripe.subscriptions.update(r.stripe_subscription_id, {
      pause_collection: p.planStatus === "paused" ? { behavior: "void" } : "",
    });
    return { ok: true };
  } catch (err) {
    logServerError("rent.autopay.sync", err);
    return { ok: false };
  }
}
