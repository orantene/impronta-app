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

import { resumeSubscriptionParams, subscriptionCancelMirror } from "@/lib/billing/pending-cancellation";
import { nextPastDueSince } from "@/lib/billing/dunning-grace";
import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { type TalentPlanKey } from "@/lib/stripe/price-ids";
import { resolveTalentPriceId } from "@/lib/stripe/price-catalog";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { mapStripeStatus } from "@/lib/stripe/utils";
import { notifyTrialStarted } from "@/lib/notifications/producers/trial-notify";
import { reconcileTalentDomainPlanGrace } from "@/lib/talent-site/server/talent-domain-plan-grace";
import { resolveCheckoutDiscount } from "@/lib/billing/checkout-discounts";
import { expiredPromoMessage } from "@/lib/billing/promo-preview";
import {
  reconcileAppliedDiscount,
  resolveSubscriptionDiscountMirror,
} from "@/lib/billing/subscription-discounts";
import { idempotencySuffix, returnQuery } from "@/lib/billing/checkout-return";
import { duplicateSubscriptionGuard } from "@/lib/billing/subscription-guard.server";
import { checkoutIdempotencyKey, checkoutPriceError, resolveCheckoutPrice } from "@/lib/billing/checkout-interval";
import { loadTrialOffer } from "@/lib/plan-trials/offers";
import { checkoutTrialDays } from "@/lib/billing/trial-eligibility.server";
import { trialParams } from "@/lib/billing/trial-eligibility";
import { checkoutSessionKey } from "@/lib/billing/checkout-session-key";
import { sweepTrialSessions } from "@/lib/billing/trial-checkout-session";
import { reopenIfExpired } from "@/lib/billing/checkout-session-reopen";
import { reconcileTrialSession } from "@/lib/billing/trial-session-reconcile";
import { TRIAL_PRICE_IDENTITY, trialPriceIdentity } from "@/lib/billing/trial-price-identity";
import { buildPortalSessionParams, withoutPortalConfiguration } from "@/lib/stripe/portal-params";
import {
  stripeCheckoutLocale,
} from "@/lib/i18n/vendor-locale";
import type Stripe from "stripe";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { recurringConsentParams } from "@/lib/stripe/recurring-consent";
import { decideTalentPlanState, type StoredTalentPlanRow } from "@/lib/billing/talent-plan-state";
import {
  cleanCancelComment,
  isLiveTalentSubscriptionStatus,
  stripeFeedbackFor,
  talentCancelIdempotencyKey,
  type TalentCancelReason,
} from "@/lib/billing/talent-cancel";
import { onTalentPlanChanged } from "@/lib/talent-site/server/plan-change";
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
  pastDueSince?: string | null;
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
  /**
   * A `?promo=` code carried from the funnel. RE-VALIDATED server-side by
   * `resolveCheckoutDiscount` — it arrives from the browser, so it is a
   * request, never a fact.
   */
  promoCode?: string | null;
  /** Signed return-to-spot token (`lib/billing/checkout-return.ts`). */
  returnToken?: string | null;
  interval?: string | null; // TUL-830 toggle; anything but "year" is monthly
}): Promise<BillingResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe()!;

  // TUL-830: one subscription per talent; an existing one changes plan in the portal.
  const duplicate = await duplicateSubscriptionGuard("talent", opts.talentProfileId, opts.userId);
  if (duplicate) return { ok: false, error: duplicate };
  const price = await resolveCheckoutPrice((i) => resolveTalentPriceId(opts.planKey, i), opts.interval);
  if (!price.ok) return { ok: false, error: checkoutPriceError(price.code, opts.planKey) };
  const priceId = price.priceId;

  const customerResult = await getOrCreateTalentStripeCustomer(
    opts.userId,
    opts.email,
    opts.displayName,
  );
  if (!customerResult.ok) return customerResult;

  // Account discount > validated promo code > Stripe's own code box. Exactly
  // one of `discounts` / `allow_promotion_codes` comes out; Stripe rejects both.
  const discount = await resolveCheckoutDiscount({
    subjectType: "talent",
    talentProfileId: opts.talentProfileId,
    promoCode: opts.promoCode ?? null,
  });
  // TUL-1860: an expired code is refused with a clear message, never silently dropped to full price.
  if (discount.rejected) return { ok: false, error: expiredPromoMessage(opts.locale) };

  // The admin-configured trial, finally sent to Stripe rather than only shown
  // in marketing copy.
  const trialOffer = await loadTrialOffer("talent", opts.planKey);
  // TUL-1280: one trial per customer; a prior trial/subscription or a failed read sends none.
  const trialDays = await checkoutTrialDays({ kind: "talent", talentProfileId: opts.talentProfileId, userId: opts.userId }, customerResult.data, trialOffer);

  // TUL-1280 race close: what this session charges, so a race loser is never sent to another price.
  const priceIdentity = trialPriceIdentity({ planKey: opts.planKey, interval: price.interval, priceId, discount: discount.params });
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerResult.data,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // TUL-836: {CHECKOUT_SESSION_ID} lets the success page sync the plan if the webhook is late.
    success_url: `${opts.appBaseUrl}/${opts.tenantSlug}/talent/settings?billing=success&session_id={CHECKOUT_SESSION_ID}${returnQuery(opts.returnToken)}`,
    cancel_url:  `${opts.appBaseUrl}/${opts.tenantSlug}/talent/settings?billing=cancelled`,
    // Show Checkout in the talent's app language, not their browser's.
    locale: stripeCheckoutLocale(opts.locale),
    metadata: {
      talent_profile_id: opts.talentProfileId,
      user_id:           opts.userId,
      plan_key:          opts.planKey,
      billing_interval:  price.interval,
      checkout_type:     "talent_subscription",
      ...(trialDays != null ? { [TRIAL_PRICE_IDENTITY]: priceIdentity } : {}),
    },
    subscription_data: {
      metadata: {
        talent_profile_id: opts.talentProfileId,
        user_id:           opts.userId,
        plan_key:          opts.planKey,
        billing_interval:  price.interval,
        checkout_type:     "talent_subscription",
      },
      ...trialParams(trialDays),
    },
    ...discount.params,
    // TUL-1229: explicit recurring-charge agreement (required checkbox + renewal text) before Subscribe.
    // Part of sessionParams, so the idempotency key (checkoutSessionKey) hashes it: a re-click still dedupes.
    ...recurringConsentParams({ locale: opts.locale, interval: price.interval, trialDays, marketingOrigin: resolveMarketingOrigin() }),
    // Adaptive Pricing: auto-converts to customer's local currency at checkout.
    adaptive_pricing: { enabled: true },
  };
  // TUL-1280 retest: the key follows the exact params (a trial decided differently after a cancel
  // must not reuse the key; Stripe rejects that). Identical params still dedupe a double submit.
  const idempotencyKey = checkoutSessionKey(
    checkoutIdempotencyKey({ prefix: "cs_talent", subjectId: opts.talentProfileId, planKey: opts.planKey, interval: price.interval, suffix: idempotencySuffix(opts.returnToken) }),
    sessionParams,
  );
  // TUL-1280 P1: at most one open trial session per customer (best effort, see module).
  const trialSweep = await sweepTrialSessions(stripe, customerResult.data, trialDays, idempotencyKey, logServerError);

  const createParams: Stripe.Checkout.SessionCreateParams = { ...sessionParams, metadata: { ...sessionParams.metadata, ...trialSweep.marker } };

  try {
    const created = await stripe.checkout.sessions.create(
      createParams,
      // Idempotency: a double submit must not mint a SECOND Checkout session.
      // One subscription per talent profile per plan; a second session risks a second sub.
      { idempotencyKey },
    );
    // TUL-1280 review P1: a replayed session the sweep already expired is re-keyed, never handed back dead.
    const session =
      trialDays != null
        ? await reopenIfExpired(stripe, created, createParams, idempotencyKey, trialSweep.expiredIds)
        : created;

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
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

    // TUL-834: a fresh session per click, URL returned straight from Stripe and
    // never stored. If the env configuration id is stale or from another Stripe
    // account, retry once on the account default instead of failing.
    const params = buildPortalSessionParams({
      customerId: customer.stripe_customer_id,
      returnUrl: `${opts.appBaseUrl}/${opts.tenantSlug}/talent/settings`,
      locale: opts.locale,
      audience: "talent",
    });
    let session;
    try {
      session = await stripe.billingPortal.sessions.create(params);
    } catch (firstErr) {
      if (!params.configuration) throw firstErr;
      logServerError("talent-billing.portalConfigRetry", firstErr);
      session = await stripe.billingPortal.sessions.create(withoutPortalConfiguration(params));
    }

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
  opts: {
    /** Stripe event type; "sync" for checkout and invoice re-syncs. */
    eventType?: string;
    /** Resolved server-side when legacy subscriptions lack metadata. */
    talentProfileId?: string;
    userId?: string;
  } = {},
): Promise<BillingResult<void>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };

  const talentProfileId = opts.talentProfileId ?? subscription.metadata?.talent_profile_id;
  const userId = opts.userId ?? subscription.metadata?.user_id;

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

  // Written through unconditionally, nulls included, so a discount removed in
  // the Stripe dashboard propagates back instead of lingering in our table.
  const discountMirror = await resolveSubscriptionDiscountMirror(subscription);

  try {
    // TUL-836: one rule set for every event (see talent-plan-state.ts),
    // including the out-of-order guard (Audit H2) and resubscribe handling.
    const [{ data: existingRow }, { data: profileRow }] = await Promise.all([
      sb
        .from("talent_subscriptions")
        .select("status, plan_key, stripe_subscription_id, past_due_since")
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle(),
      sb
        .from("talent_profiles")
        .select("talent_plan_key, profile_code")
        .eq("id", talentProfileId)
        .maybeSingle(),
    ]);
    const existing = (existingRow as StoredTalentPlanRow | null) ?? null;
    const profile = profileRow as { talent_plan_key?: string | null; profile_code?: string | null } | null;
    const existingStatus = existing?.status ?? undefined;

    const decision = decideTalentPlanState({
      eventType: opts.eventType ?? "sync",
      subscriptionId: subscription.id,
      status: mapStripeStatus(subscription.status),
      planKey,
      existing,
      previousProfilePlan: profile?.talent_plan_key ?? null,
    });
    if (decision.kind === "skip_stale") {
      logServerError("talent-billing.syncSubscription.staleEvent", decision.reason);
      return { ok: true, data: undefined };
    }
    if (decision.kind === "duplicate_live") {
      // TUL-1835: keep the existing row, shout. Ops must cancel the extra
      // subscription in Stripe (it bills on its own until then).
      logServerError(
        "duplicate_talent_subscription",
        new Error(`${decision.reason} (talent ${talentProfileId}, customer ${customerId ?? "unknown"})`),
      );
      void improntaLog("billing.duplicate_talent_subscription", {
        talent_profile_id: talentProfileId,
        kept_subscription_id: decision.existingSubscriptionId,
        duplicate_subscription_id: subscription.id,
        duplicate_status: subscription.status,
      });
      return { ok: true, data: undefined };
    }
    const status = decision.status;
    const newPlanKey = decision.profilePlan;

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
          plan_key:               decision.rowPlan,
          status,
          current_period_end:     periodEnd,
          ...subscriptionCancelMirror(subscription),
          cancelled_at:           cancelledAt,
          trial_end:              trialEnd,
          stripe_price_id:        priceId,
          stripe_coupon_id:          discountMirror.couponId,
          discount_percent_off:      discountMirror.percentOff,
          discount_amount_off_cents: discountMirror.amountOffCents,
          discount_ends_at:          discountMirror.endsAt,
          past_due_since:         nextPastDueSince(status, (existingRow as { past_due_since?: string | null } | null)?.past_due_since, new Date()),
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

    // Close the loop on a grant made BEFORE the talent subscribed: the row sat
    // unattached until they checked out with the coupon.
    if (discountMirror.couponId) {
      await reconcileAppliedDiscount({
        couponId: discountMirror.couponId,
        subscriptionId: subscription.id,
      });
    }

    // Read prior plan before overwrite so D6 domain grace can detect loss /
    // restore of Web Office custom-domain access. Money/renewal = D5.
    const { data: profileBefore, error: profileBeforeError } = await sb
      .from("talent_profiles")
      .select("talent_plan_key")
      .eq("id", talentProfileId)
      .maybeSingle();
    // A failed read leaves previousPlanKey null, which reconcile treats as "no transition".
    if (profileBeforeError) logServerError("talent-billing.syncSubscription.planKeyBefore", profileBeforeError);
    const previousPlanKey =
      (profileBefore as { talent_plan_key?: string | null } | null)?.talent_plan_key ??
      null;

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
      return { ok: false, error: "Failed to update talent plan." };
    }

    // D6: domain plan grace reacts to the Web Office loss / restore (previousPlanKey read above).
    await reconcileTalentDomainPlanGrace({
      talentProfileId,
      previousPlanKey,
      nextPlanKey: newPlanKey,
    });

    if (decision.planChanged) {
      await onTalentPlanChanged(
        talentProfileId,
        profile?.talent_plan_key ?? "talent_basic",
        newPlanKey,
        profile?.profile_code ?? null,
      );
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

// ─── Cancel / resume (TUL-832) ────────────────────────────────────────────────

type OwnedSubRow = {
  user_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

/**
 * Loads the talent's subscription row and proves the caller owns it. Reads
 * only: plan state is written by the webhook single writer
 * (syncTalentSubscriptionToDb), never from the cancel / resume actions.
 */
async function loadOwnedSubscription(
  talentProfileId: string,
  userId: string,
): Promise<BillingResult<OwnedSubRow | null>> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database not available." };
  const { data, error } = await sb
    .from("talent_subscriptions")
    .select("user_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent-billing.cancel.load", error);
    return { ok: false, error: "Could not read the subscription." };
  }
  const row = (data as OwnedSubRow | null) ?? null;
  if (row && row.user_id !== userId) return { ok: false, error: "Not allowed." };
  return { ok: true, data: row };
}

/**
 * Schedule the talent plan to end at the close of the paid period. Stripe is
 * told (`cancel_at_period_end: true`); access and the plan key are untouched
 * until `customer.subscription.deleted` reaches the webhook writer, which
 * drops the talent to Free and keeps their content.
 */
export async function cancelTalentSubscriptionAtPeriodEnd(opts: {
  talentProfileId: string;
  userId: string;
  reason: TalentCancelReason;
  comment?: string | null;
}): Promise<BillingResult<{ effectiveAt: string | null; hadSubscription: boolean }>> {
  const loaded = await loadOwnedSubscription(opts.talentProfileId, opts.userId);
  if (!loaded.ok) return loaded;
  const row = loaded.data;
  if (!row?.stripe_subscription_id) {
    return { ok: true, data: { effectiveAt: null, hadSubscription: false } };
  }
  if (!isLiveTalentSubscriptionStatus(row.status)) {
    return { ok: true, data: { effectiveAt: row.current_period_end, hadSubscription: true } };
  }
  const stripe = isStripeConfigured() ? getStripe() : null;
  if (!stripe) {
    return { ok: false, error: "Billing is not available right now. Nothing was changed." };
  }
  try {
    const updated = await stripe.subscriptions.update(
      row.stripe_subscription_id,
      {
        cancel_at_period_end: true,
        cancellation_details: {
          feedback: stripeFeedbackFor(opts.reason),
          ...(cleanCancelComment(opts.comment) ? { comment: cleanCancelComment(opts.comment) } : {}),
        },
      },
      { idempotencyKey: talentCancelIdempotencyKey("cancel", row.stripe_subscription_id, Date.now()) },
    );
    const end = updated.cancel_at ?? updated.items?.data?.[0]?.current_period_end ?? null;
    return {
      ok: true,
      data: {
        effectiveAt: end ? new Date(end * 1000).toISOString() : row.current_period_end,
        hadSubscription: true,
      },
    };
  } catch (err) {
    logServerError("talent-billing.cancelAtPeriodEnd", err);
    return { ok: false, error: "Stripe could not cancel the subscription. Nothing was changed." };
  }
}

/**
 * Undo a pending cancellation before the period ends. No new charge: nothing
 * was refunded or ended. Refuses once the subscription is gone.
 */
export async function resumeTalentSubscription(opts: {
  talentProfileId: string;
  userId: string;
}): Promise<BillingResult<{ renewsAt: string | null; hadSubscription: boolean }>> {
  const loaded = await loadOwnedSubscription(opts.talentProfileId, opts.userId);
  if (!loaded.ok) return loaded;
  const row = loaded.data;
  if (!row?.stripe_subscription_id) {
    return { ok: true, data: { renewsAt: null, hadSubscription: false } };
  }
  if (!isLiveTalentSubscriptionStatus(row.status)) {
    return { ok: false, error: "This plan has already ended. Start it again from the plans page." };
  }
  const stripe = isStripeConfigured() ? getStripe() : null;
  if (!stripe) {
    return { ok: false, error: "Billing is not available right now. Nothing was changed." };
  }
  try {
    const live = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const updated = await stripe.subscriptions.update(
      row.stripe_subscription_id,
      resumeSubscriptionParams(live),
      { idempotencyKey: talentCancelIdempotencyKey("resume", row.stripe_subscription_id, Date.now()) },
    );
    const end = updated.items?.data?.[0]?.current_period_end ?? null;
    return {
      ok: true,
      data: {
        renewsAt: end ? new Date(end * 1000).toISOString() : row.current_period_end,
        hadSubscription: true,
      },
    };
  } catch (err) {
    logServerError("talent-billing.resume", err);
    return { ok: false, error: "Stripe could not restore the subscription. Nothing was changed." };
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
      past_due_since?: string | null;
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
      pastDueSince: row.past_due_since ?? null,
    };
  } catch (err) {
    logServerError("talent-billing.loadState", err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// mapStripeStatus is imported from @/lib/stripe/utils (L3 dedup).
