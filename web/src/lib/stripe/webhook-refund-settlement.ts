/**
 * lib/stripe/webhook-refund-settlement.ts
 *
 * `refund_settlement` action body for the Stripe webhook handler (TUL-391).
 * Split out of `webhook-handler.ts` so that file stays under the 800-line cap —
 * same sibling-extraction convention as `webhook-card-settle.ts`.
 *
 * The refund did NOT reach the customer. Stripe returned the money to the
 * platform balance while our records already say refunded. We do NOT
 * auto-revert books; we stamp needs_attention + emit workspace bells + log.
 */

import { applyFailedRefundAttention } from "@/lib/payments/failed-refund-attention";
import {
  notifyPaymentNeedsAttention,
  notifyRefundFailed,
} from "@/lib/notifications/producers/payment-notify";
import { logServerError } from "@/lib/server/safe-error";
import type { StripeAction } from "@/lib/stripe/webhook-routing";

type RefundSettlementAction = Extract<StripeAction, { kind: "refund_settlement" }>;

/** Stamp + notify + loud log for a failed/canceled Stripe refund. */
export async function processRefundSettlement(action: RefundSettlementAction): Promise<void> {
  const settlement = await applyFailedRefundAttention({
    refundId: action.refundId,
    status: action.status,
    failureReason: action.failureReason,
    amountCents: action.amount,
    currency: action.currency,
    chargeId: action.chargeId,
    paymentIntentId: action.paymentIntentId,
  });
  const tenantId = settlement.transaction?.sourceTenantId ?? null;
  if (tenantId) {
    notifyRefundFailed({
      tenantId,
      transactionId: settlement.transaction?.id ?? null,
      bookingId: settlement.transaction?.bookingId ?? null,
      inquiryId: settlement.transaction?.inquiryId ?? null,
      refundId: action.refundId,
      amountCents: action.amount,
      currency: action.currency,
      failureReason: action.failureReason,
      status: action.status,
    });
    if (settlement.newlyFlagged && settlement.transaction) {
      notifyPaymentNeedsAttention({
        tenantId,
        transactionId: settlement.transaction.id,
        bookingId: settlement.transaction.bookingId,
        inquiryId: settlement.transaction.inquiryId,
        reason: "refund_failed",
        note:
          `Stripe refund ${action.refundId} ${action.status.toUpperCase()}. ` +
          `Customer was not paid. Arrange an alternative refund.`,
        amountCents: action.amount,
        currency: action.currency,
      });
    }
  }
  logServerError(
    "stripe-webhook.refund.failed",
    new Error(
      `Refund ${action.refundId} ${action.status.toUpperCase()} for ` +
        `${(action.amount / 100).toFixed(2)} ${action.currency.toUpperCase()} ` +
        `(charge=${action.chargeId ?? "unknown"}, payment_intent=${action.paymentIntentId ?? "unknown"}, ` +
        `reason=${action.failureReason ?? "unspecified"}). ` +
        `THE CUSTOMER HAS NOT BEEN PAID and the funds are back in the platform balance. ` +
        `Our records still show this payment as refunded — arrange an alternative refund manually.`,
    ),
  );
}
