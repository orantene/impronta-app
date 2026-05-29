/**
 * lib/stripe/webhook-handler.ts
 *
 * THE single Stripe webhook handler for the whole platform.
 *
 * Background (P0 unification, 2026-05-29): the codebase previously shipped
 * TWO webhook route files —
 *   • /api/stripe/webhook   (subscriptions + client-trust + Connect account.updated; idempotent)
 *   • /api/webhooks/stripe  (booking-transaction markPaid + booking deposit + payout.* + capability.updated)
 * — each backed by its OWN `getStripe()` singleton, with overlapping-but-divergent
 * handling of checkout.session.completed / customer.subscription.* / invoice.payment_failed /
 * account.updated, and only the first was idempotent. The ops script registered only ONE
 * URL, so whichever route Stripe was NOT pointed at, its flows died silently (e.g. booking
 * payments would never settle). This module collapses both into ONE handler with ONE
 * idempotency claim, ONE Stripe client (lib/stripe/client), and the UNION of every event —
 * each overlap resolved to the superset-correct handler. Both route files are now thin
 * shims that call `handleStripeWebhook`, so EITHER URL works identically.
 *
 * Design for testability: routing is a PURE function `classifyStripeEvent(event)` that maps
 * an event to a `StripeAction` descriptor (no I/O). `processStripeEvent` executes the action
 * by calling the already-tested side-effect helpers. `handleStripeWebhook` is the HTTP entry
 * (verify signature → claim idempotency → dispatch). The pure classifier is exhaustively
 * unit-tested so we can prove no money flow is dropped or misrouted.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY      — Stripe API secret (lib/stripe/client builds the singleton)
 *   STRIPE_WEBHOOK_SECRET  — signing secret used to verify the event signature
 *
 * Security: the route MUST NOT sit behind auth middleware. Signature verification is the
 * only auth mechanism.
 *
 * Idempotency: each event.id is claimed in `stripe_processed_events` on entry. Duplicate
 * deliveries short-circuit with 200. On a TRANSIENT handler failure we RELEASE the claim
 * before returning 5xx, so Stripe's retry actually re-runs the handler (a claim that
 * outlives a failed attempt would make retries no-ops and silently lose paid events).
 */

import { NextResponse } from "next/server";
import {
  classifyStripeEvent,
  interpretClaimError,
  isTalentSubscription,
  WORKSPACE_PLAN_KEYS,
  type StripeAction,
} from "@/lib/stripe/webhook-routing";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { syncStripeSubscriptionToDb } from "@/lib/stripe/workspace-billing";
import { syncTalentSubscriptionToDb } from "@/lib/stripe/talent-billing";
import {
  syncClientVerificationToDb,
  syncClientBalanceTopupToDb,
  syncClientBalanceRefundToDb,
} from "@/lib/stripe/client-billing";
import {
  persistAccountSnapshot,
  findAgencyByStripeAccountId,
} from "@/lib/payments/stripe-connect";
import {
  persistTalentAccountSnapshot,
  findTalentByStripeAccountId,
} from "@/lib/payments/stripe-connect-talent";
import { handleTalentStripeSubscriptionEvent } from "@/lib/payments/stripe-talent-subscription";
import { markPaid } from "@/lib/bookings/transactions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import type Stripe from "stripe";

// ─── Error classification ─────────────────────────────────────────────────────

/**
 * Thrown by handlers when the failure is transient (DB unavailable, Stripe API
 * blip). The entry catches it, RELEASES the idempotency claim, and returns 5xx
 * so Stripe retries with its exponential backoff. Permanent failures (bad
 * metadata, unknown checkout_type) instead `logServerError` + return without
 * throwing — those yield 200 so Stripe doesn't retry forever.
 */
export class TransientWebhookError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "TransientWebhookError";
  }
}

function ensureSyncOk(
  context: string,
  result: { ok: true; data?: unknown } | { ok: false; error: string },
): void {
  if (!result.ok) {
    // Sync-function failures almost always mean the DB or Stripe API was
    // unavailable — exactly the case Stripe's retry mechanism is for.
    throw new TransientWebhookError(`${context}: ${result.error}`);
  }
}

// ─── Side-effect dispatch ─────────────────────────────────────────────────────

/** Sync a workspace OR talent subscription object (used for checkout-init + invoice-failed). */
async function syncSubscriptionByType(
  subscription: Stripe.Subscription,
  eventId: string,
): Promise<void> {
  const checkoutType = subscription.metadata?.checkout_type;
  const planKey = subscription.metadata?.plan_key;

  if (isTalentSubscription(subscription.metadata)) {
    ensureSyncOk(
      "talent_subscription_sync",
      await syncTalentSubscriptionToDb(subscription, planKey ?? "talent_pro"),
    );
    return;
  }
  if (checkoutType === "workspace_subscription" || (planKey && WORKSPACE_PLAN_KEYS.has(planKey))) {
    ensureSyncOk(
      "workspace_subscription_sync",
      await syncStripeSubscriptionToDb(subscription, planKey ?? "studio"),
    );
    return;
  }
  logServerError(
    "stripe-webhook.subscription.unknown_type",
    `subscription ${subscription.id} unknown checkout_type=${checkoutType ?? "<missing>"} plan_key=${planKey ?? "<missing>"} (event ${eventId})`,
  );
}

/** Persist a booking deposit (agency_bookings) from a PaymentIntent. */
async function markBookingDepositPaid(action: Extract<StripeAction, { kind: "booking_deposit" }>): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) throw new TransientWebhookError("service-role client unavailable for booking_deposit");
  const { error } = await admin
    .from("agency_bookings")
    .update({
      deposit_paid_at: new Date().toISOString(),
      deposit_amount_cents: action.amountCents,
      deposit_currency: action.currency,
      deposit_payment_intent_id: action.paymentIntentId,
    })
    .eq("id", action.bookingId);
  if (error) throw new TransientWebhookError(`booking_deposit update failed: ${error.message ?? error}`);
}

async function persistConnectAccount(accountId: string, eventId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) throw new TransientWebhookError("Stripe client unavailable for capability.updated");
  // capability.updated only carries the capability; re-fetch the full account.
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (err) {
    throw new TransientWebhookError(`accounts.retrieve failed for ${accountId}`, err);
  }
  await persistAccountFromObject(account, eventId);
}

/** account.updated path: resolve agency first, then talent, then ack-and-log unknown. */
async function persistAccountFromObject(account: Stripe.Account, eventId: string): Promise<void> {
  const agency = await findAgencyByStripeAccountId(account.id);
  if (agency) {
    const result = await persistAccountSnapshot(agency.agencyId, account);
    if (!result.ok) throw new TransientWebhookError(`account persist (agency) failed: ${result.error}`);
    return;
  }
  const talent = await findTalentByStripeAccountId(account.id);
  if (talent) {
    const result = await persistTalentAccountSnapshot(talent.talentProfileId, account);
    if (!result.ok) throw new TransientWebhookError(`account persist (talent) failed: ${result.error}`);
    return;
  }
  // Unknown account — log + silently ack so Stripe stops retrying.
  logServerError(
    "stripe-webhook.account.unknown",
    `no agency or talent for stripe_account_id=${account.id} (event ${eventId})`,
  );
}

/**
 * Execute the classified action. Throws `TransientWebhookError` for retryable
 * failures; logs + returns for permanent ones.
 */
export async function processStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  const action = classifyStripeEvent(event);

  switch (action.kind) {
    case "client_verification":
      ensureSyncOk(
        "client_verification",
        await syncClientVerificationToDb(action.userId, action.tenantId, action.sessionId),
      );
      return;

    case "client_balance_topup":
      ensureSyncOk(
        "client_balance_topup",
        await syncClientBalanceTopupToDb({
          userId: action.userId,
          tenantId: action.tenantId,
          amountCents: action.amountCents,
          paymentIntentId: action.paymentIntentId,
        }),
      );
      return;

    case "booking_payment": {
      const result = await markPaid(action.transactionId);
      if (!result.ok) {
        // markPaid is idempotent (sets status=paid); a failure here is almost
        // always a transient DB blip. Retry rather than silently lose a paid
        // booking — the idempotency claim is released before the 5xx.
        throw new TransientWebhookError(`markPaid(${action.transactionId}): ${result.error}`);
      }
      return;
    }

    case "subscription_checkout": {
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(action.subscriptionId, {
          expand: ["items.data.price", "customer"],
        });
      } catch (err) {
        throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
      }
      await syncSubscriptionByType(subscription, event.id);
      return;
    }

    case "subscription_lifecycle_talent":
      // Preserves the talent-site provisioning side-effect (onTalentPlanChanged)
      // and the robust talent_profile resolution that the workspace sync lacks.
      await handleTalentStripeSubscriptionEvent(event);
      return;

    case "subscription_lifecycle_workspace":
      ensureSyncOk(
        "workspace_subscription_sync",
        await syncStripeSubscriptionToDb(event.data.object as Stripe.Subscription, action.planKey),
      );
      return;

    case "subscription_unknown":
      logServerError(
        "stripe-webhook.subscription.unknown_type",
        `unknown checkout_type=${action.checkoutType ?? "<missing>"} plan_key=${action.planKey ?? "<missing>"} (event ${event.id})`,
      );
      return;

    case "invoice_payment_failed": {
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(action.subscriptionId);
      } catch (err) {
        throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
      }
      await syncSubscriptionByType(subscription, event.id);
      return;
    }

    case "charge_refunded":
      ensureSyncOk(
        "client_balance_refund",
        await syncClientBalanceRefundToDb({
          paymentIntentId: action.paymentIntentId,
          refundedAmountCents: action.refundedCents,
          chargeId: action.chargeId,
        }),
      );
      return;

    case "booking_deposit":
      await markBookingDepositPaid(action);
      return;

    case "connect_account_updated":
      await persistAccountFromObject(event.data.object as Stripe.Account, event.id);
      return;

    case "capability_updated":
      await persistConnectAccount(action.accountId, event.id);
      return;

    case "charge_dispute":
      // Log only today. B3 will route this to the notification engine + pause
      // trust elevation. Kept here so the event is acknowledged (no retry storm).
      logServerError(
        "stripe-webhook.dispute.created",
        `dispute ${action.disputeId} amount=${action.amount} reason=${action.reason} status=${action.status} (event ${event.id})`,
      );
      return;

    case "trial_will_end":
      // Log only today. B3 will notify the talent / workspace owner.
      logServerError(
        "stripe-webhook.trial_will_end",
        `subscription ${action.subscriptionId} trial_end=${action.trialEnd} (event ${event.id})`,
      );
      return;

    case "payment_intent_failed":
      // Best-effort: the client may retry the same Checkout session, so we don't
      // mark the transaction failed — just log. B3 may add a dunning notify.
      if (action.transactionId) {
        logServerError(
          "stripe-webhook.paymentIntent.failed",
          `transaction ${action.transactionId} payment_intent failed (event ${event.id})`,
        );
      }
      return;

    case "payout_event":
      // Log only today. B5 will persist payout history for agency visibility.
      if (process.env.NODE_ENV !== "production") {
        void improntaLog("stripe_webhook.info", {
          message: `[stripe.connect] ${action.eventType} acct=${action.accountId ?? "?"} payout=${action.payoutId} amount=${action.amount} ${action.currency}`,
        });
      }
      return;

    case "invoice_payment_succeeded":
      // Subscription renewal billed — no entitlement change. Log for audit.
      if (process.env.NODE_ENV !== "production") {
        void improntaLog("stripe_webhook.info", {
          message: `[stripe.subscription] invoice paid customer=${action.customerId ?? "?"} amount=${action.amountPaid} ${action.currency}`,
        });
      }
      return;

    case "invalid":
      // Permanent: malformed event we can't act on. Log + ack (no retry).
      logServerError("stripe-webhook.invalid", `${action.reason} (event ${event.id} type=${event.type})`);
      return;

    case "ignore":
      return;
  }
}

// ─── Event-level idempotency ──────────────────────────────────────────────────

/**
 * Returns `true` when this event.id was already processed (caller should
 * short-circuit with 200). Returns `false` when the event was just claimed.
 *
 * Insert-on-claim: INSERT first; ON CONFLICT (23505) means another delivery
 * already won. The handler runs only when we successfully claimed the row.
 */
export async function claimEventForProcessing(event: Stripe.Event): Promise<boolean> {
  const sb = createServiceRoleClient();
  if (!sb) {
    // No service-role key → idempotency is best-effort. Don't block the webhook
    // on missing infra; the per-handler upserts are still safe.
    return false;
  }
  const { error } = await sb.from("stripe_processed_events").insert({
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode ?? null,
    api_version: event.api_version ?? null,
  });
  if (!error) return false; // claimed; first delivery
  if (interpretClaimError(error) === "duplicate") return true;
  logServerError("stripe-webhook.idempotency-claim", error);
  return false; // best effort: proceed
}

// `interpretClaimError` (the pure 23505→duplicate classifier) now lives in
// `webhook-routing.ts` and is imported above — it is unit-tested there.

/**
 * Release a claim so a transient failure can be retried. Without this, the
 * claim row outlives the failed attempt and Stripe's retry short-circuits as
 * "already processed" — silently dropping a paid event.
 */
async function releaseEventClaim(eventId: string): Promise<void> {
  const sb = createServiceRoleClient();
  if (!sb) return;
  const { error } = await sb.from("stripe_processed_events").delete().eq("event_id", eventId);
  if (error) logServerError("stripe-webhook.idempotency-release", error);
}

// ─── HTTP entry ────────────────────────────────────────────────────────────────

/**
 * The one webhook entry. Both /api/stripe/webhook and /api/webhooks/stripe are
 * thin shims over this, so EITHER configured URL behaves identically and shares
 * one idempotency ledger.
 */
export async function handleStripeWebhook(req: Request): Promise<NextResponse> {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logServerError("stripe-webhook", "STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const stripe = getStripe()!;
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    logServerError("stripe-webhook.verify", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency: claim the event id, short-circuit duplicates.
  const alreadyProcessed = await claimEventForProcessing(event);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  try {
    await processStripeEvent(event, stripe);
  } catch (err) {
    logServerError(`stripe-webhook.${event.type}`, err);
    // Release the claim so the retry actually re-runs this handler. Both
    // transient and unexpected failures are treated as retryable — better to
    // retry an unknown failure than silently lose a paid event.
    await releaseEventClaim(event.id);
    return NextResponse.json(
      { error: "Processing failure; will retry." },
      { status: 503 },
    );
  }

  return NextResponse.json({ received: true });
}
