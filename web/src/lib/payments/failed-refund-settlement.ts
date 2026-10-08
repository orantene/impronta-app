/**
 * Stripe refund.failed / refund.updated(canceled|failed): the customer never
 * got the money, funds are back in the platform balance, and our books already
 * say refunded. Do not auto-revert. Stamp the refund row so Admin > Payments >
 * Refunds shows a failed state a person can act on (TUL-144 half-2).
 */

import { logServerError } from "@/lib/server/safe-error";

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

/**
 * Resolve the booking_transactions row for a failed Stripe refund.
 * Prefer the linked refund row keyed by provider_refund_id.
 */
export async function findRefundTransactionForFailedSettlement(
  admin: Admin,
  refundId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id")
    .eq("provider_refund_id", refundId)
    .maybeSingle();
  if (error) {
    logServerError("payments.failedRefundSettlement.lookup", error);
    return null;
  }
  const id = (data as { id?: string } | null)?.id;
  return id ? { id } : null;
}

/** Stamp the refund money row so Admin Payments lists it as failed. Idempotent. */
export async function flagFailedRefundSettlement(
  admin: Admin,
  input: FailedRefundSettlementInput & { transactionId: string },
): Promise<{ ok: boolean }> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) {
    logServerError("payments.failedRefundSettlement.read", error);
    return { ok: false };
  }
  const meta = ((data as { metadata?: unknown } | null)?.metadata ?? {}) as Record<string, unknown>;
  if (meta.needs_attention === FAILED_REFUND_ATTENTION) return { ok: true };

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
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Webhook entry: look up the refund row, stamp it, keep the loud server log.
 * Best-effort when no row exists (ack after logging). Does not auto-revert.
 */
export async function applyFailedRefundSettlement(
  admin: Admin,
  input: FailedRefundSettlementInput,
): Promise<{ flagged: boolean; transactionId: string | null }> {
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
    return { flagged: false, transactionId: null };
  }
  const result = await flagFailedRefundSettlement(admin, {
    ...input,
    transactionId: row.id,
  });
  return { flagged: result.ok, transactionId: row.id };
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
