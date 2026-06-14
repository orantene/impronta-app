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
import { notifyWorkspacePaymentFailed } from "@/lib/notifications/producers/payment-notify";
import { notifyWorkspacePlanChange } from "@/lib/notifications/producers/workspace-plan-notify";
import { notifyTrialStarted } from "@/lib/notifications/producers/trial-notify";
import { mapStripeStatus } from "@/lib/stripe/utils";
import type { AllowedStatus } from "@/lib/stripe/utils";
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

    // Audit C6 — race fix: if a concurrent call won the insert race, our
    // freshly-created Stripe customer is now an orphan. Clean it up.
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        try {
          await stripe.customers.del(customer.id);
        } catch (delErr) {
          logServerError("workspace-billing.getOrCreateCustomer.deleteOrphan", delErr);
        }
        const { data: winner } = await sb
          .from("stripe_customers")
          .select("stripe_customer_id")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (winner?.stripe_customer_id) {
          return { ok: true, data: winner.stripe_customer_id };
        }
        return { ok: false, error: "Could not acquire Stripe customer record." };
      }
      logServerError("workspace-billing.getOrCreateCustomer.insert", error);
      try {
        await stripe.customers.del(customer.id);
      } catch (delErr) {
        logServerError("workspace-billing.getOrCreateCustomer.deleteOnInsertFail", delErr);
      }
      return { ok: false, error: "Could not record Stripe customer locally." };
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

  // Network is sales-assisted; refuse self-serve checkout unless an env price
  // ID is explicitly configured (future flip: set STRIPE_PRICE_NETWORK_MONTHLY).
  if (opts.planKey === "network") {
    const networkPriceId = getWorkspacePriceId("network", "monthly");
    if (!networkPriceId) {
      return { ok: false, error: "Network is sales-assisted — no self-serve price configured." };
    }
  }

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
        plan_key: opts.planKey,
        checkout_type: "workspace_subscription",
      },
      subscription_data: {
        metadata: {
          tenant_id: opts.tenantId,
          plan_key: opts.planKey,
          checkout_type: "workspace_subscription",
        },
      },
      // Allow promotion codes for early-access discounts
      allow_promotion_codes: true,
      // Adaptive Pricing: Stripe auto-converts the USD price to the customer's
      // local currency at checkout (e.g. MXN for Mexico, EUR for Europe).
      // Note: subscription-mode sessions require the explicit `currency` to match
      // the Price's currency (USD), so we cannot use `currency` to force a different
      // presentment currency here. Adaptive Pricing is the correct mechanism.
      // Workspace owners can set a preferred_currency preference (stored in DB) which
      // will be used when multi-currency Stripe prices are added per currency.
      adaptive_pricing: { enabled: true },
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

  // Slice 15.4 pre-read: capture the prior plan tier + subscription status
  // BEFORE the upsert/agency-update overwrite them. We need the OLD values to
  // emit a plan-change notice only on a real tier transition, and a dunning
  // alert only on the edge INTO past_due (Stripe re-sends the subscription on
  // every retry — we must not re-alert each time).
  const [{ data: priorAgency }, { data: priorSub }] = await Promise.all([
    sb.from("agencies").select("plan_tier, display_name").eq("id", tenantId).maybeSingle(),
    sb.from("workspace_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const priorPlanTier = (priorAgency as { plan_tier?: string | null } | null)?.plan_tier ?? null;
  const workspaceName = (priorAgency as { display_name?: string | null } | null)?.display_name ?? null;
  const priorStatus = (priorSub as { status?: string | null } | null)?.status ?? null;

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

    const SEAT_LIMITS: Record<string, number | null> = {
      free: 5,
      studio: 50,
      agency: 200,
      network: null,
    };
    const seatLimit = SEAT_LIMITS[newPlanTier] ?? SEAT_LIMITS.free;

    // Sync agencies.plan_tier + roster cap
    const { error: agencyError } = await sb
      .from("agencies")
      .update({
        plan_tier: newPlanTier,
        talent_seat_limit: seatLimit,
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

    // Slice 15.4: billing notices (spec §6.6 plan change + §6.5 dunning). The
    // webhook sync and the self-serve `cancelSubscription` action are disjoint
    // paths today, so we emit from BOTH for full coverage; the shared
    // plan-change eventId dedupes if they ever race. Both no-op without
    // RESEND_API_KEY.
    //
    // Only announce a plan change on a SETTLED outcome — active/trialing (the
    // tier is genuinely in effect) or a downgrade to free (a real
    // cancellation). This suppresses a premature "you're upgraded" on an
    // `incomplete` checkout and avoids treating past_due/paused (which keep the
    // tier but flag a payment issue) as a deliberate tier move.
    const planNoticeWorthy =
      status === "active" || status === "trialing" || newPlanTier === "free";
    if (planNoticeWorthy && priorPlanTier !== newPlanTier) {
      notifyWorkspacePlanChange({
        tenantId,
        fromPlan: priorPlanTier,
        toPlan: newPlanTier,
        effectiveAtIso: new Date().toISOString(),
        workspaceName,
      });
    }
    // Trial start: confirm the trial began on the transition INTO trialing.
    if (status === "trialing" && priorStatus !== "trialing") {
      notifyTrialStarted({
        scope: "workspace",
        tenantId,
        talentProfileId: null,
        subscriptionId: subscription.id,
        planKey,
        trialEndIso: trialEnd,
      });
    }
    if (status === "past_due" && priorStatus !== "past_due") {
      notifyWorkspacePaymentFailed({
        tenantId,
        workspaceName,
        amountDueCents: item?.price?.unit_amount ?? null,
        currency: item?.price?.currency ?? null,
        occurredOn: new Date().toISOString().slice(0, 10),
      });
    }

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
// mapStripeStatus and AllowedStatus are imported from @/lib/stripe/utils.
// Re-export AllowedStatus so callers that previously imported it from this
// module continue to compile without changes.
export type { AllowedStatus };
