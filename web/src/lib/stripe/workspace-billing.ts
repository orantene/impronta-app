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

import { resumeSubscriptionParams, subscriptionCancelMirror } from "@/lib/billing/pending-cancellation";
import { nextPastDueSince } from "@/lib/billing/dunning-grace";
import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { type WorkspacePlanKey } from "@/lib/stripe/price-ids";
import { resolveWorkspacePriceId } from "@/lib/stripe/price-catalog";
import { checkoutIdempotencyKey, checkoutPriceError, resolveCheckoutPrice } from "@/lib/billing/checkout-interval";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, logServerExpected } from "@/lib/server/safe-error";
import { storedCustomerIsStale } from "@/lib/stripe/stored-customer";
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";
import { notifyWorkspacePaymentFailed } from "@/lib/notifications/producers/payment-notify";
import { notifyWorkspacePlanChange } from "@/lib/notifications/producers/workspace-plan-notify";
import { notifyTrialStarted } from "@/lib/notifications/producers/trial-notify";
import { mapStripeStatus } from "@/lib/stripe/utils";
import type { AllowedStatus } from "@/lib/stripe/utils";
import { resolveCheckoutDiscount } from "@/lib/billing/checkout-discounts";
import {
  reconcileAppliedDiscount,
  resolveSubscriptionDiscountMirror,
} from "@/lib/billing/subscription-discounts";
import { idempotencySuffix, returnQuery } from "@/lib/billing/checkout-return";
import { loadTrialOffer } from "@/lib/plan-trials/offers";
import { checkoutTrialDays } from "@/lib/billing/trial-eligibility.server";
import { trialParams } from "@/lib/billing/trial-eligibility";
import { checkoutSessionKey } from "@/lib/billing/checkout-session-key";
import { sweepTrialSessions } from "@/lib/billing/trial-checkout-session";
import { reopenIfExpired } from "@/lib/billing/checkout-session-reopen";
import { reconcileTrialSession } from "@/lib/billing/trial-session-reconcile";
import { TRIAL_PRICE_IDENTITY, trialPriceIdentity } from "@/lib/billing/trial-price-identity";
import { buildPortalSessionParams } from "@/lib/stripe/portal-params";
import {
  stripeCheckoutLocale,
} from "@/lib/i18n/vendor-locale";
import type Stripe from "stripe";
import { createTranslator } from "@/i18n/messages";
import { isDefiniteStripeFailure } from "@/lib/billing/stripe-failure";
import { applyPendingDowngradeAtTierDrop, clearPendingOnTierIncrease } from "@/lib/billing/workspace-downgrade-archive";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { recurringConsentParams } from "@/lib/stripe/recurring-consent";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; /** false = Stripe may still have applied the write (TUL-1737); omitted = definite */ definite?: boolean };

export type { WorkspaceSubscriptionState } from "@/lib/stripe/workspace-subscription-reads";
export { hasLiveWorkspaceSubscription, loadWorkspaceSubscriptionState } from "@/lib/stripe/workspace-subscription-reads";

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

    let replacingStale = false;
    if (existing?.stripe_customer_id) {
      if (!(await storedCustomerIsStale(stripe, existing.stripe_customer_id))) {
        return { ok: true, data: existing.stripe_customer_id };
      }
      // The id belongs to another Stripe account/sandbox (or was deleted): mint a new one and replace the mapping.
      replacingStale = true;
      logServerExpected("workspace-billing.getOrCreateCustomer.stale", new Error(`stored Stripe customer ${existing.stripe_customer_id} not found; recreating`));
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: displayName,
      metadata: { tenant_id: tenantId },
    });

    // Persist to DB
    const row = {
      tenant_id: tenantId,
      stripe_customer_id: customer.id,
      billing_email: ownerEmail,
    };
    const { error } = replacingStale
      ? await sb.from("stripe_customers").upsert(row, { onConflict: "tenant_id" })
      : await sb.from("stripe_customers").insert(row);

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
  /**
   * The workspace owner's resolved app locale (`getRequestLocale()`), threaded
   * from the calling server action. Without it Stripe reads the BROWSER
   * language, so an owner running Tulala in Spanish on an English browser pays
   * through an English form. Absent / unmappable → the parameter is omitted and
   * Stripe keeps its own default.
   */
  locale?: string | null;
  /**
   * A `?promo=` code carried from the marketing funnel. RE-VALIDATED server-side
   * by `resolveCheckoutDiscount` — it arrives from the browser, so it is a
   * request, never a fact.
   */
  promoCode?: string | null;
  /**
   * The person clicking buy. Talent checkout has always stamped this; the
   * workspace side never did, so `discount_redemptions.user_id` came back null
   * for every workspace redemption and the usage drawer had to guess an email
   * from the Stripe customer record.
   */
  buyerUserId?: string | null;
  /** Signed return-to-spot token (`lib/billing/checkout-return.ts`); the account page forwards to it after success. */
  returnToken?: string | null;
  interval?: string | null; // TUL-830 toggle; anything but "year" is monthly
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;

  // Network is sales-assisted; it has no catalog price, so the resolver returns
  // null and self-serve checkout refuses. Giving Network an active price row in
  // the pricing dashboard is what would flip it to self-serve.
  if (opts.planKey === "network") {
    const networkPriceId = await resolveWorkspacePriceId("network", "monthly");
    if (!networkPriceId) {
      return { ok: false, error: "Network is sales-assisted — no self-serve price configured." };
    }
  }

  const price = await resolveCheckoutPrice((i) => resolveWorkspacePriceId(opts.planKey, i), opts.interval);
  if (!price.ok) {
    logServerError(
      "workspace-billing.checkout.price",
      new Error(`plan=${opts.planKey} code=${price.code}: the catalog resolved no Stripe price id for this plan/interval`),
    );
    return { ok: false, error: checkoutPriceError(price.code, opts.planKey) };
  }
  const priceId = price.priceId;

  // Get or create the Stripe customer
  const customerResult = await getOrCreateStripeCustomer(
    opts.tenantId,
    opts.ownerEmail,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  // What this session charges, before the buyer types anything: an account
  // discount we granted, else a validated promo code, else Stripe's own box.
  // Exactly one of `discounts` / `allow_promotion_codes` comes out — Stripe
  // rejects both, and the resolver's return type is what guarantees it.
  const discount = await resolveCheckoutDiscount({
    subjectType: "workspace",
    tenantId: opts.tenantId,
    promoCode: opts.promoCode ?? null,
  });

  // The trial the admin configured in `plan_trial_offers`. Until now that
  // number was displayed in marketing copy and never sent to Stripe, so a
  // "14-day free trial" charged on day zero.
  const trialOffer = await loadTrialOffer("workspace", opts.planKey);
  // TUL-1280: one trial per customer; a prior trial/subscription or a failed read sends none.
  const trialDays = await checkoutTrialDays({ kind: "workspace", tenantId: opts.tenantId, buyerUserId: opts.buyerUserId }, customerResult.data, trialOffer);

  // TUL-1280 race close: what this session charges, so a race loser is never sent to another price.
  const priceIdentity = trialPriceIdentity({ planKey: opts.planKey, interval: price.interval, priceId, discount: discount.params });
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerResult.data,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/admin/account?billing=success${returnQuery(opts.returnToken)}`,
    cancel_url:  `${opts.appBaseUrl}/${opts.tenantSlug}/admin/account?billing=cancelled`,
    // Show Checkout in the owner's app language, not their browser's.
    locale: stripeCheckoutLocale(opts.locale),
    metadata: {
      tenant_id: opts.tenantId,
      plan_key: opts.planKey,
      billing_interval: price.interval,
      checkout_type: "workspace_subscription",
      ...(trialDays != null ? { [TRIAL_PRICE_IDENTITY]: priceIdentity } : {}),
    },
    subscription_data: {
      metadata: {
        tenant_id: opts.tenantId,
        plan_key: opts.planKey,
        billing_interval: price.interval,
        checkout_type: "workspace_subscription",
        // Read back by the webhook so a redemption records WHO, not just
        // which workspace. Omitted rather than sent empty when unknown.
        ...(opts.buyerUserId ? { user_id: opts.buyerUserId } : {}),
      },
      ...trialParams(trialDays),
    },
    ...discount.params,
    // TUL-1229: explicit recurring-charge agreement (required checkbox + renewal text) before Subscribe.
    // Part of sessionParams, so the idempotency key (checkoutSessionKey) hashes it: a re-click still dedupes.
    ...recurringConsentParams({ locale: opts.locale, interval: price.interval, trialDays, marketingOrigin: resolveMarketingOrigin() }),
    // Adaptive Pricing: Stripe converts the USD price to the customer's local
    // currency (subscription mode cannot force `currency` off the Price's USD).
    adaptive_pricing: { enabled: true },
  };
  // TUL-1280 retest: the key follows the exact params (a trial decided differently after a cancel
  // must not reuse the key; Stripe rejects that). Identical params still dedupe a double submit.
  const idempotencyKey = checkoutSessionKey(
    checkoutIdempotencyKey({ prefix: "cs_ws", subjectId: opts.tenantId, planKey: opts.planKey, interval: price.interval, suffix: idempotencySuffix(opts.returnToken) }),
    sessionParams,
  );
  // TUL-1280 P1: at most one open trial session per customer (best effort, see module).
  const trialSweep = await sweepTrialSessions(stripe, customerResult.data, trialDays, idempotencyKey, logServerError);

  const createParams: Stripe.Checkout.SessionCreateParams = { ...sessionParams, metadata: { ...sessionParams.metadata, ...trialSweep.marker } };

  try {
    const created = await stripe.checkout.sessions.create(
      createParams,
      // Idempotency: a double submit must not mint a SECOND Checkout session.
      // One subscription per workspace per plan; a second session risks a second sub.
      { idempotencyKey },
    );
    // TUL-1280 review P1: a replayed session the sweep already expired is re-keyed, never handed back dead.
    const session =
      trialDays != null
        ? await reopenIfExpired(stripe, created, createParams, idempotencyKey, trialSweep.expiredIds)
        : created;

    if (!session.url) {
      return { ok: false, error: createTranslator(opts.locale ?? "en")("admin.account.billing.checkoutNoUrl") };
    }

    // TUL-1280 race close: oldest open trial session wins; a loser hands back the winner's URL
    // only when the winner is the same plan, else a retryable error.
    const settled =
      trialDays != null
        ? await reconcileTrialSession(stripe, customerResult.data, { id: session.id, url: session.url }, { otherTrialKnownOpen: trialSweep.otherTrialKnownOpen, requestedPriceIdentity: priceIdentity, onError: logServerError, locale: opts.locale })
        : { url: session.url };
    if ("error" in settled) return { ok: false, error: settled.error };
    return { ok: true, data: { url: settled.url } };
  } catch (err) {
    logServerError("workspace-billing.createCheckoutSession", err);
    return { ok: false, error: createTranslator(opts.locale ?? "en")("admin.account.billing.checkoutFailed") };
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
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("tenant_id", opts.tenantId)
      .maybeSingle();

    if (!customer?.stripe_customer_id) {
      return { ok: false, error: "No billing account found." };
    }

    const session = await stripe.billingPortal.sessions.create(
      buildPortalSessionParams({
        customerId: customer.stripe_customer_id,
        returnUrl: `${opts.appBaseUrl}/${opts.tenantSlug}/admin/account`,
        locale: opts.locale,
      }),
    );

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
    sb.from("workspace_subscriptions").select("status, past_due_since").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const priorPlanTier = (priorAgency as { plan_tier?: string | null } | null)?.plan_tier ?? null;
  const workspaceName = (priorAgency as { display_name?: string | null } | null)?.display_name ?? null;
  const priorStatus = (priorSub as { status?: string | null } | null)?.status ?? null;
  const priorPastDueSince = (priorSub as { past_due_since?: string | null } | null)?.past_due_since ?? null;

  // What Stripe says this subscription is actually discounted by. Written
  // through unconditionally — including as NULLS — because that is how a
  // discount removed in the Stripe dashboard stops showing in HQ.
  const discountMirror = await resolveSubscriptionDiscountMirror(subscription);

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
          ...subscriptionCancelMirror(subscription),
          cancelled_at:           cancelledAt,
          trial_end:              trialEnd,
          stripe_price_id:        priceId,
          stripe_coupon_id:          discountMirror.couponId,
          discount_percent_off:      discountMirror.percentOff,
          discount_amount_off_cents: discountMirror.amountOffCents,
          discount_ends_at:          discountMirror.endsAt,
          past_due_since:         nextPastDueSince(status, priorPastDueSince, new Date()),
          updated_at:             new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

    if (subError) {
      logServerError("workspace-billing.syncSubscription.upsert", subError);
      return { ok: false, error: "Failed to update subscription record." };
    }

    const seatLimit = seatCapForPlan(newPlanTier);

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

    // Close the loop on a grant made BEFORE the account subscribed: the row sat
    // unattached until they checked out with the coupon, and this is the first
    // event that proves it took.
    if (discountMirror.couponId) {
      await reconcileAppliedDiscount({
        couponId: discountMirror.couponId,
        subscriptionId: subscription.id,
      });
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

    // TUL-1737: the tier has now actually moved. If the owner chose which talent to keep when they scheduled this
    // downgrade, archive the overflow NOW (period end), under the same archive_event id. Skipped when the tier write
    // failed (the retry redoes both) and a no-op unless newPlanTier reached the downgrade's target. A failure here
    // fails the sync so Stripe retries; the pending row stays until the archive lands.
    if (!agencyError) {
      // An upgrade since the downgrade was scheduled supersedes it: drop the stale keep-list first (TUL-1737).
      const superseded = await clearPendingOnTierIncrease(sb, { tenantId, priorTier: priorPlanTier, newTier: newPlanTier });
      if (!superseded.ok) {
        logServerError("workspace-billing.syncSubscription.clearPending", superseded.error);
        return { ok: false, error: "Failed to clear the superseded downgrade." };
      }
      const pending = await applyPendingDowngradeAtTierDrop(sb, { tenantId, newTier: newPlanTier, nowIso: new Date().toISOString() });
      if (!pending.ok) {
        logServerError("workspace-billing.syncSubscription.downgradeArchive", pending.error);
        return { ok: false, error: "Failed to archive the roster for the scheduled downgrade." };
      }
    }

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("workspace-billing.syncSubscription", err);
    return { ok: false, error: "Unexpected error syncing subscription." };
  }
}

// ─── Subscription state reader ────────────────────────────────────────────────

/**
 * Tell Stripe to stop billing this workspace at the end of the period it has
 * already paid for.
 *
 * WHY THIS EXISTS: `cancelSubscription` used to write `agencies.plan_tier`
 * straight to 'free' and never contact Stripe at all — the code said so in a
 * comment ("Phase 8 (Stripe) will hook this to cancel_at_period_end. For now
 * agencies.plan_tier is direct"). Two things went wrong at once. The customer
 * lost access immediately while their card kept being charged every month. And
 * because `syncStripeSubscriptionToDb` keeps `plan_tier` in step with Stripe,
 * the next `customer.subscription.updated` webhook silently restored the tier
 * they had just cancelled.
 *
 * The fix is to make Stripe the one that decides when the plan ends. We set
 * `cancel_at_period_end`, leave the entitlement exactly where it is, and let
 * the `customer.subscription.deleted` webhook drop the tier when the period
 * actually runs out. The customer keeps what they paid for, billing stops, and
 * there is no longer a local write for a webhook to disagree with.
 *
 * Returns the date access runs until, so the caller can tell the customer.
 */
/**
 * Undo a pending cancellation, before the period ends.
 *
 * The mirror of `cancelWorkspaceSubscriptionAtPeriodEnd`. Cancelling sets
 * `cancel_at_period_end: true` at Stripe and leaves the plan intact until the
 * boundary, so until that boundary the subscription is still live and fully
 * recoverable -- `cancel_at_period_end: false` puts it back with NO new charge,
 * because nothing was ever refunded or ended.
 *
 * This existed for the client Pro path and not for workspaces, which meant a
 * workspace owner who cancelled had no way back except waiting for the plan to
 * lapse and buying it again. That is a worse outcome for them AND for us than
 * one call.
 *
 * Deliberately refuses once Stripe reports the subscription `canceled`: past
 * that point there is nothing to reactivate and the honest answer is a new
 * checkout, not a silent no-op that looks like success.
 */
export async function reactivateWorkspaceSubscription(
  tenantId: string,
): Promise<BillingResult<{ hadSubscription: boolean; renewsAt: string | null }>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, status, current_period_end, cancel_at_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("workspace-billing.reactivate.load", error);
    return { ok: false, error: "Could not read the subscription." };
  }

  const row = data as {
    stripe_subscription_id?: string | null;
    status?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean | null;
  } | null;

  if (!row?.stripe_subscription_id) {
    return { ok: true, data: { hadSubscription: false, renewsAt: null } };
  }
  // Already ended at Stripe. Reactivation is not possible and pretending
  // otherwise would leave the owner believing they still have a plan.
  if (row.status === "canceled" || row.status === "cancelled") {
    return { ok: false, error: "This plan has already ended. Start it again from the plans page." };
  }
  // Not cancelled: nothing to undo. Idempotent rather than an error, so a
  // double click is harmless.
  if (!row.cancel_at_period_end) {
    return { ok: true, data: { hadSubscription: true, renewsAt: row.current_period_end ?? null } };
  }

  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing is not available right now. Contact support and nothing will be charged." };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, error: "Billing is not available right now. Contact support and nothing will be charged." };
  }

  try {
    // Portal cancels set cancel_at, app cancels set the flag; Stripe refuses both together.
    const live = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const updated = await stripe.subscriptions.update(
      row.stripe_subscription_id,
      resumeSubscriptionParams(live),
    );
    const periodEnd = updated.items?.data?.[0]?.current_period_end ?? null;
    const renewsAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : row.current_period_end ?? null;

    const { error: writeErr } = await admin
      .from("workspace_subscriptions")
      .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);
    if (writeErr) logServerError("workspace-billing.reactivate.mirror", writeErr);

    return { ok: true, data: { hadSubscription: true, renewsAt } };
  } catch (err) {
    logServerError("workspace-billing.reactivate", err);
    return { ok: false, error: "Stripe could not restore the subscription. Nothing was changed." };
  }
}

export async function cancelWorkspaceSubscriptionAtPeriodEnd(
  tenantId: string,
): Promise<BillingResult<{ effectiveAt: string | null; hadSubscription: boolean }>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, status, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("workspace-billing.cancelAtPeriodEnd.load", error);
    return { ok: false, error: "Could not read the subscription." };
  }

  const row = data as {
    stripe_subscription_id?: string | null;
    status?: string | null;
    current_period_end?: string | null;
  } | null;

  // No Stripe subscription: a free or comped tenant. Nothing to cancel, and the
  // caller's direct plan write is the correct behaviour for them.
  if (!row?.stripe_subscription_id) {
    return { ok: true, data: { effectiveAt: null, hadSubscription: false } };
  }
  // Already ended at Stripe; treat as done rather than erroring the customer.
  if (row.status === "canceled" || row.status === "cancelled") {
    return { ok: true, data: { effectiveAt: row.current_period_end ?? null, hadSubscription: true } };
  }

  if (!isStripeConfigured()) {
    return { ok: false, error: "Billing is not available right now. Contact support and nothing will be charged." };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, error: "Billing is not available right now. Contact support and nothing will be charged." };
  }

  try {
    const updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    // Mirror the flag locally so the UI can say "ends on ..." before the
    // webhook lands. The tier itself is deliberately NOT touched.
    const periodEnd = updated.cancel_at ?? updated.items?.data?.[0]?.current_period_end ?? null;
    const effectiveAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : row.current_period_end ?? null;
    const { error: writeErr } = await admin
      .from("workspace_subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);
    if (writeErr) logServerError("workspace-billing.cancelAtPeriodEnd.mirror", writeErr);

    return { ok: true, data: { effectiveAt, hadSubscription: true } };
  } catch (err) {
    logServerError("workspace-billing.cancelAtPeriodEnd", err);
    return { ok: false, error: "Stripe could not cancel the subscription. Nothing was changed.", definite: isDefiniteStripeFailure(err) };
  }
}

/**
 * Pause billing until a date, using Stripe's own `pause_collection`.
 *
 * `pauseSubscription` previously inserted an analytics row and did nothing
 * else — the code called itself a stub ("Stripe pause is Phase 8") while the
 * customer kept being invoiced through the pause they thought they had.
 * `behavior: "void"` means invoices raised during the window are voided rather
 * than accumulating into a bill that lands the moment they come back.
 */
export async function pauseWorkspaceSubscriptionCollection(
  tenantId: string,
  resumesAtIso: string,
): Promise<BillingResult<{ paused: boolean }>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const { data } = await admin
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as { stripe_subscription_id?: string | null; status?: string | null } | null;

  // Nothing is being billed, so there is nothing to pause. Not an error.
  if (!row?.stripe_subscription_id) return { ok: true, data: { paused: false } };

  const stripe = isStripeConfigured() ? getStripe() : null;
  if (!stripe) {
    return { ok: false, error: "Billing is not available right now, so the pause was not applied." };
  }

  try {
    await stripe.subscriptions.update(row.stripe_subscription_id, {
      pause_collection: {
        behavior: "void",
        resumes_at: Math.floor(new Date(resumesAtIso).getTime() / 1000),
      },
    });
    return { ok: true, data: { paused: true } };
  } catch (err) {
    logServerError("workspace-billing.pauseCollection", err);
    return { ok: false, error: "Stripe could not pause billing. Nothing was changed." };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// mapStripeStatus and AllowedStatus are imported from @/lib/stripe/utils.
// Re-export AllowedStatus so callers that previously imported it from this
// module continue to compile without changes.
export type { AllowedStatus };
