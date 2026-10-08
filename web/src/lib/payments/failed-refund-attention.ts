/**
 * Stamp + resolve helpers for Stripe refund.failed / canceled settlements
 * (TUL-391 / #2909 metadata). Does NOT auto-revert books — a person arranges
 * an alternative refund. Metadata shape matches the Admin Payments failed-refund
 * stamp so either PR can land first without fighting the other.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

/** Same value as #2909 / Admin Payments Refunds tab. */
export const FAILED_REFUND_ATTENTION = "refund_failed" as const;

export type FailedRefundAttentionInput = {
  refundId: string;
  status: string;
  failureReason: string | null;
  amountCents: number;
  currency: string;
  chargeId?: string | null;
  paymentIntentId?: string | null;
  nowIso?: string;
};

export type ResolvedRefundTransaction = {
  id: string;
  sourceTenantId: string | null;
  bookingId: string | null;
  inquiryId: string | null;
  currency: string | null;
};

function attentionNote(input: FailedRefundAttentionInput): string {
  const code = (input.currency || "").trim().toUpperCase();
  const amount = Number.isFinite(input.amountCents)
    ? (input.amountCents / 100).toFixed(2)
    : "?";
  const money = code ? `${amount} ${code}` : amount;
  const reason = input.failureReason?.trim() || "unspecified";
  return (
    `Stripe refund ${input.refundId} ${input.status.toUpperCase()} ` +
    `(${money}; reason=${reason}). Customer was not paid. Arrange an alternative refund.`
  );
}

/** Prefer the linked refund row; fall back to PaymentIntent linkage. */
export async function findTransactionForFailedRefund(
  admin: Admin,
  input: { refundId: string; paymentIntentId?: string | null },
): Promise<ResolvedRefundTransaction | null> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, source_tenant_id, booking_id, source_inquiry_id, currency")
    .eq("provider_refund_id", input.refundId)
    .maybeSingle();
  if (error) {
    logServerError("payments.failedRefundAttention.lookupRefund", error);
  } else if (data) {
    const row = data as {
      id: string;
      source_tenant_id: string | null;
      booking_id: string | null;
      source_inquiry_id: string | null;
      currency: string | null;
    };
    return {
      id: row.id,
      sourceTenantId: row.source_tenant_id,
      bookingId: row.booking_id,
      inquiryId: row.source_inquiry_id,
      currency: row.currency,
    };
  }

  const pi = input.paymentIntentId?.trim();
  if (!pi) return null;
  const { data: byPi, error: piErr } = await admin
    .from("booking_transactions")
    .select("id, source_tenant_id, booking_id, source_inquiry_id, currency")
    .eq("provider_metadata->>payment_intent_id", pi)
    .maybeSingle();
  if (piErr) {
    logServerError("payments.failedRefundAttention.lookupPi", piErr);
    return null;
  }
  if (!byPi) return null;
  const row = byPi as {
    id: string;
    source_tenant_id: string | null;
    booking_id: string | null;
    source_inquiry_id: string | null;
    currency: string | null;
  };
  return {
    id: row.id,
    sourceTenantId: row.source_tenant_id,
    bookingId: row.booking_id,
    inquiryId: row.source_inquiry_id,
    currency: row.currency,
  };
}

/**
 * Stamp `needs_attention=refund_failed` on the money row. Idempotent.
 * Returns `newlyFlagged` so callers emit notifications only once.
 */
export async function flagFailedRefundAttention(
  admin: Admin,
  input: FailedRefundAttentionInput & { transactionId: string },
): Promise<{ ok: boolean; newlyFlagged: boolean }> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) {
    logServerError("payments.failedRefundAttention.read", error);
    return { ok: false, newlyFlagged: false };
  }
  const meta = ((data as { metadata?: unknown } | null)?.metadata ?? {}) as Record<string, unknown>;
  if (meta.needs_attention === FAILED_REFUND_ATTENTION) {
    return { ok: true, newlyFlagged: false };
  }

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
    logServerError("payments.failedRefundAttention.flag", updErr);
    return { ok: false, newlyFlagged: false };
  }
  return { ok: true, newlyFlagged: true };
}

/**
 * Webhook path: resolve the money row, stamp #2909-compatible metadata, return
 * context for notification producers. Best-effort when no row exists.
 */
export async function applyFailedRefundAttention(
  input: FailedRefundAttentionInput,
): Promise<{
  flagged: boolean;
  newlyFlagged: boolean;
  transaction: ResolvedRefundTransaction | null;
}> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { flagged: false, newlyFlagged: false, transaction: null };
  }
  const transaction = await findTransactionForFailedRefund(admin, {
    refundId: input.refundId,
    paymentIntentId: input.paymentIntentId,
  });
  if (!transaction) {
    logServerError(
      "payments.failedRefundAttention.no_row",
      new Error(
        `No booking_transactions row for refund=${input.refundId} ` +
          `(charge=${input.chargeId ?? "unknown"}, payment_intent=${input.paymentIntentId ?? "unknown"}).`,
      ),
    );
    return { flagged: false, newlyFlagged: false, transaction: null };
  }
  const result = await flagFailedRefundAttention(admin, {
    ...input,
    transactionId: transaction.id,
  });
  return {
    flagged: result.ok,
    newlyFlagged: result.newlyFlagged,
    transaction,
  };
}
