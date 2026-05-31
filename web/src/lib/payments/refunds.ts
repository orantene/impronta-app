/**
 * P5 — booking refund + dispute handling (money correctness).
 *
 * When a booking charge is refunded or disputed, the booking_transactions row
 * and the 3-way payout must reflect it:
 *
 *   • REFUND (charge.refunded, full): the client's money is going back, so we
 *     mark the transaction `refunded` AND reverse the talent + workspace
 *     transfers (claw the payouts back to the platform). Partial refunds are
 *     NOT auto-processed — they need human judgment on how to split the
 *     clawback — so we log them for manual reconciliation instead of guessing.
 *
 *   • DISPUTE (charge.dispute.created): we mark the transaction `disputed` and
 *     surface an alert, but we do NOT reverse transfers — a dispute may be won,
 *     and Stripe debits the platform balance for the disputed amount on its
 *     own. Clawing back the talent payout before the dispute resolves would
 *     punish the talent for a chargeback that might be reversed.
 *
 * Linkage: the embedded-checkout PaymentIntent carries metadata.transaction_id
 * + booking_id (see stripe-payment-intent.ts). The charge/dispute event only
 * gives us the PaymentIntent id, so we retrieve the PI to read that metadata.
 *
 * Everything here is best-effort and never throws: the refund/dispute already
 * happened at Stripe, so a bookkeeping hiccup must not 5xx the webhook into a
 * retry storm. Failures are logged for reconciliation. Transfer reversal is
 * idempotent (keyed per transfer id), so a re-delivered event never
 * double-reverses, and it no-ops cleanly in mock/test mode (no live transfers
 * exist to list).
 */

import type Stripe from "stripe";
import { markRefunded, markDisputed } from "@/lib/bookings/transactions";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

type BookingRef = { transactionId: string; bookingId: string | null; chargeAmountCents: number };

/**
 * Retrieve the PaymentIntent and pull the booking linkage off its metadata.
 * Returns null when the PI isn't a booking charge (subscriptions, balance
 * top-ups, deposits) or can't be retrieved — callers then no-op.
 */
async function resolveBookingFromPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string | null,
): Promise<BookingRef | null> {
  if (!paymentIntentId || paymentIntentId.startsWith("mock_pi_")) return null;
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    logServerError("refunds.retrievePaymentIntent", err);
    return null;
  }
  const transactionId = intent.metadata?.transaction_id ?? null;
  if (!transactionId) return null; // not a booking PaymentIntent
  return {
    transactionId,
    bookingId: intent.metadata?.booking_id ?? null,
    chargeAmountCents: intent.amount ?? 0,
  };
}

/**
 * Reverse every transfer made for a booking (talent + workspace payouts),
 * clawing the funds back to the platform. Idempotent per transfer id.
 * Best-effort: logs and continues on any single failure.
 */
export async function reverseBookingTransfers(stripe: Stripe, bookingId: string): Promise<void> {
  let transfers: Stripe.Transfer[] = [];
  try {
    const list = await stripe.transfers.list({ transfer_group: `booking_${bookingId}`, limit: 100 });
    transfers = list.data;
  } catch (err) {
    logServerError(`refunds.listTransfers[booking=${bookingId}]`, err);
    return;
  }

  for (const transfer of transfers) {
    // Already fully reversed → skip (idempotent on re-delivery).
    if ((transfer.amount_reversed ?? 0) >= transfer.amount) continue;
    const remaining = transfer.amount - (transfer.amount_reversed ?? 0);
    try {
      await stripe.transfers.createReversal(
        transfer.id,
        { amount: remaining },
        { idempotencyKey: `reverse_${transfer.id}` },
      );
    } catch (err) {
      logServerError(`refunds.reverseTransfer[${transfer.id}][booking=${bookingId}]`, err);
    }
  }
}

/**
 * Handle a charge.refunded for a booking. Marks the transaction refunded and
 * reverses payouts on a FULL refund; logs partial refunds for manual handling.
 * Returns true if this refund belonged to a booking transaction (so the caller
 * can skip the unrelated balance-top-up refund path).
 */
export async function handleBookingRefund(
  stripe: Stripe,
  input: { paymentIntentId: string | null; chargeId: string; refundedCents: number },
): Promise<boolean> {
  const ref = await resolveBookingFromPaymentIntent(stripe, input.paymentIntentId);
  if (!ref) return false;

  const isFullRefund = ref.chargeAmountCents > 0 && input.refundedCents >= ref.chargeAmountCents;
  if (!isFullRefund) {
    // Partial refund — don't guess the clawback split. Surface for manual ops.
    logServerError(
      `refunds.partial[txn=${ref.transactionId}]`,
      new Error(
        `Partial refund ${input.refundedCents}/${ref.chargeAmountCents} cents on booking transaction — needs manual reconciliation (transaction left as-is; no auto transfer reversal).`,
      ),
    );
    return true;
  }

  const marked = await markRefunded(ref.transactionId, {
    providerReference: input.chargeId,
    refundNote: "Stripe charge.refunded (full)",
  });
  if (!marked.ok) {
    // "already refunded" / bad-state transitions are expected on re-delivery —
    // log at info level via the same channel; not a retry-worthy failure.
    void improntaLog("stripe_webhook.info", {
      message: `[refund] markRefunded(${ref.transactionId}) not applied: ${marked.error}`,
    });
  }

  if (ref.bookingId) {
    await reverseBookingTransfers(stripe, ref.bookingId);
  }
  return true;
}

/**
 * Handle a charge.dispute.created for a booking. Marks the transaction disputed
 * and raises an alert. Does NOT reverse transfers (the dispute may be won;
 * Stripe debits the platform on its own). Returns true if it was a booking
 * transaction.
 */
export async function handleBookingDispute(
  stripe: Stripe,
  input: { paymentIntentId: string | null; disputeId: string; amount: number; reason: string; status: string },
): Promise<boolean> {
  const ref = await resolveBookingFromPaymentIntent(stripe, input.paymentIntentId);
  if (!ref) return false;

  const marked = await markDisputed(ref.transactionId);
  if (!marked.ok) {
    void improntaLog("stripe_webhook.info", {
      message: `[dispute] markDisputed(${ref.transactionId}) not applied: ${marked.error}`,
    });
  }

  // Always surface the dispute for ops attention regardless of mark outcome.
  logServerError(
    `stripe-webhook.dispute.booking[txn=${ref.transactionId}]`,
    new Error(
      `Dispute ${input.disputeId} on booking transaction — amount=${input.amount} reason=${input.reason} status=${input.status}. Transfers NOT reversed (resolve in Stripe).`,
    ),
  );
  return true;
}
