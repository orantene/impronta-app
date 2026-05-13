/**
 * POST /api/stripe/webhook
 *
 * Receives and verifies Stripe webhook events, then syncs billing state to the DB.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY         — Stripe API secret
 *   STRIPE_WEBHOOK_SECRET     — Signing secret from the Stripe Dashboard webhook endpoint
 *
 * Events handled:
 *   checkout.session.completed          → subscription activated OR one-time payment
 *     • workspace_subscription           → sync plan to DB
 *     • talent_subscription              → sync talent plan to DB
 *     • client_verification              → set verified_at, re-evaluate trust level
 *     • client_balance_topup             → append ledger, increment balance, re-evaluate
 *   customer.subscription.updated       → plan change / renewal / cancellation toggle
 *   customer.subscription.deleted       → subscription cancelled → downgrade to free
 *   customer.subscription.trial_will_end → log; future: notify talent / agency
 *   invoice.payment_failed              → mark past_due
 *   charge.refunded                     → reverse balance top-up if linked
 *   charge.dispute.created              → log; future: pause trust elevation
 *   account.updated                     → sync connected-account snapshot
 *                                         to agencies row (Connect onboarding,
 *                                         charges/payouts toggles)
 *
 * Security: this route MUST NOT be behind authentication middleware.
 * Stripe signature verification is the only auth mechanism.
 *
 * Idempotency: each event.id is recorded in `stripe_processed_events` on
 * entry. Duplicate deliveries short-circuit at the top with 200.
 *
 * Error handling: distinguishes transient (DB/network failures → 5xx so
 * Stripe retries with backoff) from permanent (malformed metadata,
 * unsupported checkout_type → log + 200 so Stripe doesn't retry forever).
 */

import { NextResponse } from "next/server";
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
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// ─── Error classification ─────────────────────────────────────────────────────

/**
 * Thrown by handlers when the failure is transient (DB unavailable, Stripe API
 * blip). The webhook entry catches it and returns 5xx so Stripe retries with
 * its exponential backoff. Permanent failures (bad metadata, unknown
 * checkout_type) instead `logServerError` + return without throwing — those
 * yield 200 so Stripe doesn't retry forever.
 */
class TransientWebhookError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "TransientWebhookError";
  }
}

function ensureSyncOk(
  context: string,
  result: { ok: true; data?: unknown } | { ok: false; error: string },
): void {
  if (!result.ok) {
    // Treat sync-function failures as transient — they almost always mean
    // the DB or Stripe API was unavailable, which is exactly the case
    // Stripe's retry mechanism is for.
    throw new TransientWebhookError(`${context}: ${result.error}`);
  }
}

// ─── Event-level idempotency (audit L1) ──────────────────────────────────────

/**
 * Returns `true` when this event.id was already processed (caller should
 * short-circuit with 200). Returns `false` when the event was just claimed
 * for processing.
 *
 * Insert-on-claim pattern: we INSERT first; ON CONFLICT means another
 * delivery already won the race. The actual handler then runs only when
 * we successfully claimed the row.
 */
async function claimEventForProcessing(event: Stripe.Event): Promise<boolean> {
  const sb = createServiceRoleClient();
  if (!sb) {
    // No service-role key → idempotency is best-effort. Don't block the
    // webhook on missing infra; the per-handler upserts are still safe.
    return false;
  }

  const { error } = await sb.from("stripe_processed_events").insert({
    event_id:    event.id,
    event_type:  event.type,
    livemode:    event.livemode ?? null,
    api_version: event.api_version ?? null,
  });

  if (!error) return false; // claimed; we're the first delivery
  if ((error as { code?: string }).code === "23505") return true; // duplicate
  // Insert failed for some other reason — log and proceed (best effort).
  logServerError("stripe-webhook.idempotency-claim", error);
  return false;
}

// ─── Handlers per event type ──────────────────────────────────────────────────

async function handleCheckoutCompleted(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const checkoutType = session.metadata?.checkout_type;

  // ── One-time payment modes (client trust economics) ─────────────────────
  if (session.mode === "payment") {
    const userId = session.metadata?.user_id;
    const tenantId = session.metadata?.tenant_id;

    if (!userId || !tenantId) {
      logServerError(
        "stripe-webhook.checkout.payment",
        `Missing user_id or tenant_id in metadata (event ${event.id})`,
      );
      return; // permanent: don't retry
    }

    if (checkoutType === "client_verification") {
      const sessionId = session.id;
      const result = await syncClientVerificationToDb(userId, tenantId, sessionId);
      ensureSyncOk("client_verification", result);
      return;
    }

    if (checkoutType === "client_balance_topup") {
      const amountCents = parseInt(session.metadata?.amount_cents ?? "0", 10);
      if (!amountCents) {
        logServerError(
          "stripe-webhook.checkout.topup",
          `Missing or zero amount_cents (event ${event.id})`,
        );
        return; // permanent
      }
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;
      const result = await syncClientBalanceTopupToDb({
        userId,
        tenantId,
        amountCents,
        paymentIntentId,
      });
      ensureSyncOk("client_balance_topup", result);
      return;
    }

    logServerError(
      "stripe-webhook.checkout.payment",
      `Unknown checkout_type=${checkoutType ?? "<missing>"} (event ${event.id})`,
    );
    return; // permanent: unknown one-time payment type
  }

  // ── Subscription modes (workspace + talent plans) ────────────────────────
  if (session.mode !== "subscription") return;

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subId) {
    logServerError("stripe-webhook.checkout.subscription", `No subscription ID in session (event ${event.id})`);
    return; // permanent
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data.price", "customer"],
    });
  } catch (err) {
    throw new TransientWebhookError(
      `stripe.subscriptions.retrieve failed for ${subId}`,
      err,
    );
  }

  await routeSubscriptionEvent(
    subscription,
    session.metadata?.checkout_type ?? subscription.metadata?.checkout_type,
    session.metadata?.plan_key ?? subscription.metadata?.plan_key,
    event.id,
  );
}

async function handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await routeSubscriptionEvent(
    subscription,
    subscription.metadata?.checkout_type,
    subscription.metadata?.plan_key,
    event.id,
  );
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subRef = invoice.parent?.subscription_details?.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;

  if (!subId) {
    logServerError(
      "stripe-webhook.invoiceWithoutSub",
      `invoice ${invoice.id} has no parent.subscription_details.subscription (event ${event.id})`,
    );
    return;
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subId);
  } catch (err) {
    throw new TransientWebhookError(
      `stripe.subscriptions.retrieve failed for ${subId}`,
      err,
    );
  }

  await routeSubscriptionEvent(
    subscription,
    subscription.metadata?.checkout_type,
    subscription.metadata?.plan_key,
    event.id,
  );
}

async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) return; // not from a tracked top-up

  // Calculate the refunded amount: charge.amount_refunded is cumulative.
  const refundedCents = charge.amount_refunded;
  if (!refundedCents || refundedCents <= 0) return;

  const result = await syncClientBalanceRefundToDb({
    paymentIntentId,
    refundedAmountCents: refundedCents,
    chargeId: charge.id,
  });
  ensureSyncOk("client_balance_refund", result);
}

async function handleChargeDisputeCreated(event: Stripe.Event): Promise<void> {
  // For now: log only. Future: pause trust elevation, notify staff.
  const dispute = event.data.object as Stripe.Dispute;
  logServerError(
    "stripe-webhook.dispute.created",
    `dispute ${dispute.id} amount=${dispute.amount} reason=${dispute.reason} status=${dispute.status} (event ${event.id})`,
  );
}

async function handleTrialWillEnd(event: Stripe.Event): Promise<void> {
  // For now: log only. Future: write to a notifications table or send an
  // in-app banner state.
  const subscription = event.data.object as Stripe.Subscription;
  logServerError(
    "stripe-webhook.trial_will_end",
    `subscription ${subscription.id} trial_end=${subscription.trial_end} (event ${event.id})`,
  );
}

/**
 * Phase B PR 3 — Connect `account.updated` handler.
 *
 * Stripe fires this every time the connected account's state changes
 * (KYC complete, capabilities updated, charges or payouts toggled,
 * requirements added, etc). We resolve the account id → agency row
 * and call the shared `persistAccountSnapshot` so the agencies row
 * stays in sync with Stripe's source of truth.
 *
 * Unknown accounts (not in `agencies`) are logged and silently
 * acknowledged — we never want to 4xx a webhook for an account that
 * was disconnected on our side but is still flapping on Stripe's.
 */
async function handleConnectAccountUpdated(event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  const accountId = account.id;
  if (!accountId) return;

  // Try agency-bound first. Most Connect events on this platform are
  // agency accounts (Phase B PR 3 onboarding).
  const agency = await findAgencyByStripeAccountId(accountId);
  if (agency) {
    const result = await persistAccountSnapshot(agency.agencyId, account);
    if (!result.ok) {
      throw new Error(`account.updated agency persist failed: ${result.error}`);
    }
    return;
  }

  // Slice K wiring (item #12): fall through to talent-bound accounts.
  // Talent Express accounts get the same persist path against
  // talent_profiles. See web/src/lib/payments/stripe-connect-talent.ts.
  const talent = await findTalentByStripeAccountId(accountId);
  if (talent) {
    const result = await persistTalentAccountSnapshot(talent.talentProfileId, account);
    if (!result.ok) {
      throw new Error(`account.updated talent persist failed: ${result.error}`);
    }
    return;
  }

  // Unknown account — log and silently ack so Stripe stops retrying.
  // Account was likely disconnected on our side but Stripe is still
  // flapping it.
  logServerError(
    "stripe-webhook.account.updated.unknown",
    `no agency or talent for stripe_account_id=${accountId} (event ${event.id})`,
  );
}

// ─── Subscription router (audit C5) ──────────────────────────────────────────

async function routeSubscriptionEvent(
  subscription: Stripe.Subscription,
  checkoutType: string | undefined,
  planKey: string | undefined,
  eventId: string,
): Promise<void> {
  // Audit C5: require an explicit checkout_type discriminator. The previous
  // implementation defaulted unknown subscriptions into the workspace sync,
  // which would write a talent subscription row into workspace_subscriptions
  // if metadata was lost. Reject explicitly.
  if (checkoutType === "talent_subscription") {
    const result = await syncTalentSubscriptionToDb(
      subscription,
      planKey ?? "talent_basic",
    );
    ensureSyncOk("talent_subscription_sync", result);
    return;
  }

  if (checkoutType === "workspace_subscription") {
    const result = await syncStripeSubscriptionToDb(
      subscription,
      planKey ?? "studio",
    );
    ensureSyncOk("workspace_subscription_sync", result);
    return;
  }

  // Backwards compat: subscriptions created BEFORE we required explicit
  // workspace_subscription tagging won't have checkout_type. Recognize
  // workspace plans by plan_key so legacy subs keep syncing.
  if (planKey === "studio" || planKey === "agency" || planKey === "network") {
    const result = await syncStripeSubscriptionToDb(subscription, planKey);
    ensureSyncOk("workspace_subscription_sync", result);
    return;
  }

  logServerError(
    "stripe-webhook.subscription.unknown_type",
    `subscription ${subscription.id} has unknown checkout_type=${checkoutType ?? "<missing>"} plan_key=${planKey ?? "<missing>"} (event ${eventId})`,
  );
  // Permanent: don't retry an event with no recognizable routing key.
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
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
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event, stripe);
        break;

      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event, stripe);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event);
        break;

      case "charge.dispute.created":
        await handleChargeDisputeCreated(event);
        break;

      // ─── Connect events (Phase B PR 3) ──────────────────────────────────
      // `account.updated` fires whenever the Express account's
      // capabilities, requirements, or charges/payouts flags change —
      // e.g. when KYC completes, when Stripe disables charges, when the
      // owner updates bank details. We just refresh the snapshot on the
      // agencies row so `canRouteCheckoutsToAgency` reflects reality.
      case "account.updated":
        await handleConnectAccountUpdated(event);
        break;

      default:
        // Unhandled event type — acknowledged but not processed.
        break;
    }
  } catch (err) {
    logServerError(`stripe-webhook.${event.type}`, err);
    if (err instanceof TransientWebhookError) {
      // Audit C3: return 5xx so Stripe retries. Permanent errors are
      // already handled inside each handler with log-and-return.
      return NextResponse.json(
        { error: "Transient processing failure; will retry." },
        { status: 503 },
      );
    }
    // Unexpected error (not classified as transient): treat as transient
    // by default — better to retry an unknown failure than silently lose
    // a paid event. If a deterministic bug is causing repeated retries,
    // fix the bug or classify it as permanent.
    return NextResponse.json(
      { error: "Unexpected processing failure; will retry." },
      { status: 503 },
    );
  }

  return NextResponse.json({ received: true });
}
