/**
 * lib/stripe/talent-billing.ts
 *
 * Server-only billing operations for talent personal-page subscriptions.
 *
 * Mirrors workspace-billing.ts but keyed on talent profile / user rather than
 * tenant. Talent subscriptions are independent from workspace billing — the
 * talent pays the platform directly for enhanced page presentation.
 *
 * Tables: talent_stripe_customers + talent_subscriptions (Phase 8.2 migration).
 * talent_profiles.talent_plan_key is synced by syncTalentSubscriptionToDb().
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { getTalentPriceId, type TalentPlanKey } from "@/lib/stripe/price-ids";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";
import type { BillingResult } from "@/lib/stripe/workspace-billing";

// Re-export BillingResult so callers can import from one place.
export type { BillingResult };

// ─── Types ────────────────────────────────────────────────────────────────────

export type TalentSubscriptionState = {
  talentProfileId: string;
  userId: string;
  planKey: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  trialEnd: string | null;
  stripePriceId: string | null;
};

// ─── Customer management ──────────────────────────────────────────────────────

/**
 * Returns the Stripe customer ID for a talent user, creating one if needed.
 * Keyed by auth.users.id (not talent_profile_id) — one customer per user.
 */
export async function getOrCreateTalentStripeCustomer(
  userId: string,
  email: string,
  displayName: string,
): Promise<BillingResult<string>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const { data: existing } = await sb
      .from("talent_stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.stripe_customer_id) {
      return { ok: true, data: existing.stripe_customer_id };
    }

    const customer = await stripe.customers.create({
      email,
      name: displayName,
      metadata: { user_id: userId, customer_type: "talent" },
    });

    const { error } = await sb.from("talent_stripe_customers").insert({
      user_id: userId,
      stripe_customer_id: customer.id,
      billing_email: email,
    });
    if (error) {
      logServerError("talent-billing.getOrCreateCustomer.insert", error);
    }

    return { ok: true, data: customer.id };
  } catch (err) {
    logServerError("talent-billing.getOrCreateCustomer", err);
    return { ok: false, error: "Could not set up billing account." };
  }
}

// ─── Checkout session ─────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session for a talent upgrading their personal page.
 *
 * The checkout metadata carries talent_profile_id + user_id + plan_key so the
 * webhook handler can sync the subscription back to the right profile row.
 */
export async function createTalentCheckoutSession(opts: {
  talentProfileId: string;
  userId: string;
  planKey: TalentPlanKey;
  email: string;
  displayName: string;
  tenantSlug: string;
  appBaseUrl: string;
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;

  const priceId = getTalentPriceId(opts.planKey, "monthly");
  if (!priceId) {
    return { ok: false, error: `No Stripe price configured for plan "${opts.planKey}".` };
  }

  const customerResult = await getOrCreateTalentStripeCustomer(
    opts.userId,
    opts.email,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerResult.data,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/talent/settings?billing=success`,
      cancel_url:  `${opts.appBaseUrl}/${opts.tenantSlug}/talent/settings?billing=cancelled`,
      metadata: {
        talent_profile_id: opts.talentProfileId,
        user_id:           opts.userId,
        plan_key:          opts.planKey,
        checkout_type:     "talent_subscription",
      },
      subscription_data: {
        metadata: {
          talent_profile_id: opts.talentProfileId,
          user_id:           opts.userId,
          plan_key:          opts.planKey,
          checkout_type:     "talent_subscription",
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }

    return { ok: true, data: { url: session.url } };
  } catch (err) {
    logServerError("talent-billing.createCheckoutSession", err);
    return { ok: false, error: "Could not create checkout session." };
  }
}

// ─── Billing portal ───────────────────────────────────────────────────────────

/**
 * Creates a Stripe Billing Portal session for an existing talent subscriber.
 */
export async function createTalentBillingPortalSession(opts: {
  userId: string;
  tenantSlug: string;
  appBaseUrl: string;
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    const { data: customer } = await sb
      .from("talent_stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", opts.userId)
      .maybeSingle();

    if (!customer?.stripe_customer_id) {
      return { ok: false, error: "No billing account found." };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${opts.appBaseUrl}/${opts.tenantSlug}/talent/settings`,
    });

    return { ok: true, data: { url: session.url } };
  } catch (err) {
    logServerError("talent-billing.createPortalSession", err);
    return { ok: false, error: "Could not open billing portal." };
  }
}

// ─── Webhook sync ─────────────────────────────────────────────────────────────

/**
 * Syncs a Stripe Subscription (talent type) to talent_subscriptions +
 * updates talent_profiles.talent_plan_key.
 *
 * Called by the webhook handler when checkout_type === "talent_subscription".
 * Uses service-role client to bypass RLS.
 */
export async function syncTalentSubscriptionToDb(
  subscription: Stripe.Subscription,
  planKey: string,
): Promise<BillingResult<void>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const talentProfileId = subscription.metadata?.talent_profile_id;
  const userId = subscription.metadata?.user_id;

  if (!talentProfileId || !userId) {
    return {
      ok: false,
      error: "Talent subscription missing talent_profile_id or user_id metadata.",
    };
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const cancelledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : null;

  const status = mapStripeStatus(subscription.status);
  const newPlanKey =
    status === "cancelled" || status === "incomplete_expired"
      ? "talent_basic"
      : planKey;

  try {
    const { error: subError } = await sb
      .from("talent_subscriptions")
      .upsert(
        {
          talent_profile_id:      talentProfileId,
          user_id:                userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id:     customerId,
          plan_key:               planKey === "talent_basic" ? "talent_pro" : planKey,
          status,
          current_period_end:     periodEnd,
          cancel_at_period_end:   subscription.cancel_at_period_end ?? false,
          cancelled_at:           cancelledAt,
          trial_end:              trialEnd,
          stripe_price_id:        priceId,
          updated_at:             new Date().toISOString(),
        },
        { onConflict: "talent_profile_id" },
      );

    if (subError) {
      logServerError("talent-billing.syncSubscription.upsert", subError);
      return { ok: false, error: "Failed to update talent subscription record." };
    }

    // Sync talent_profiles.talent_plan_key
    const { error: profileError } = await sb
      .from("talent_profiles")
      .update({
        talent_plan_key: newPlanKey,
        updated_at:      new Date().toISOString(),
      })
      .eq("id", talentProfileId);

    if (profileError) {
      logServerError("talent-billing.syncSubscription.planKey", profileError);
    }

    // Ensure talent_stripe_customers row exists
    await sb
      .from("talent_stripe_customers")
      .upsert(
        { user_id: userId, stripe_customer_id: customerId },
        { onConflict: "user_id" },
      );

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("talent-billing.syncSubscription", err);
    return { ok: false, error: "Unexpected error syncing talent subscription." };
  }
}

// ─── State reader ─────────────────────────────────────────────────────────────

/**
 * Load the current talent subscription state for a profile.
 * Returns null when the talent is on Basic (free — no subscription row).
 * Uses the passed Supabase client (user's RLS context).
 */
export async function loadTalentSubscriptionState(
  talentProfileId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<TalentSubscriptionState | null> {
  try {
    const { data, error } = await supabase
      .from("talent_subscriptions")
      .select("*")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();

    if (error) {
      logServerError("talent-billing.loadState", error);
      return null;
    }
    if (!data) return null;

    type Row = {
      talent_profile_id: string;
      user_id: string;
      plan_key: string;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      cancelled_at: string | null;
      trial_end: string | null;
      stripe_price_id: string | null;
    };
    const row = data as unknown as Row;
    return {
      talentProfileId: row.talent_profile_id,
      userId: row.user_id,
      planKey: row.plan_key,
      status: row.status,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      cancelledAt: row.cancelled_at,
      trialEnd: row.trial_end,
      stripePriceId: row.stripe_price_id,
    };
  } catch (err) {
    logServerError("talent-billing.loadState", err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AllowedStatus =
  | "trialing" | "active" | "past_due" | "cancelled"
  | "paused" | "incomplete" | "incomplete_expired";

function mapStripeStatus(stripeStatus: string): AllowedStatus {
  const ALLOWED = new Set<string>([
    "trialing", "active", "past_due", "paused", "incomplete", "incomplete_expired",
  ]);
  if (ALLOWED.has(stripeStatus)) return stripeStatus as AllowedStatus;
  if (stripeStatus === "canceled") return "cancelled";
  return "incomplete";
}
