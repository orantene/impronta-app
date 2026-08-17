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
import { mapStripeStatus } from "@/lib/stripe/utils";
import { notifyTrialStarted } from "@/lib/notifications/producers/trial-notify";
import {
  stripeBillingPortalLocale,
  stripeCheckoutLocale,
} from "@/lib/i18n/vendor-locale";
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

    // Audit C6 — race fix: if a concurrent call won the insert race, our
    // freshly-created Stripe customer is now an orphan. Delete it and
    // return the winner's customer id.
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        try {
          await stripe.customers.del(customer.id);
        } catch (delErr) {
          logServerError("talent-billing.getOrCreateCustomer.deleteOrphan", delErr);
        }
        const { data: winner } = await sb
          .from("talent_stripe_customers")
          .select("stripe_customer_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (winner?.stripe_customer_id) {
          return { ok: true, data: winner.stripe_customer_id };
        }
        return { ok: false, error: "Could not acquire Stripe customer record." };
      }
      // Non-uniqueness error: log and bail. Don't return the orphaned
      // Stripe customer id because subsequent calls won't find it in the DB.
      logServerError("talent-billing.getOrCreateCustomer.insert", error);
      try {
        await stripe.customers.del(customer.id);
      } catch (delErr) {
        logServerError("talent-billing.getOrCreateCustomer.deleteOnInsertFail", delErr);
      }
      return { ok: false, error: "Could not record Stripe customer locally." };
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
  /**
   * The talent's resolved app locale (`getRequestLocale()`), threaded from the
   * calling server action. Without it Stripe reads the BROWSER language, so a
   * Mexican talent running Tulala in Spanish on an English browser pays through
   * an English form. Absent / unmappable -> the parameter is omitted and Stripe
   * keeps its own default.
   */
  locale?: string | null;
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
      // Show Checkout in the talent's app language, not their browser's.
      locale: stripeCheckoutLocale(opts.locale),
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
      // Adaptive Pricing: auto-converts to customer's local currency at checkout.
      adaptive_pricing: { enabled: true },
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
  /** Resolved app locale, threaded from the caller. See the checkout helper. */
  locale?: string | null;
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
      locale: stripeBillingPortalLocale(opts.locale),
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
  const isTerminallyCancelled = status === "cancelled" || status === "incomplete_expired";
  const newPlanKey = isTerminallyCancelled ? "talent_basic" : planKey;

  try {
    // Audit H2 — guard against out-of-order webhook deliveries: if the
    // existing row is already in a terminal state, a stale 'updated'
    // event for the same subscription must NOT re-promote the talent.
    // We also short-circuit when the existing row's status is more recent
    // than what this event is asking us to write.
    const { data: existingRow } = await sb
      .from("talent_subscriptions")
      .select("status, plan_key, updated_at")
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();

    const existingStatus = (existingRow as { status?: string } | null)?.status;
    if (
      existingStatus === "cancelled" || existingStatus === "incomplete_expired"
    ) {
      if (!isTerminallyCancelled) {
        // The DB says the subscription is already terminal, but this event
        // wants to bring it back to active. That's almost certainly a stale
        // delivery. Log and skip the upsert; profile plan stays talent_basic.
        logServerError(
          "talent-billing.syncSubscription.staleEvent",
          `subscription ${subscription.id} already terminal=${existingStatus}, refusing to re-promote to status=${status}`,
        );
        return { ok: true, data: undefined };
      }
    }

    const { error: subError } = await sb
      .from("talent_subscriptions")
      .upsert(
        {
          talent_profile_id:      talentProfileId,
          user_id:                userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id:     customerId,
          // Audit H2: when terminally cancelled, write the LAST plan tier
          // we knew about so the row's plan_key reflects what they had.
          // talent_profiles.talent_plan_key is set to talent_basic separately.
          plan_key:               isTerminallyCancelled
                                    ? ((existingRow as { plan_key?: string } | null)?.plan_key ?? "talent_pro")
                                    : (planKey === "talent_basic" ? "talent_pro" : planKey),
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

    // Trial start: confirm the trial began on the transition INTO trialing
    // (platform-scoped — talent Pro/Max is a Tulala subscription, tenantId null).
    if (status === "trialing" && existingStatus !== "trialing") {
      notifyTrialStarted({
        scope: "talent",
        tenantId: null,
        talentProfileId,
        subscriptionId: subscription.id,
        planKey: newPlanKey,
        trialEndIso: trialEnd,
      });
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
// mapStripeStatus is imported from @/lib/stripe/utils (L3 dedup).
