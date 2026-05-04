/**
 * lib/stripe/workspace-billing.ts
 *
 * Server-only billing operations for workspace (agency) Stripe subscriptions.
 *
 * All functions return typed result objects — no throws on expected failures.
 * Callers (server actions, webhook handler) handle the error cases.
 *
 * Dependency chain:
 *   stripe/client.ts → Stripe SDK instance
 *   stripe/price-ids.ts → plan → Price ID mapping
 *   supabase/admin.ts → service-role client (bypasses RLS for webhook writes)
 *   supabase/server.ts → SSR client (RLS-bound reads from server actions)
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { getWorkspacePriceId, type WorkspacePlanKey } from "@/lib/stripe/price-ids";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type WorkspaceSubscriptionState = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  planKey: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  trialEnd: string | null;
  stripePriceId: string | null;
};

// ─── Customer management ──────────────────────────────────────────────────────

/**
 * Returns the Stripe customer ID for a tenant, creating one if it doesn't exist.
 * Uses the service-role client so it can write without user RLS context.
 */
export async function getOrCreateStripeCustomer(
  tenantId: string,
  ownerEmail: string,
  displayName: string,
): Promise<BillingResult<string>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  try {
    // Check for existing customer record
    const { data: existing } = await sb
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existing?.stripe_customer_id) {
      return { ok: true, data: existing.stripe_customer_id };
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: displayName,
      metadata: { tenant_id: tenantId },
    });

    // Persist to DB
    const { error } = await sb.from("stripe_customers").insert({
      tenant_id: tenantId,
      stripe_customer_id: customer.id,
      billing_email: ownerEmail,
    });

    if (error) {
      logServerError("workspace-billing.getOrCreateCustomer.insert", error);
      // Not fatal — customer exists in Stripe, return the ID anyway
    }

    return { ok: true, data: customer.id };
  } catch (err) {
    logServerError("workspace-billing.getOrCreateCustomer", err);
    return { ok: false, error: "Could not set up billing customer." };
  }
}

// ─── Checkout session ─────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session for upgrading a workspace to a paid plan.
 *
 * Returns the session URL. The caller redirects the browser to it.
 *
 * On successful payment, Stripe fires `checkout.session.completed` →
 * the webhook handler updates plan_tier + workspace_subscriptions.
 */
export async function createWorkspaceCheckoutSession(opts: {
  tenantId: string;
  planKey: WorkspacePlanKey;
  ownerEmail: string;
  displayName: string;
  tenantSlug: string;
  appBaseUrl: string;
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;

  const priceId = getWorkspacePriceId(opts.planKey, "monthly");
  if (!priceId) {
    return { ok: false, error: `No Stripe price configured for plan "${opts.planKey}".` };
  }

  // Get or create the Stripe customer
  const customerResult = await getOrCreateStripeCustomer(
    opts.tenantId,
    opts.ownerEmail,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerResult.data,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/admin/account?billing=success`,
      cancel_url:  `${opts.appBaseUrl}/${opts.tenantSlug}/admin/account?billing=cancelled`,
      metadata: {
        tenant_id: opts.tenantId,
        plan_key:  opts.planKey,
      },
      subscription_data: {
        metadata: {
          tenant_id: opts.tenantId,
          plan_key:  opts.planKey,
        },
      },
      // Allow promotion codes for early-access discounts
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }

    return { ok: true, data: { url: session.url } };
  } catch (err) {
    logServerError("workspace-billing.createCheckoutSession", err);
    return { ok: false, error: "Could not create checkout session." };
  }
}

// ─── Billing portal ───────────────────────────────────────────────────────────

/**
 * Creates a Stripe Billing Portal session for an existing subscriber.
 * The portal lets them update payment method, download invoices, or cancel.
 */
export async function createBillingPortalSession(opts: {
  tenantId: string;
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
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("tenant_id", opts.tenantId)
      .maybeSingle();

    if (!customer?.stripe_customer_id) {
      return { ok: false, error: "No billing account found." };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${opts.appBaseUrl}/${opts.tenantSlug}/admin/account`,
    });

    return { ok: true, data: { url: session.url } };
  } catch (err) {
    logServerError("workspace-billing.createPortalSession", err);
    return { ok: false, error: "Could not open billing portal." };
  }
}

// ─── Webhook sync ─────────────────────────────────────────────────────────────

/**
 * Syncs a Stripe Subscription object to `workspace_subscriptions` +
 * updates `agencies.plan_tier` to match.
 *
 * Called by the webhook handler. Uses service-role client to bypass RLS.
 *
 * planKey must be provided by the caller (extracted from subscription.metadata
 * or subscription_data.metadata set during checkout). Falls back to the
 * current agencies.plan_tier when metadata is missing.
 */
export async function syncStripeSubscriptionToDb(
  subscription: Stripe.Subscription,
  planKey: string,
): Promise<BillingResult<void>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const tenantId = subscription.metadata?.tenant_id;
  if (!tenantId) {
    return { ok: false, error: "Subscription missing tenant_id metadata." };
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  // Stripe v22: current_period_start/end moved from Subscription to SubscriptionItem.
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;

  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const cancelledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000).toISOString()
    : null;

  // Map Stripe status to our allowed set
  const status = mapStripeStatus(subscription.status);

  // Determine agencies.plan_tier:
  // - Active/trialing → set to paid plan
  // - Cancelled/expired → downgrade to free
  const newPlanTier =
    status === "cancelled" || status === "incomplete_expired"
      ? "free"
      : planKey;

  try {
    // Upsert subscription record
    const { error: subError } = await sb
      .from("workspace_subscriptions")
      .upsert(
        {
          tenant_id:              tenantId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id:     customerId,
          plan_key:               planKey,
          status,
          current_period_start:   periodStart,
          current_period_end:     periodEnd,
          cancel_at_period_end:   subscription.cancel_at_period_end ?? false,
          cancelled_at:           cancelledAt,
          trial_end:              trialEnd,
          stripe_price_id:        priceId,
          updated_at:             new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

    if (subError) {
      logServerError("workspace-billing.syncSubscription.upsert", subError);
      return { ok: false, error: "Failed to update subscription record." };
    }

    // Sync agencies.plan_tier
    const { error: agencyError } = await sb
      .from("agencies")
      .update({
        plan_tier:  newPlanTier,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (agencyError) {
      logServerError("workspace-billing.syncSubscription.planTier", agencyError);
      // Non-fatal — subscription record is updated; plan_tier may be stale
    }

    // Ensure stripe_customers row exists (idempotent)
    await sb
      .from("stripe_customers")
      .upsert(
        { tenant_id: tenantId, stripe_customer_id: customerId },
        { onConflict: "tenant_id" },
      );

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("workspace-billing.syncSubscription", err);
    return { ok: false, error: "Unexpected error syncing subscription." };
  }
}

// ─── Subscription state reader ────────────────────────────────────────────────

/**
 * Load the current subscription state for a tenant. Returns null when the
 * tenant has no active Stripe subscription (free tier).
 *
 * Intended for server-side read in the Account page via data bridge.
 * Reads with the user's RLS context — agency staff can see their own row.
 */
export async function loadWorkspaceSubscriptionState(
  tenantId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<WorkspaceSubscriptionState | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("workspace-billing.loadState", error);
      return null;
    }
    if (!data) return null;

    type Row = {
      stripe_subscription_id: string;
      stripe_customer_id: string;
      plan_key: string;
      status: string;
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      cancelled_at: string | null;
      trial_end: string | null;
      stripe_price_id: string | null;
    };
    const row = data as unknown as Row;
    return {
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeCustomerId: row.stripe_customer_id,
      planKey: row.plan_key,
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      cancelledAt: row.cancelled_at,
      trialEnd: row.trial_end,
      stripePriceId: row.stripe_price_id,
    };
  } catch (err) {
    logServerError("workspace-billing.loadState", err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AllowedStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "paused"
  | "incomplete"
  | "incomplete_expired";

function mapStripeStatus(stripeStatus: string): AllowedStatus {
  const ALLOWED = new Set<string>([
    "trialing", "active", "past_due", "paused", "incomplete", "incomplete_expired",
  ]);
  if (ALLOWED.has(stripeStatus)) return stripeStatus as AllowedStatus;
  // Stripe uses "canceled" (US spelling); our check uses "cancelled" (UK)
  if (stripeStatus === "canceled") return "cancelled";
  return "incomplete";
}
