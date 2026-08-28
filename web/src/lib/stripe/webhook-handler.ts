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
import { emitBookingConfirmation } from "@/lib/payments/booking-confirmation";
import { releaseHeldPayouts, syncBookingPayoutLifecycle } from "@/lib/payments/booking-payouts-ledger";
import { handleBookingRefund, handleBookingDispute } from "@/lib/payments/refunds";
import { notifyTrialWillEnd } from "@/lib/notifications/producers/trial-notify";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  extractSubscriptionDiscount,
  isUnexpandedDiscount,
} from "@/lib/billing/subscription-discounts";
import { logServerError } from "@/lib/server/safe-error";
import { applyCampaignGrantForDiscount } from "@/lib/billing/apply-campaign-grant";
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
/**
 * Count one code redemption, if the subscription that just started carries one
 * of our catalog coupons.
 *
 * WHY: `product_discounts.redemption_count` was written by nothing. It sat at
 * zero forever, which meant `max_redemptions` was a number the admin could type
 * and the product would never honour — a "first 50 customers" campaign had no
 * fiftieth customer. `per_customer_limit` was the same promise, unkept for the
 * same reason. The `discount_redemptions` ledger is what makes both answerable.
 *
 * BEST EFFORT, ALWAYS. A ledger write must never 5xx a webhook: Stripe would
 * retry the whole event, and the money-side work above this line already
 * succeeded. Two layers of idempotency stand behind it — this branch is already
 * claimed by the event-level ledger, and the RPC's UNIQUE(stripe_event_id)
 * makes a replay a no-op even if the claim is bypassed.
 */
async function recordDiscountRedemption(
  subscription: Stripe.Subscription,
  eventId: string,
): Promise<void> {
  try {
    const mirror = extractSubscriptionDiscount(subscription);
    if (!mirror || isUnexpandedDiscount(mirror) || !mirror.couponId) return;

    const tenantId = subscription.metadata?.tenant_id ?? null;
    const talentProfileId = subscription.metadata?.talent_profile_id ?? null;
    if (!tenantId && !talentProfileId) return;

    const sb = createServiceRoleClient();
    if (!sb) return;

    const { data: recorded, error } = await sb.rpc("record_discount_redemption", {
      p_stripe_coupon_id: mirror.couponId,
      p_stripe_event_id: eventId,
      p_subject_type: talentProfileId ? "talent" : "workspace",
      p_tenant_id: tenantId as string,
      p_talent_profile_id: talentProfileId as string,
      p_stripe_subscription_id: subscription.id,
    });
    if (error) logServerError("stripe-webhook.discount-redemption", error);

    // The entitlement half of a campaign, applied exactly once. `recorded` is
    // the RPC's own idempotency answer: true ONLY on the insert that actually
    // happened, so a replayed webhook cannot hand out a second free upgrade.
    // Workspace subjects only, and best-effort -- a courtesy grant that fails
    // must never fail the webhook that delivered the payment.
    if (recorded === true && tenantId) {
      const outcome = await applyCampaignGrantForDiscount({
        stripeCouponId: mirror.couponId,
        tenantId,
      });
      if (outcome.applied) {
        logServerError(
          "stripe-webhook.campaign-grant.applied",
          `tenant ${tenantId} granted ${outcome.planTier} until ${outcome.expiresAt}`,
        );
      }
    }
  } catch (err) {
    logServerError("stripe-webhook.discount-redemption", err);
  }
}

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
  // When an account flips to payouts-enabled, forward any payouts that were
  // held while it was still onboarding (else they're stranded on the platform).
  const payoutsEnabled = !!account.payouts_enabled;

  const agency = await findAgencyByStripeAccountId(account.id);
  if (agency) {
    const result = await persistAccountSnapshot(agency.agencyId, account);
    if (!result.ok) throw new TransientWebhookError(`account persist (agency) failed: ${result.error}`);
    if (payoutsEnabled) {
      // Best-effort — never let release failure fail the webhook ack.
      try {
        await releaseHeldPayouts({ tenantId: agency.agencyId });
      } catch (err) {
        logServerError(`stripe-webhook.release[agency=${agency.agencyId}]`, err);
      }
    }
    return;
  }
  const talent = await findTalentByStripeAccountId(account.id);
  if (talent) {
    const result = await persistTalentAccountSnapshot(talent.talentProfileId, account);
    if (!result.ok) throw new TransientWebhookError(`account persist (talent) failed: ${result.error}`);
    if (payoutsEnabled) {
      try {
        await releaseHeldPayouts({ talentProfileId: talent.talentProfileId });
      } catch (err) {
        logServerError(`stripe-webhook.release[talent=${talent.talentProfileId}]`, err);
      }
    }
    return;
  }
  // Unknown account — log + silently ack so Stripe stops retrying.
  logServerError(
    "stripe-webhook.account.unknown",
    `no agency or talent for stripe_account_id=${account.id} (event ${eventId})`,
  );
}

/** Audit #5: pull the actually-charged amount + currency from the settlement event
 *  (PaymentIntent or Checkout Session) so it can be reconciled against the booking
 *  transaction before payout. Returns null for event types without a clear amount. */
function extractChargedAmount(event: Stripe.Event): { amountCents: number; currency: string } | null {
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    return { amountCents: pi.amount ?? 0, currency: pi.currency ?? "" };
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    return { amountCents: s.amount_total ?? 0, currency: s.currency ?? "" };
  }
  return null;
}

/**
 * Reconcile a failed/reversed Connect transfer into the booking_payouts ledger.
 *
 * A Connect leg is written 'transferred' optimistically at create time
 * (disburse.connectTransfer). For a USDC payout the USD transfer auto-converts to
 * USDC at Stripe; if that conversion later fails/returns — or the transfer is
 * reversed for any reason — this flips the matching leg OFF 'transferred' so the
 * talent isn't shown paid against money that didn't land, and the held/retry
 * machinery (releaseHeldPayouts) can re-attempt it. Mirrors
 * `applyOutboundPaymentEvent` (webhook-v2.ts) for the v1 Connect rail.
 *
 * Looks the leg up by `stripe_transfer_id` (= the tr_… id). Idempotent: never
 * downgrades a 'reversed' leg, and a re-delivery of the same failure is a no-op.
 * Flips the matching leg to 'failed' and re-syncs the booking's payout_lifecycle so
 * it reflects the now-failed leg (a talent is not shown paid against money that did
 * not land). Best-effort: a transient DB error throws so Stripe retries; everything else acks.
 */
async function applyConnectTransferSettlement(
  action: Extract<StripeAction, { kind: "transfer_settlement" }>,
): Promise<void> {
  if (!action.failed) return; // only act on a non-settlement (reversed/returned)
  const sb = createServiceRoleClient();
  if (!sb) throw new TransientWebhookError("service-role client unavailable for transfer_settlement");

  const { data: leg, error: readErr } = await sb
    .from("booking_payouts")
    .select("id, booking_id, status, attempts")
    .eq("stripe_transfer_id", action.transferId)
    .maybeSingle();
  if (readErr) {
    throw new TransientWebhookError(`transfer_settlement read failed: ${readErr.message ?? readErr}`);
  }
  if (!leg) {
    // Not one of our payout legs (or not recorded yet) — log + ack.
    if (process.env.NODE_ENV !== "production") {
      void improntaLog("stripe_webhook.info", {
        message: `[stripe.connect] ${action.eventType} transfer=${action.transferId} no matching booking_payouts leg`,
      });
    }
    return;
  }

  const legId = leg.id as string;
  const bookingId = leg.booking_id as string;
  const current = leg.status as string;

  // Idempotent / safety: a reversed leg (the dispute/refund clawback path already
  // owns it) is never downgraded; an already-failed leg is a no-op.
  if (current === "reversed" || current === "failed") return;

  const nowIso = new Date().toISOString();
  const { error: writeErr } = await sb
    .from("booking_payouts")
    .update({
      status: "failed",
      attempts: ((leg.attempts as number) ?? 0) + 1,
      last_error: `connect ${action.eventType}${action.amountReversed ? ` reversed=${action.amountReversed} ${action.currency}` : ""}`,
      updated_at: nowIso,
    })
    .eq("id", legId);
  if (writeErr) {
    throw new TransientWebhookError(`transfer_settlement update failed: ${writeErr.message ?? writeErr}`);
  }
  // A talent leg coming undone must pull the booking back out of 'paid'.
  await syncBookingPayoutLifecycle(sb, bookingId);
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
      // Audit #5: verify the actually-charged amount + currency match the booking
      // transaction BEFORE marking paid + disbursing. The PaymentIntent is
      // idempotency-keyed at its first amount, so a later gross edit can silently
      // diverge; auto-paying out on a mismatched charge would over/under-pay the
      // talent. On mismatch, skip markPaid and flag for manual reconciliation
      // (logged) instead of auto-paying the wrong amount.
      const charged = extractChargedAmount(event);
      if (charged) {
        const sbGuard = createServiceRoleClient();
        if (sbGuard) {
          const { data: txnRow } = await sbGuard
            .from("booking_transactions")
            .select("gross_amount_cents, currency")
            .eq("id", action.transactionId)
            .maybeSingle();
          if (
            txnRow &&
            (Number(txnRow.gross_amount_cents) !== charged.amountCents ||
              String(txnRow.currency).toLowerCase() !== charged.currency.toLowerCase())
          ) {
            logServerError(
              "stripe-webhook.booking_payment.amount_mismatch",
              new Error(
                `charged ${charged.amountCents} ${charged.currency} != txn ${txnRow.gross_amount_cents} ${txnRow.currency} (txn ${action.transactionId}) — skipped markPaid for manual reconciliation`,
              ),
            );
            return;
          }
        }
      }
      const result = await markPaid(action.transactionId);
      if (!result.ok) {
        // markPaid is idempotent (sets status=paid); a failure here is almost
        // always a transient DB blip. Retry rather than silently lose a paid
        // booking — the idempotency claim is released before the 5xx.
        throw new TransientWebhookError(`markPaid(${action.transactionId}): ${result.error}`);
      }
      // Payment settled — fan out the confirmation (PDF → Files + email).
      // Best-effort + idempotent; never throws, so a confirmation hiccup
      // cannot fail the webhook and force a needless Stripe retry.
      await emitBookingConfirmation(action.transactionId);
      // The 3-way payout fan-out (talent + workspace; platform keeps its fee) now
      // happens INSIDE markPaid (audit #6), so every paid path disburses — incl. a
      // manual admin "Mark received", not just this webhook. Don't call it again
      // here (recordPayoutLeg plain-inserts, so a second run would duplicate ledger
      // rows; Stripe idempotency already prevents a double transfer).
      return;
    }

    case "subscription_checkout": {
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(action.subscriptionId, {
          // `discounts` is what lets the sync mirror an account discount (and,
          // just as importantly, NULL the mirror when one is removed) without a
          // second round-trip per webhook.
          expand: ["items.data.price", "customer", "discounts"],
        });
      } catch (err) {
        throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
      }
      await syncSubscriptionByType(subscription, event.id);
      await recordDiscountRedemption(subscription, event.id);
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
        subscription = await stripe.subscriptions.retrieve(action.subscriptionId, {
          expand: ["discounts"],
        });
      } catch (err) {
        throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
      }
      await syncSubscriptionByType(subscription, event.id);
      return;
    }

    case "charge_refunded": {
      // Booking refund? Mark it refunded + reverse the talent/workspace payouts
      // (full refunds only; partials are logged for manual handling). If the
      // refund isn't for a booking, fall through to the tracked balance-top-up
      // refund path. Best-effort — never throws — so a refund settled at Stripe
      // can't 5xx the webhook into a retry storm.
      const wasBookingRefund = await handleBookingRefund(stripe, {
        paymentIntentId: action.paymentIntentId,
        chargeId: action.chargeId,
        refundedCents: action.refundedCents,
        refundId: action.refundId,
        refundAmountCents: action.refundAmountCents,
      });
      if (!wasBookingRefund) {
        ensureSyncOk(
          "client_balance_refund",
          await syncClientBalanceRefundToDb({
            paymentIntentId: action.paymentIntentId,
            refundedAmountCents: action.refundedCents,
            chargeId: action.chargeId,
          }),
        );
      }
      return;
    }

    case "booking_deposit":
      await markBookingDepositPaid(action);
      return;

    case "connect_account_updated":
      await persistAccountFromObject(event.data.object as Stripe.Account, event.id);
      return;

    case "capability_updated":
      await persistConnectAccount(action.accountId, event.id);
      return;

    case "charge_dispute": {
      // Booking dispute? On OPEN (created) we flag the transaction + alert but do
      // NOT reverse — a dispute may be won and Stripe debits the platform on its
      // own. On CLOSE/LOST (audit #14) we reverse the payouts + refund the
      // booking; on CLOSE/WON we restore it to paid. Non-booking charges: log.
      const wasBookingDispute = await handleBookingDispute(stripe, {
        paymentIntentId: action.paymentIntentId,
        disputeId: action.disputeId,
        amount: action.amount,
        reason: action.reason,
        status: action.status,
        closed: action.closed,
      });
      if (!wasBookingDispute) {
        logServerError(
          action.closed ? "stripe-webhook.dispute.closed" : "stripe-webhook.dispute.created",
          `dispute ${action.disputeId} amount=${action.amount} reason=${action.reason} status=${action.status} closed=${action.closed} (event ${event.id})`,
        );
      }
      return;
    }

    case "trial_will_end": {
      // Notify the talent / workspace owner their trial is ending. Resolve the
      // recipient from the subscription metadata (set at checkout): a workspace
      // sub carries tenant_id, a talent sub carries talent_profile_id.
      let trialSub: Stripe.Subscription;
      try {
        trialSub = await stripe.subscriptions.retrieve(action.subscriptionId);
      } catch (err) {
        throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
      }
      const trialEndUnix = action.trialEnd ?? trialSub.trial_end ?? null;
      const trialEndIso = trialEndUnix ? new Date(trialEndUnix * 1000).toISOString() : null;
      const trialTenantId = trialSub.metadata?.tenant_id ?? null;
      const trialTalentProfileId = trialSub.metadata?.talent_profile_id ?? null;
      if (trialTenantId) {
        await notifyTrialWillEnd({
          scope: "workspace",
          tenantId: trialTenantId,
          talentProfileId: null,
          subscriptionId: trialSub.id,
          planKey: trialSub.metadata?.plan_key ?? null,
          trialEndIso,
        });
      } else if (trialTalentProfileId) {
        await notifyTrialWillEnd({
          scope: "talent",
          tenantId: null,
          talentProfileId: trialTalentProfileId,
          subscriptionId: trialSub.id,
          planKey: trialSub.metadata?.talent_plan_key ?? null,
          trialEndIso,
        });
      } else {
        logServerError(
          "stripe-webhook.trial_will_end.unresolved",
          `subscription ${trialSub.id} has neither tenant_id nor talent_profile_id metadata (event ${event.id})`,
        );
      }
      return;
    }

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

    case "transfer_settlement":
      // A Connect transfer leg was reversed/returned (e.g. a failed USD→USDC
      // auto-conversion) — flip the matching booking_payouts leg off 'transferred'
      // and re-sync the booking so the talent isn't shown paid against money that
      // didn't land. Idempotent; the held/retry machinery can re-attempt it.
      await applyConnectTransferSettlement(action);
      return;

    case "invoice_payment_succeeded": {
      // QA 2026-06-13: a renewal/dunning-recovery payment must re-sync the
      // subscription so a past_due plan returns to active (previously log-only,
      // leaving a recovered subscription stuck past_due until the next
      // subscription.updated). Mirrors invoice_payment_failed.
      if (process.env.NODE_ENV !== "production") {
        void improntaLog("stripe_webhook.info", {
          message: `[stripe.subscription] invoice paid customer=${action.customerId ?? "?"} amount=${action.amountPaid} ${action.currency}`,
        });
      }
      if (action.subscriptionId) {
        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(action.subscriptionId, {
            expand: ["discounts"],
          });
        } catch (err) {
          throw new TransientWebhookError(`subscriptions.retrieve failed for ${action.subscriptionId}`, err);
        }
        await syncSubscriptionByType(subscription, event.id);
      }
      return;
    }

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
  // Stripe splits deliveries across TWO endpoint types and each carries its own
  // signing secret:
  //   • account endpoint  — platform events (payment_intent.*, charge.*, …)
  //   • CONNECT endpoint  — connected-account events (account.updated,
  //     capability.updated, account.external_account.*)
  // Connected-account events are what tell us a talent finished onboarding, which
  // is what releases their held payouts. Verified live 2026-08-09: with only the
  // account endpoint registered, a Mexican talent completed onboarding, Stripe
  // emitted account.updated on her account, we never received it, and her $80
  // stayed held until the next daily cron. Accept either secret so ONE URL can
  // serve both endpoints.
  const webhookSecrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  if (webhookSecrets.length === 0) {
    logServerError("stripe-webhook", "STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const stripe = getStripe()!;
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event | null = null;
  let lastVerifyError: unknown = null;
  for (const secret of webhookSecrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret);
      break;
    } catch (err) {
      lastVerifyError = err;
    }
  }
  if (!event) {
    logServerError("stripe-webhook.verify", lastVerifyError);
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
