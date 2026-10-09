/**
 * Stripe refund.failed / refund.updated(canceled|failed): the customer never
 * got the money, funds are back in the platform balance, and our books already
 * say refunded. Do not auto-revert. Stamp the refund row so Admin > Payments >
 * Refunds shows a failed state a person can act on (TUL-144 half-2).
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  notifyPaymentNeedsAttention,
  notifyRefundFailed,
} from "@/lib/notifications/producers/payment-notify";
import {
  buildFailedRefundAttentionNote,
  formatFailedRefundMoney,
} from "@/lib/payments/failed-refund-attention-note";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export const FAILED_REFUND_ATTENTION = "refund_failed" as const;

export type FailedRefundSettlementInput = {
  refundId: string;
  status: string;
  failureReason: string | null;
  amountCents: number;
  /** ISO currency from Stripe (lowercase ok). Never invent a currency. */
  currency: string;
  chargeId?: string | null;
  paymentIntentId?: string | null;
  nowIso?: string;
};

function attentionNote(input: FailedRefundSettlementInput): string {
  return buildFailedRefundAttentionNote(input);
}

/**
 * Resolve the booking_transactions row for a failed Stripe refund.
 * Prefer the linked refund row keyed by provider_refund_id.
 */
export type FailedRefundTransaction = {
  id: string;
  sourceTenantId: string | null;
  bookingId: string | null;
  inquiryId: string | null;
};

export async function findRefundTransactionForFailedSettlement(
  admin: Admin,
  refundId: string,
): Promise<FailedRefundTransaction | null> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, source_tenant_id, booking_id, source_inquiry_id")
    .eq("provider_refund_id", refundId)
    .maybeSingle();
  if (error) {
    logServerError("payments.failedRefundSettlement.lookup", error);
    return null;
  }
  const row = data as {
    id?: string;
    source_tenant_id?: string | null;
    booking_id?: string | null;
    source_inquiry_id?: string | null;
  } | null;
  if (!row?.id) return null;
  return {
    id: row.id,
    sourceTenantId: row.source_tenant_id ?? null,
    bookingId: row.booking_id ?? null,
    inquiryId: row.source_inquiry_id ?? null,
  };
}

/** Stamp the refund money row so Admin Payments lists it as failed. Idempotent. */
export async function flagFailedRefundSettlement(
  admin: Admin,
  input: FailedRefundSettlementInput & { transactionId: string },
): Promise<{ ok: boolean; newlyFlagged: boolean }> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) {
    logServerError("payments.failedRefundSettlement.read", error);
    return { ok: false, newlyFlagged: false };
  }
  const meta = ((data as { metadata?: unknown } | null)?.metadata ?? {}) as Record<string, unknown>;
  if (meta.needs_attention === FAILED_REFUND_ATTENTION) return { ok: true, newlyFlagged: false };

  const { error: updErr } = await admin
    .from("booking_transactions")
    .update({
      metadata: {
        ...meta,
        needs_attention: FAILED_REFUND_ATTENTION,
        needs_attention_note: attentionNote(input),
        needs_attention_at: input.nowIso ?? new Date().toISOString(),
        failed_refund_id: input.refundId,
        failed_refund_status: input.status,
        failed_refund_reason: input.failureReason,
        failed_refund_amount_cents: input.amountCents,
        failed_refund_currency: (input.currency || "").trim().toUpperCase() || null,
      },
    })
    .eq("id", input.transactionId);
  if (updErr) {
    logServerError("payments.failedRefundSettlement.flag", updErr);
    return { ok: false, newlyFlagged: false };
  }
  return { ok: true, newlyFlagged: true };
}

/**
 * Webhook entry: look up the refund row, stamp it. Best-effort when no row
 * exists (ack after logging). Does not auto-revert.
 */
export async function applyFailedRefundSettlement(
  admin: Admin,
  input: FailedRefundSettlementInput,
): Promise<{
  flagged: boolean;
  newlyFlagged: boolean;
  transaction: FailedRefundTransaction | null;
}> {
  const row = await findRefundTransactionForFailedSettlement(admin, input.refundId);
  if (!row) {
    logServerError(
      "payments.failedRefundSettlement.no_row",
      new Error(
        `No booking_transactions row for provider_refund_id=${input.refundId} ` +
          `(charge=${input.chargeId ?? "unknown"}, payment_intent=${input.paymentIntentId ?? "unknown"}). ` +
          `Failed refund is logged only.`,
      ),
    );
    return { flagged: false, newlyFlagged: false, transaction: null };
  }
  const result = await flagFailedRefundSettlement(admin, {
    ...input,
    transactionId: row.id,
  });
  return { flagged: result.ok, newlyFlagged: result.newlyFlagged, transaction: row };
}

/**
 * `refund_settlement` action from the Stripe webhook. Does NOT auto-revert
 * books (funds are on the platform; a person arranges an alternative refund).
 * Stamps Admin Payments visibility when a service-role client is available,
 * and always emits the loud actionable server log.
 */
export async function handleFailedRefundWebhookAction(input: {
  refundId: string;
  status: string;
  failureReason: string | null;
  amount: number;
  currency: string;
  chargeId?: string | null;
  paymentIntentId?: string | null;
}): Promise<void> {
  const settlement: FailedRefundSettlementInput = {
    refundId: input.refundId,
    status: input.status,
    failureReason: input.failureReason,
    amountCents: input.amount,
    currency: input.currency,
    chargeId: input.chargeId,
    paymentIntentId: input.paymentIntentId,
  };
  const sb = createServiceRoleClient();
  const result = sb
    ? await applyFailedRefundSettlement(sb, settlement)
    : { flagged: false, newlyFlagged: false, transaction: null };
  // TUL-391: workspace bells (once per newly flagged stamp).
  const tenantId = result.transaction?.sourceTenantId ?? null;
  if (tenantId) {
    notifyRefundFailed({
      tenantId,
      transactionId: result.transaction?.id ?? null,
      bookingId: result.transaction?.bookingId ?? null,
      inquiryId: result.transaction?.inquiryId ?? null,
      refundId: input.refundId,
      amountCents: input.amount,
      currency: input.currency,
      failureReason: input.failureReason,
      status: input.status,
    });
    if (result.newlyFlagged && result.transaction) {
      notifyPaymentNeedsAttention({
        tenantId,
        transactionId: result.transaction.id,
        bookingId: result.transaction.bookingId,
        inquiryId: result.transaction.inquiryId,
        reason: "refund_failed",
        note:
          `Stripe refund ${input.refundId} ${input.status.toUpperCase()}. ` +
          `Customer was not paid. Arrange an alternative refund.`,
        amountCents: input.amount,
        currency: input.currency,
      });
    }
  }
  const money = formatFailedRefundMoney(input.amount, input.currency);
  logServerError(
    "stripe-webhook.refund.failed",
    new Error(
      `Refund ${input.refundId} ${input.status.toUpperCase()} for ` +
        `${money} ` +
        `(charge=${input.chargeId ?? "unknown"}, payment_intent=${input.paymentIntentId ?? "unknown"}, ` +
        `reason=${input.failureReason ?? "unspecified"}). ` +
        `THE CUSTOMER HAS NOT BEEN PAID and the funds are back in the platform balance. ` +
        `Our records still show this payment as refunded. Arrange an alternative refund manually.`,
    ),
  );
}

export function isFailedRefundAttention(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).needs_attention === FAILED_REFUND_ATTENTION;
}

export function failedRefundAttentionNote(metadata: unknown): string | null {
  if (!isFailedRefundAttention(metadata)) return null;
  const note = (metadata as Record<string, unknown>).needs_attention_note;
  return typeof note === "string" && note.trim() ? note : null;
}
