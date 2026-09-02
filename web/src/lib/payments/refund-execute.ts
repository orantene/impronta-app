/**
 * refund-execute.ts — ISSUING a refund at Stripe.
 *
 * WHY THIS EXISTS: until now Tulala could not refund anybody. The repository
 * contained no `stripe.refunds.create` at all. `lib/payments/refunds.ts` is the
 * REACTIVE half — it handles `charge.refunded` after a human refunded from the
 * Stripe Dashboard — and the workspace "Mark refunded" action only wrote an
 * internal record from a typed-in reference string, while still reversing the
 * talent's transfer. So a mis-click clawed money back from a talent against a
 * refund that may never have happened.
 *
 * This module is the missing ACTIVE half: it creates the real Stripe Refund and
 * then gets out of the way.
 *
 * ── Division of labour (important) ──────────────────────────────────────────
 * This function does NOT touch the ledger, does NOT mark the transaction
 * refunded, and does NOT reverse payouts. It creates the Refund at Stripe and
 * returns. Stripe then emits `charge.refunded`, and the existing, well-tested
 * webhook path (`handleBookingRefund`) does all the bookkeeping: marks the
 * transaction, records the linked refund row, and reverses the talent /
 * workspace legs talent-protectively.
 *
 * Doing it that way means there is exactly ONE code path that writes a refund
 * into our books, and it is driven by what Stripe actually did rather than by
 * what we intended to do. A refund issued from the Stripe Dashboard and a
 * refund issued from Tulala converge on the same handler.
 *
 * Server-only.
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Tulala's refund reason taxonomy. Richer than Stripe's three values, because
 * "why" drives our own reporting; the Stripe reason is a lossy projection of it
 * and the full value is carried in refund metadata.
 */
export type RefundReason =
  | "requested_by_client"
  | "service_not_delivered"
  | "booking_cancelled"
  | "duplicate_charge"
  | "fraudulent"
  | "overcharge_correction"
  | "goodwill"
  | "other";

export const REFUND_REASONS: readonly RefundReason[] = [
  "requested_by_client",
  "service_not_delivered",
  "booking_cancelled",
  "duplicate_charge",
  "fraudulent",
  "overcharge_correction",
  "goodwill",
  "other",
] as const;

export function isRefundReason(v: string): v is RefundReason {
  return (REFUND_REASONS as readonly string[]).includes(v);
}

/** Our reason → the three values Stripe's API accepts. Lossy by design. */
export function toStripeReason(
  reason: RefundReason,
): "duplicate" | "fraudulent" | "requested_by_customer" {
  if (reason === "duplicate_charge") return "duplicate";
  if (reason === "fraudulent") return "fraudulent";
  return "requested_by_customer";
}

/** Statuses from which a refund is meaningful — money was actually collected. */
const REFUNDABLE_STATUSES = new Set(["paid", "payout_pending", "payout_sent", "disputed"]);

export type RefundEligibility = {
  /** Amount still refundable, in cents. 0 when nothing more can be refunded. */
  remainingCents: number;
  /** Sum already refunded across linked refund rows. */
  alreadyRefundedCents: number;
  grossAmountCents: number;
  currency: string;
  /** The `pi_...` this transaction settled on, when known. */
  paymentIntentId: string | null;
  /** Present when a refund cannot be issued; human-readable. */
  blockedReason: string | null;
};

/**
 * Pure: given the parent transaction's figures, decide what is refundable.
 * Split out from the I/O so the arithmetic and the refusal rules are testable
 * without a database or a Stripe account.
 */
export function computeRefundEligibility(input: {
  status: string;
  grossAmountCents: number;
  currency: string;
  alreadyRefundedCents: number;
  paymentIntentId: string | null;
  provider: string;
}): RefundEligibility {
  const base: Omit<RefundEligibility, "blockedReason"> = {
    remainingCents: Math.max(0, input.grossAmountCents - input.alreadyRefundedCents),
    alreadyRefundedCents: input.alreadyRefundedCents,
    grossAmountCents: input.grossAmountCents,
    currency: input.currency,
    paymentIntentId: input.paymentIntentId,
  };

  if (!REFUNDABLE_STATUSES.has(input.status)) {
    return {
      ...base,
      blockedReason:
        input.status === "refunded"
          ? "This payment is already fully refunded."
          : `This payment cannot be refunded while it is "${input.status}". Only a collected payment can be refunded.`,
    };
  }
  if (!input.paymentIntentId) {
    return {
      ...base,
      blockedReason:
        "No Stripe charge is linked to this payment, so there is nothing to refund at Stripe. " +
        "That means it was collected off-platform (cash, wire), or it settled before Tulala started recording the charge id. " +
        "Record it as an off-platform refund instead.",
    };
  }
  if (base.remainingCents <= 0) {
    return { ...base, blockedReason: "This payment is already fully refunded." };
  }
  return { ...base, blockedReason: null };
}

export type RefundExecuteResult =
  | { ok: true; refundId: string; amountCents: number; currency: string }
  | { ok: false; error: string };

/**
 * Read the refund eligibility for a transaction straight from the database.
 * `alreadyRefundedCents` is the sum of the linked refund rows — the same shape
 * both `markRefunded` (full) and `recordPartialRefund` (partial) write.
 */
export async function loadRefundEligibility(
  transactionId: string,
): Promise<RefundEligibility | { error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { error: "Database unavailable." };

  const { data: txn, error } = await sb
    .from("booking_transactions")
    .select("id, status, gross_amount_cents, currency, provider, provider_metadata, refund_of_transaction_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (error || !txn) return { error: "Payment not found." };

  const row = txn as Record<string, unknown>;
  // Refund rows are themselves booking_transactions; refunding a refund is
  // never meaningful and would double-count against the parent.
  if (row.refund_of_transaction_id) {
    return { error: "This record is a refund, not a payment." };
  }

  const { data: refundRows } = await sb
    .from("booking_transactions")
    .select("gross_amount_cents")
    .eq("refund_of_transaction_id", transactionId)
    .eq("status", "refunded");

  const alreadyRefundedCents = (refundRows ?? []).reduce(
    (sum, r) => sum + Number((r as { gross_amount_cents?: number }).gross_amount_cents ?? 0),
    0,
  );

  const meta = row.provider_metadata;
  const paymentIntentId =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? ((meta as Record<string, unknown>).payment_intent_id as string | undefined) ?? null
      : null;

  return computeRefundEligibility({
    status: String(row.status),
    grossAmountCents: Number(row.gross_amount_cents ?? 0),
    currency: String(row.currency ?? "USD"),
    alreadyRefundedCents,
    paymentIntentId,
    provider: String(row.provider ?? ""),
  });
}

/**
 * Issue a refund at Stripe for a booking transaction.
 *
 * `amountCents` omitted / null = refund everything still outstanding.
 *
 * IDEMPOTENCY: the key folds in how much had already been refunded when this
 * attempt started. A double-submit of the same request reuses the key and
 * Stripe returns the SAME refund instead of issuing a second one; a deliberate
 * later partial refund starts from a different already-refunded total, gets a
 * different key, and is allowed through. That is the behaviour we want from
 * both a fat-fingered double click and a genuine second partial.
 *
 * Refuses rather than pretends when Stripe is not configured — silently
 * reporting a successful refund that never happened is the worst outcome here.
 */
export async function executeBookingRefund(input: {
  transactionId: string;
  amountCents?: number | null;
  reason: RefundReason;
  actorUserId?: string | null;
  note?: string | null;
}): Promise<RefundExecuteResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured, so no refund was issued." };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, error: "Stripe is not configured, so no refund was issued." };
  }

  const eligibility = await loadRefundEligibility(input.transactionId);
  if ("error" in eligibility) return { ok: false, error: eligibility.error };
  if (eligibility.blockedReason) return { ok: false, error: eligibility.blockedReason };
  if (!eligibility.paymentIntentId) {
    // computeRefundEligibility already guards this; belt and braces so the
    // Stripe call below can never be reached without a charge to refund.
    return { ok: false, error: "No Stripe charge is linked to this payment." };
  }

  const requested = input.amountCents ?? eligibility.remainingCents;
  const amountCents = Math.floor(requested);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter a refund amount greater than zero." };
  }
  if (amountCents > eligibility.remainingCents) {
    return {
      ok: false,
      error: `That is more than is left to refund. At most ${(eligibility.remainingCents / 100).toFixed(2)} ${eligibility.currency} can still be returned.`,
    };
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: eligibility.paymentIntentId,
        amount: amountCents,
        reason: toStripeReason(input.reason),
        metadata: {
          transaction_id: input.transactionId,
          tulala_reason: input.reason,
          ...(input.actorUserId ? { actor_user_id: input.actorUserId } : {}),
          ...(input.note ? { note: input.note.slice(0, 480) } : {}),
        },
      },
      {
        idempotencyKey: `refund_${input.transactionId}_${eligibility.alreadyRefundedCents}_${amountCents}`,
      },
    );
    // Deliberately no ledger write here — `charge.refunded` drives the books.
    return {
      ok: true,
      refundId: refund.id,
      amountCents,
      currency: eligibility.currency,
    };
  } catch (err) {
    logServerError("payments.refund-execute", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Stripe rejected the refund.";
    return { ok: false, error: message };
  }
}
