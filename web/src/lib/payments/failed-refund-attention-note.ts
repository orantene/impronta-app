/**
 * Human-readable money for failed-refund needs_attention notes and loud logs.
 * Stripe amounts are minor units; zero-decimal currencies must not be /100 (TUL-375).
 */

import { formatOrderMoney } from "@/lib/orders/money-format";

export type FailedRefundAttentionNoteInput = {
  refundId: string;
  status: string;
  failureReason: string | null;
  amountCents: number;
  /** ISO currency from Stripe (lowercase ok). Never invent a currency. */
  currency: string;
};

/** Minor units → display string via the shared zero-decimal-aware formatter. */
export function formatFailedRefundMoney(amountMinor: number, currency: string): string {
  const code = (currency || "").trim().toUpperCase();
  // Fail closed: never invent USD (usd-literal-ban). Caller must pass Stripe's currency.
  if (!code) return "?";
  if (!Number.isFinite(amountMinor)) return `? ${code}`;
  return formatOrderMoney(amountMinor, code);
}

/** needs_attention_note body for a failed/canceled Stripe refund. */
export function buildFailedRefundAttentionNote(input: FailedRefundAttentionNoteInput): string {
  const money = formatFailedRefundMoney(input.amountCents, input.currency);
  const reason = input.failureReason?.trim() || "unspecified";
  return (
    `Stripe refund ${input.refundId} ${input.status.toUpperCase()} ` +
    `(${money}; reason=${reason}). Customer was not paid. Arrange an alternative refund.`
  );
}
