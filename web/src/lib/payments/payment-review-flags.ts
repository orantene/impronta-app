/**
 * payment-review-flags.ts — write a payment review flag onto its money row.
 *
 * TUL-1283 / TUL-1284 / TUL-1268 M2. See `payment-review-flags-model.ts` for
 * what a flag is. This is the one writer: read the row, append the flag to
 * `metadata` (only `metadata` is written; no amount, no status), raise a
 * Sentry-visible alert, and ring the workspace Money bell
 * (`payment.needs_attention`, owners/admins only: the guest hears nothing new).
 *
 * Idempotent: a replay of the same (reason, PaymentIntent) writes nothing and
 * rings nothing.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { notifyPaymentNeedsAttention } from "@/lib/notifications/producers/payment-notify";
import { applyPaymentReviewFlag, type PaymentReviewFlagInput } from "@/lib/payments/payment-review-flags-model";

type Admin = Pick<SupabaseClient, "from">;

export type FlagPaymentDeps = {
  notify: (params: Parameters<typeof notifyPaymentNeedsAttention>[0]) => void;
};

export type FlagPaymentResult = { ok: true; created: boolean } | { ok: false; error: string };

export async function flagPaymentForReview(
  admin: Admin,
  input: { transactionId: string; flag: PaymentReviewFlagInput; nowIso?: string },
  deps: FlagPaymentDeps = { notify: notifyPaymentNeedsAttention },
): Promise<FlagPaymentResult> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("metadata, source_tenant_id, booking_id, source_inquiry_id")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) return { ok: false, error: `payment flag read failed for ${input.transactionId}: ${error.message}` };
  if (!data) return { ok: false, error: `payment flag: transaction ${input.transactionId} not found` };
  const row = data as {
    metadata?: unknown;
    source_tenant_id?: string | null;
    booking_id?: string | null;
    source_inquiry_id?: string | null;
  };

  const applied = applyPaymentReviewFlag(row.metadata, input.flag, input.nowIso ?? new Date().toISOString());
  if (!applied.created) return { ok: true, created: false };

  const { error: updErr } = await admin
    .from("booking_transactions")
    .update({ metadata: applied.metadata })
    .eq("id", input.transactionId);
  if (updErr) return { ok: false, error: `payment flag write failed for ${input.transactionId}: ${updErr.message}` };

  const f = input.flag;
  logServerError(
    `stripe-webhook.payment_flag.${f.reason}`,
    new Error(
      `ALERT ${f.reason} on txn ${input.transactionId}: pi ${f.paymentIntentId ?? "?"}` +
        (f.otherPaymentIntentId ? ` (row already paid by ${f.otherPaymentIntentId})` : "") +
        `, charged ${f.chargedAmountCents ?? "?"} ${f.chargedCurrency ?? "?"}` +
        `, row ${f.expectedAmountCents ?? "?"} ${f.expectedCurrency ?? "?"} status ${f.rowStatus ?? "?"}` +
        ` (event ${f.stripeEventId}). Flagged for a person; no money moved.`,
    ),
  );

  if (row.source_tenant_id) {
    deps.notify({
      tenantId: row.source_tenant_id,
      transactionId: input.transactionId,
      bookingId: row.booking_id ?? null,
      inquiryId: row.source_inquiry_id ?? null,
      reason: f.reason,
      // The catalog entry words each reason in the bell; no free-text note.
      note: null,
      amountCents: f.chargedAmountCents,
      currency: f.chargedCurrency,
    });
  }
  return { ok: true, created: true };
}
