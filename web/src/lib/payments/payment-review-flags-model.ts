/**
 * payment-review-flags-model.ts — what a payment review flag IS (pure).
 *
 * TUL-1283 / TUL-1284 / TUL-1268 M2. Stripe took a charge that the settle path
 * cannot book as an ordinary payment:
 *
 *   amount_mismatch         the charged amount or currency differs from the
 *                           money row; the row is NOT marked paid (audit #5).
 *   charge_on_inactive_row  the row was already cancelled or failed when the
 *                           charge landed; the money is owed back.
 *   duplicate_charge        the row was already paid by a DIFFERENT
 *                           PaymentIntent; the second charge is owed back.
 *
 * WHERE IT LIVES. On the money row itself, in `booking_transactions.metadata`,
 * the same bag the existing attention stamps use (`needs_attention`, written by
 * paid-after-cancel and refund_failed, read by Money and the bell). No new
 * table: the row is what staff open, and the flag goes where they already look.
 *
 * WHY A LIST AND NOT ONLY THE STAMP. `needs_attention` holds one reason, and a
 * row can carry two problems (paid after cancel, then a second card charge).
 * Overwriting the first stamp would hide a refund someone still owes, so every
 * flag is appended to `metadata.payment_flags`, keyed on (reason,
 * PaymentIntent) so a webhook replay is a no-op, and the stamp is only set when
 * the row has none.
 *
 * NOTHING HERE MOVES MONEY. No refund, no amount, no status. A person decides.
 *
 * PURE: no `server-only`, no Supabase. Read by the settle writer, the Issues
 * inbox and tests alike.
 */

export const PAYMENT_REVIEW_REASONS = ["amount_mismatch", "charge_on_inactive_row", "duplicate_charge"] as const;
export type PaymentReviewReason = (typeof PAYMENT_REVIEW_REASONS)[number];

export function isPaymentReviewReason(value: unknown): value is PaymentReviewReason {
  return typeof value === "string" && (PAYMENT_REVIEW_REASONS as readonly string[]).includes(value);
}

/** What the settle path knows when it raises a flag. Amounts in integer minor units. */
export type PaymentReviewFlagInput = {
  reason: PaymentReviewReason;
  /** The PaymentIntent that took the charge being flagged. */
  paymentIntentId: string | null;
  /** duplicate_charge: the PaymentIntent that already paid the row. */
  otherPaymentIntentId: string | null;
  expectedAmountCents: number | null;
  expectedCurrency: string | null;
  chargedAmountCents: number | null;
  chargedCurrency: string | null;
  /** The row's status when the charge landed. */
  rowStatus: string | null;
  stripeEventId: string;
};

export type PaymentReviewFlag = PaymentReviewFlagInput & { flaggedAt: string };

/** Stored shape (snake_case, like the rest of the metadata bag). */
type StoredFlag = {
  reason: PaymentReviewReason;
  payment_intent_id: string | null;
  other_payment_intent_id: string | null;
  expected_amount_cents: number | null;
  expected_currency: string | null;
  charged_amount_cents: number | null;
  charged_currency: string | null;
  row_status: string | null;
  stripe_event_id: string;
  flagged_at: string;
  resolved_at?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function storedFlags(meta: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = meta.payment_flags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object" && !Array.isArray(f));
}

function keyOf(reason: string, paymentIntentId: string | null): string {
  return `${reason}:${paymentIntentId ?? "none"}`;
}

/**
 * Append one flag to a row's metadata. `created: false` means the same reason
 * for the same PaymentIntent is already on the row (a replay): write nothing.
 */
export function applyPaymentReviewFlag(
  metadata: unknown,
  flag: PaymentReviewFlagInput,
  nowIso: string,
): { metadata: Record<string, unknown>; created: boolean } {
  const meta = asRecord(metadata);
  const existing = storedFlags(meta);
  const key = keyOf(flag.reason, flag.paymentIntentId);
  if (existing.some((f) => keyOf(String(f.reason), strOrNull(f.payment_intent_id)) === key)) {
    return { metadata: meta, created: false };
  }
  const stored: StoredFlag = {
    reason: flag.reason,
    payment_intent_id: flag.paymentIntentId,
    other_payment_intent_id: flag.otherPaymentIntentId,
    expected_amount_cents: flag.expectedAmountCents,
    expected_currency: flag.expectedCurrency,
    charged_amount_cents: flag.chargedAmountCents,
    charged_currency: flag.chargedCurrency,
    row_status: flag.rowStatus,
    stripe_event_id: flag.stripeEventId,
    flagged_at: nowIso,
  };
  const next: Record<string, unknown> = { ...meta, payment_flags: [...existing, stored] };
  // Never overwrite a different stamp: that would hide a refund someone owes.
  if (!meta.needs_attention) {
    next.needs_attention = flag.reason;
    next.needs_attention_at = nowIso;
  }
  return { metadata: next, created: true };
}

/** Every unresolved, well-formed flag on a row, oldest first. Never throws. */
export function openPaymentReviewFlags(metadata: unknown): PaymentReviewFlag[] {
  const out: PaymentReviewFlag[] = [];
  for (const f of storedFlags(asRecord(metadata))) {
    if (!isPaymentReviewReason(f.reason)) continue;
    if (strOrNull(f.resolved_at)) continue;
    const flaggedAt = strOrNull(f.flagged_at);
    if (!flaggedAt) continue;
    out.push({
      reason: f.reason,
      paymentIntentId: strOrNull(f.payment_intent_id),
      otherPaymentIntentId: strOrNull(f.other_payment_intent_id),
      expectedAmountCents: numOrNull(f.expected_amount_cents),
      expectedCurrency: strOrNull(f.expected_currency),
      chargedAmountCents: numOrNull(f.charged_amount_cents),
      chargedCurrency: strOrNull(f.charged_currency),
      rowStatus: strOrNull(f.row_status),
      stripeEventId: String(f.stripe_event_id ?? ""),
      flaggedAt,
    });
  }
  return out;
}
