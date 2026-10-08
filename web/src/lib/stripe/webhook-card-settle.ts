/**
 * lib/stripe/webhook-card-settle.ts
 *
 * The two things a one-time Checkout session can tell us about a money row, and
 * the ONE path each takes. Split out of `webhook-handler.ts` (which keeps the
 * dispatch) so invoices, POS card sales and payment links settle through the
 * same function and that function stays readable.
 *
 *   settleCheckoutPayment  — the charge landed: amount guard, then `markPaid`
 *                            (PaymentIntent id, booking sync, receipt, transfers,
 *                            order, claim, payment link).
 *   closeCheckoutSession   — the session can never be paid: a payment link's
 *                            row fails, its claim goes back, the link expires.
 *
 * Neither throws: they return `{ ok: false, error }` and the handler turns that
 * into its retryable error, so this module needs nothing from the handler.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markFailed, markPaid } from "@/lib/bookings/transactions";
import { closePaymentLinkForClosedCheckout } from "@/lib/payments/link-settlement";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { StripeAccountKey } from "@/lib/stripe/client";
import { loadChargePlatformForTransaction, recordChargePlatform } from "@/lib/stripe/charge-platform";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

/** Audit #5: pull the actually-charged amount + currency from the settlement event
 *  (PaymentIntent or Checkout Session) so it can be reconciled against the booking
 *  transaction before payout. Returns null for event types without a clear amount. */
export function extractChargedAmount(event: Stripe.Event): { amountCents: number; currency: string } | null {
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    return { amountCents: pi.amount ?? 0, currency: pi.currency ?? "" };
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    return { amountCents: s.amount_total ?? 0, currency: s.currency ?? "" };
  }
  return null;
}

const SETTLED_TRANSACTION_STATUSES = new Set(["paid", "payout_pending", "payout_sent"]);

/** True when the money row has already moved past waiting for its payment. */
async function transactionAlreadySettled(
  transactionId: string,
  getAdmin: () => SupabaseClient | null,
): Promise<boolean> {
  const sb = getAdmin();
  if (!sb) return false;
  const { data, error } = await sb
    .from("booking_transactions")
    .select("status")
    .eq("id", transactionId)
    .maybeSingle();
  if (error || !data) return false;
  return SETTLED_TRANSACTION_STATUSES.has(String((data as { status: string }).status));
}

export type SettleCheckoutResult =
  | { ok: true; outcome: "paid" | "already_settled" | "amount_mismatch" }
  | { ok: false; error: string };

/** Everything `settleCheckoutPayment` reaches outside itself. Each defaults to the
 *  production import; tests pass fakes so the settle path runs without a database. */
export type SettleDeps = {
  markPaid: (
    transactionId: string,
    opts?: { paymentIntentId?: string | null },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  recordChargePlatform: (transactionId: string, key: StripeAccountKey) => Promise<boolean>;
  loadChargePlatformForTransaction: (transactionId: string) => Promise<StripeAccountKey>;
  getAdmin: () => SupabaseClient | null;
};

export async function settleCheckoutPayment(
  event: Stripe.Event,
  action: { transactionId: string; paymentIntentId: string | null },
  /** Platform account the event arrived on. */
  account: StripeAccountKey = "us",
  deps: Partial<SettleDeps> = {},
): Promise<SettleCheckoutResult> {
  const markPaidFn = deps.markPaid ?? markPaid;
  const recordPlatform = deps.recordChargePlatform ?? recordChargePlatform;
  const loadPlatform = deps.loadChargePlatformForTransaction ?? loadChargePlatformForTransaction;
  const getAdmin = deps.getAdmin ?? createServiceRoleClient;
  // The platform that delivered this settlement IS the platform that took the
  // charge. Record it BEFORE markPaid fans out payouts (transfers, refunds and
  // reversals all key off it), and flag a disagreement with what checkout stored.
  if (account === "mx") {
    if (!(await recordPlatform(action.transactionId, "mx"))) {
      return { ok: false, error: `could not record charge platform mx for ${action.transactionId}` };
    }
  } else if ((await loadPlatform(action.transactionId)) === "mx") {
    logServerError(
      "stripe-webhook.charge_platform_mismatch",
      new Error(`ALERT US-platform settlement for txn ${action.transactionId} recorded as an MX charge (event ${event.id})`),
    );
  }
  // Audit #5: verify the actually-charged amount + currency match the booking
  // transaction BEFORE marking paid + disbursing. The PaymentIntent is
  // idempotency-keyed at its first amount, so a later gross edit can silently
  // diverge; auto-paying out on a mismatched charge would over/under-pay the
  // talent. On mismatch, skip markPaid and flag for manual reconciliation
  // (logged) instead of auto-paying the wrong amount.
  const charged = extractChargedAmount(event);
  if (charged) {
    const sbGuard = getAdmin();
    if (sbGuard) {
      const { data: txnRow, error: guardErr } = await sbGuard
        .from("booking_transactions")
        .select("gross_amount_cents, currency")
        .eq("id", action.transactionId)
        .maybeSingle();
      // A guard that cannot read the row cannot vouch for the amount: retry
      // rather than pay out unguarded (this used to fall through to markPaid).
      if (guardErr) return { ok: false, error: `amount guard read failed for ${action.transactionId}: ${guardErr.message}` };
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
        return { ok: true, outcome: "amount_mismatch" };
      }
    }
  }
  // Thread the settling PaymentIntent onto the transaction so a refund can
  // later be issued against the real charge (see markPaid).
  const result = await markPaidFn(action.transactionId, { paymentIntentId: action.paymentIntentId });
  if (result.ok) return { ok: true, outcome: "paid" };

  // ALREADY SETTLED IS AN ANSWER, NOT A FAULT. `markPaid` refuses a row that is
  // no longer waiting (`Cannot transition from 'paid'`), and a second delivery
  // for the same payment (a replay after a lost claim, the recovery worker
  // getting there first, `async_payment_succeeded` after `completed`) used to
  // turn that refusal into a 5xx that Stripe retried for three days against
  // money already booked. Settled once means acknowledged; nothing runs twice.
  if (await transactionAlreadySettled(action.transactionId, getAdmin)) {
    void improntaLog("stripe_webhook.info", {
      message: `booking_payment already settled: transaction ${action.transactionId} (event ${event.id})`,
    });
    return { ok: true, outcome: "already_settled" };
  }
  // Otherwise almost always a transient DB blip. The caller retries rather
  // than silently lose a paid booking.
  return { ok: false, error: `markPaid(${action.transactionId}): ${result.error}` };
}

export async function closeCheckoutSession(action: {
  transactionId: string;
  reason: "expired" | "async_payment_failed";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "checkout_session_closed: database unavailable" };
  const closed = await closePaymentLinkForClosedCheckout(
    sb,
    { transactionId: action.transactionId, reason: action.reason },
    { markFailed },
  );
  if (!closed.ok) return { ok: false, error: `checkout_session_closed(${action.transactionId}): ${closed.reason}` };
  return { ok: true };
}
