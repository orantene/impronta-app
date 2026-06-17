/**
 * lib/stripe/webhook-routing.ts
 *
 * The PURE routing core of the Stripe webhook handler. This module performs
 * NO I/O and has NO runtime dependencies — its only import is `import type`
 * (fully erased by the TypeScript→JS transform), so at runtime it is a leaf
 * module with zero edges. That isolation is deliberate:
 *
 *   • Routing is the P0-critical concern — "which money flow does each event
 *     trigger, and is anything dropped or misrouted?" Keeping it pure lets us
 *     prove the answer exhaustively in unit tests with no DB, no Stripe client,
 *     and no server-only shim.
 *   • `webhook-handler.ts` imports `classifyStripeEvent` from here and executes
 *     the resulting `StripeAction` via side-effect helpers. The split keeps the
 *     decision (pure) and the effects (impure) on opposite sides of a seam.
 *
 * See `webhook-handler.ts` for the HTTP entry, idempotency, and dispatch.
 */

import type Stripe from "stripe";

// ─── Action descriptor ─────────────────────────────────────────────────────────

/**
 * Discriminated description of what an event should DO. Producing this is pure
 * (no I/O), so the routing can be proven exhaustively in tests.
 *
 *   client_verification / client_balance_topup — client-trust economics (one-time)
 *   booking_payment                             — booking invoice via Checkout
 *   booking_deposit                             — booking deposit via PaymentIntent
 *   subscription_checkout                       — sub created; retrieve then sync
 *   subscription_lifecycle_talent               — talent plan update/delete
 *   subscription_lifecycle_workspace            — workspace plan update/delete
 *   subscription_unknown                        — sub with no recognizable routing key
 *   invoice_payment_failed                      — dunning; re-sync the subscription
 *   invoice_payment_succeeded                   — renewal billed; audit log
 *   charge_refunded                             — reverse a tracked balance top-up
 *   charge_dispute                              — created: flag+alert; closed/lost: reverse payouts
 *   trial_will_end                              — log today (B3 will notify)
 *   payment_intent_failed                       — best-effort log
 *   connect_account_updated / capability_updated — refresh Connect account snapshot
 *   payout_event                                — log today (B5 will persist)
 *   invalid                                     — malformed; permanent (no retry)
 *   ignore                                      — unhandled / not actionable
 */
export type StripeAction =
  | { kind: "client_verification"; userId: string; tenantId: string; sessionId: string }
  | {
      kind: "client_balance_topup";
      userId: string;
      tenantId: string;
      amountCents: number;
      paymentIntentId: string | null;
    }
  | { kind: "booking_payment"; transactionId: string }
  | { kind: "subscription_checkout"; subscriptionId: string }
  | { kind: "subscription_lifecycle_talent" }
  | { kind: "subscription_lifecycle_workspace"; planKey: string }
  | { kind: "subscription_unknown"; checkoutType: string | null; planKey: string | null }
  | { kind: "invoice_payment_failed"; subscriptionId: string }
  | {
      kind: "charge_refunded";
      paymentIntentId: string;
      /** Cumulative amount refunded on the charge (Stripe `amount_refunded`).
       *  Used only to decide full-vs-partial; the per-refund amount drives the
       *  recorded leg. */
      refundedCents: number;
      chargeId: string;
      /** The Stripe Refund object id (re_...) for THIS refund event — stable
       *  per refund, the event-based idempotency key the refund handler dedups
       *  on. Null when the charge carries no enumerable refund (legacy events). */
      refundId: string | null;
      /** This refund's OWN amount (Refund.amount), not the cumulative total.
       *  Additive partials each report only their own slice here. Falls back to
       *  the cumulative amount when no individual refund is enumerable. */
      refundAmountCents: number;
    }
  | { kind: "charge_dispute"; disputeId: string; paymentIntentId: string | null; amount: number; reason: string; status: string; closed: boolean }
  | { kind: "trial_will_end"; subscriptionId: string; trialEnd: number | null }
  | {
      kind: "booking_deposit";
      bookingId: string;
      amountCents: number;
      currency: string;
      paymentIntentId: string;
    }
  | { kind: "payment_intent_failed"; transactionId: string | null }
  | { kind: "connect_account_updated"; accountId: string }
  | { kind: "capability_updated"; accountId: string }
  | {
      kind: "payout_event";
      eventType: string;
      payoutId: string;
      accountId: string | null;
      amount: number;
      currency: string;
    }
  | { kind: "invoice_payment_succeeded"; subscriptionId: string | null; customerId: string | null; amountPaid: number; currency: string }
  | { kind: "invalid"; reason: string }
  | { kind: "ignore" };

// ─── Pure helpers ───────────────────────────────────────────────────────────────

export function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Resolve an expandable Stripe ref (string id | object with id | null) to its id. */
export function refId(ref: string | { id?: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id ?? null;
}

/** True when a subscription's metadata marks it as a talent (not workspace) plan. */
export function isTalentSubscription(metadata: Stripe.Metadata | null | undefined): boolean {
  if (!metadata) return false;
  return (
    metadata.checkout_type === "talent_subscription" ||
    !!metadata.talent_plan_key ||
    !!metadata.talent_profile_id
  );
}

export const WORKSPACE_PLAN_KEYS = new Set(["studio", "agency", "network"]);

// ─── The classifier ──────────────────────────────────────────────────────────────

/**
 * Pure: map a verified Stripe event to the action it should trigger. Never
 * performs I/O. Unknown / unhandled events resolve to `{ kind: "ignore" }`.
 */
export function classifyStripeEvent(event: Stripe.Event): StripeAction {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const checkoutType = session.metadata?.checkout_type ?? null;

      // One-time payment modes: client-trust economics OR a booking invoice.
      if (session.mode === "payment") {
        const userId = session.metadata?.user_id ?? null;
        const tenantId = session.metadata?.tenant_id ?? null;

        if (checkoutType === "client_verification") {
          if (!userId || !tenantId) {
            return { kind: "invalid", reason: "client_verification missing user_id/tenant_id" };
          }
          return { kind: "client_verification", userId, tenantId, sessionId: session.id };
        }

        if (checkoutType === "client_balance_topup") {
          if (!userId || !tenantId) {
            return { kind: "invalid", reason: "client_balance_topup missing user_id/tenant_id" };
          }
          const amountCents = parseInt(session.metadata?.amount_cents ?? "0", 10);
          if (!amountCents) {
            return { kind: "invalid", reason: "client_balance_topup missing/zero amount_cents" };
          }
          return {
            kind: "client_balance_topup",
            userId,
            tenantId,
            amountCents,
            paymentIntentId: refId(session.payment_intent),
          };
        }

        // Booking invoice: the transaction id rides on client_reference_id
        // (and/or metadata.transaction_id). This is the path that previously
        // only the SECOND route handled — fold it in.
        const transactionId =
          strOrNull(session.client_reference_id) ??
          strOrNull(session.metadata?.transaction_id);
        if (transactionId) {
          return { kind: "booking_payment", transactionId };
        }

        return { kind: "invalid", reason: `unknown one-time checkout_type=${checkoutType ?? "<missing>"}` };
      }

      // Subscription mode: workspace + talent plans (resolved after retrieve).
      if (session.mode === "subscription") {
        const subId = refId(session.subscription);
        if (!subId) {
          return { kind: "invalid", reason: "subscription checkout has no subscription id" };
        }
        return { kind: "subscription_checkout", subscriptionId: subId };
      }

      return { kind: "ignore" };
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const checkoutType = sub.metadata?.checkout_type ?? null;
      const planKey = sub.metadata?.plan_key ?? null;

      if (isTalentSubscription(sub.metadata)) {
        return { kind: "subscription_lifecycle_talent" };
      }
      if (checkoutType === "workspace_subscription") {
        return { kind: "subscription_lifecycle_workspace", planKey: planKey ?? "studio" };
      }
      // Legacy compat: subscriptions created before explicit tagging are
      // recognized by a known workspace plan_key.
      if (planKey && WORKSPACE_PLAN_KEYS.has(planKey)) {
        return { kind: "subscription_lifecycle_workspace", planKey };
      }
      return { kind: "subscription_unknown", checkoutType, planKey };
    }

    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      return { kind: "trial_will_end", subscriptionId: sub.id, trialEnd: sub.trial_end ?? null };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = refId(invoice.parent?.subscription_details?.subscription);
      if (!subId) {
        return { kind: "invalid", reason: `invoice ${invoice.id} has no parent subscription` };
      }
      return { kind: "invoice_payment_failed", subscriptionId: subId };
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        kind: "invoice_payment_succeeded",
        // QA 2026-06-13: expose the subscription id (mirrors invoice.payment_failed)
        // so a dunning-recovery payment re-syncs the subscription back to active.
        subscriptionId: refId(invoice.parent?.subscription_details?.subscription),
        customerId: refId(invoice.customer),
        amountPaid: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? "usd",
      };
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = refId(charge.payment_intent);
      const refundedCents = charge.amount_refunded ?? 0;
      if (!paymentIntentId || refundedCents <= 0) {
        return { kind: "ignore" }; // not a tracked top-up refund
      }
      // The Stripe Refund that this event is about. `charge.refunds.data` is
      // ordered newest-first; the most recent refund is the one this delivery
      // represents. We surface its id (re_...) + its OWN amount so the handler
      // dedups on the refund id (stable per refund — survives re-delivery) and
      // records the individual partial slice, NOT the cumulative total (which
      // grows with each additive partial). `charge.refunds` may be absent on a
      // trimmed/legacy payload → fall back to no-id + the cumulative amount.
      const refundsList = charge.refunds as { data?: Array<{ id?: string; amount?: number }> } | null;
      const latestRefund = refundsList?.data?.[0] ?? null;
      const refundId = latestRefund?.id ?? null;
      const refundAmountCents = latestRefund?.amount ?? refundedCents;
      return {
        kind: "charge_refunded",
        paymentIntentId,
        refundedCents,
        chargeId: charge.id,
        refundId,
        refundAmountCents,
      };
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      // `.closed` carries the terminal `status` ('lost' / 'won' / 'warning_closed');
      // `.created` is the opened alert. The handler reverses payouts only on a
      // LOST closed dispute.
      return {
        kind: "charge_dispute",
        disputeId: dispute.id,
        paymentIntentId: refId(dispute.payment_intent),
        amount: dispute.amount ?? 0,
        reason: dispute.reason ?? "unknown",
        status: dispute.status ?? "unknown",
        closed: event.type === "charge.dispute.closed",
      };
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      // Admin-initiated booking deposit (PI with purpose=booking_deposit).
      if ((intent.metadata?.purpose ?? null) === "booking_deposit") {
        const bookingId = strOrNull(intent.metadata?.booking_id);
        if (!bookingId) {
          return { kind: "invalid", reason: `booking_deposit PI ${intent.id} missing booking_id` };
        }
        return {
          kind: "booking_deposit",
          bookingId,
          amountCents: intent.amount ?? 0,
          currency: (intent.currency ?? "usd").toUpperCase(),
          paymentIntentId: intent.id,
        };
      }
      // Embedded client checkout (Payment Element): the booking-transaction id
      // rides on metadata.transaction_id. Same idempotent mark-paid path as
      // the hosted flow's checkout.session.completed. (The hosted flow's PI
      // does NOT carry transaction_id — it sits on the Checkout session — so
      // this branch only fires for the on-page Payment Element charge.)
      const transactionId = strOrNull(intent.metadata?.transaction_id);
      if (transactionId) {
        return { kind: "booking_payment", transactionId };
      }
      return { kind: "ignore" };
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return { kind: "payment_intent_failed", transactionId: strOrNull(intent.metadata?.transaction_id) };
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      if (!account.id) return { kind: "ignore" };
      return { kind: "connect_account_updated", accountId: account.id };
    }

    case "capability.updated": {
      const cap = event.data.object as Stripe.Capability;
      const accountId = strOrNull(event.account) ?? strOrNull(cap.account);
      if (!accountId) return { kind: "ignore" };
      return { kind: "capability_updated", accountId };
    }

    case "payout.paid":
    case "payout.failed":
    case "payout.created":
    case "payout.canceled": {
      const payout = event.data.object as Stripe.Payout;
      return {
        kind: "payout_event",
        eventType: event.type,
        payoutId: payout.id,
        accountId: strOrNull(event.account),
        amount: payout.amount ?? 0,
        currency: payout.currency ?? "usd",
      };
    }

    default:
      return { kind: "ignore" };
  }
}

// ─── Idempotency-claim error classification ───────────────────────────────────────

/** Pure: classify a Supabase insert error from the idempotency claim. 23505 = duplicate. */
export function interpretClaimError(error: { code?: string } | null): "duplicate" | "other" {
  return error?.code === "23505" ? "duplicate" : "other";
}
