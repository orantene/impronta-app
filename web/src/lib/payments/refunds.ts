/**
 * P5 — booking refund + dispute handling (money correctness).
 *
 * When a booking charge is refunded or disputed, the booking_transactions row,
 * the agency_bookings lifecycle, and the 3-way payout ledger must all reflect it:
 *
 *   • REFUND (charge.refunded, FULL): the client's money is going back, so we
 *     mark the transaction `refunded`, reverse the talent + workspace transfers
 *     (claw the payouts back to the platform) AND record those reversals in the
 *     payout ledger, then flip the booking to `refunded`.
 *
 *   • REFUND (charge.refunded, PARTIAL): audit #14 — instead of leaving it
 *     entirely for manual ops, we reconcile it talent-protectively. The refund
 *     is absorbed first by the platform fee, then by the workspace margin
 *     (a partial Stripe reversal of the workspace leg); the talent's protected
 *     quote is NEVER auto-clawed. Any residual beyond the platform+workspace
 *     buffer is escalated for manual handling. The partial refund is recorded as
 *     a linked refund transaction so the books reconcile.
 *
 *   • DISPUTE (charge.dispute.created): we mark the transaction `disputed` and
 *     surface an alert, but we do NOT reverse transfers — the dispute may be won
 *     and Stripe debits the platform balance on its own. Clawing back the talent
 *     before the dispute resolves would punish them for a chargeback that might
 *     be reversed.
 *
 *   • DISPUTE (charge.dispute.closed): audit #14 — on a LOST dispute the funds
 *     are gone, so we now mirror the full-refund path: mark `refunded`, reverse
 *     the payouts + record the reversed legs, and flip the booking to
 *     `refunded`. On a WON dispute we restore the transaction to `paid` (the
 *     talent keeps the money that was never reversed).
 *
 * Linkage: the embedded-checkout PaymentIntent carries metadata.transaction_id
 * + booking_id (see stripe-payment-intent.ts). The charge/dispute event only
 * gives us the PaymentIntent id, so we retrieve the PI to read that metadata.
 *
 * Everything here is best-effort and never throws: the refund/dispute already
 * happened at Stripe, so a bookkeeping hiccup must not 5xx the webhook into a
 * retry storm. Failures are logged for reconciliation. Reversals are idempotent
 * (keyed per transfer id), so a re-delivered event never double-reverses, and
 * they no-op cleanly in mock/test mode (no live transfers to reverse).
 */

import type Stripe from "stripe";
import { markRefunded, markDisputed } from "@/lib/bookings/transactions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadBookingCommissionSnapshots } from "@/lib/billing/commission-engine";
import {
  reverseBookingPayouts,
  computeTalentProtectiveClawback,
  reversalLegKey,
} from "@/lib/payments/booking-payouts-ledger";
import { notifyBookingPayoutReversal, notifyClientPartialRefund } from "@/lib/payments/payout-reversal-notify";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Flip the agency_bookings lifecycle fields the client + talent dashboards read.
 * Best-effort: the money already moved, so a bookkeeping failure is logged.
 */
async function flipBookingLifecycle(
  sb: SupabaseClient,
  bookingId: string,
  patch: { client_revenue_lifecycle?: string; payment_status?: string; payout_lifecycle?: string },
): Promise<void> {
  const { error } = await sb
    .from("agency_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) logServerError(`refunds.flipBookingLifecycle[booking=${bookingId}]`, error);
}

/** The booking is fully clawed back (full refund / lost dispute): client money
 *  returned, talent payout reversed to 'pending'. */
async function markBookingRefunded(sb: SupabaseClient, bookingId: string): Promise<void> {
  await flipBookingLifecycle(sb, bookingId, {
    client_revenue_lifecycle: "refunded",
    payment_status: "refunded",
    payout_lifecycle: "pending",
  });
}

/**
 * Record a PARTIAL refund as a linked refund transaction so the books
 * reconcile, WITHOUT transitioning the parent (it stays `paid` — it was). The
 * refund row carries the partial amount (platform_fee 0 / net = refunded, which
 * satisfies the platform_fee + net = gross balance check). Idempotent: a refund
 * row of the same amount for this parent is inserted at most once.
 */
async function recordPartialRefund(
  sb: SupabaseClient,
  transactionId: string,
  refundedCents: number,
  chargeId: string,
): Promise<boolean> {
  if (refundedCents <= 0) return false;
  const { data: parentData, error: parentErr } = await sb
    .from("booking_transactions")
    .select(
      "id, booking_id, source_tenant_id, source_inquiry_id, payer_user_id, payer_email, payout_receiver_id, payout_receiver_kind, payout_receiver_display_name, currency, provider, created_by_profile_id",
    )
    .eq("id", transactionId)
    .maybeSingle();
  if (parentErr || !parentData) {
    logServerError("refunds.recordPartialRefund.parent", parentErr ?? new Error("parent transaction not found"));
    return false;
  }
  const parent = parentData as Record<string, unknown>;

  // Idempotency: a partial refund row of this amount already linked → stop.
  const { data: existing } = await sb
    .from("booking_transactions")
    .select("id")
    .eq("refund_of_transaction_id", transactionId)
    .eq("gross_amount_cents", refundedCents)
    .eq("status", "refunded")
    .maybeSingle();
  if (existing) return false;

  const { error: insertErr } = await sb.from("booking_transactions").insert({
    booking_id: parent.booking_id,
    source_tenant_id: parent.source_tenant_id,
    source_inquiry_id: parent.source_inquiry_id,
    payer_user_id: parent.payer_user_id,
    payer_email: parent.payer_email,
    payout_receiver_id: parent.payout_receiver_id,
    payout_receiver_kind: parent.payout_receiver_kind,
    payout_receiver_display_name: parent.payout_receiver_display_name,
    gross_amount_cents: refundedCents,
    platform_fee_basis_points: 0,
    platform_fee_cents: 0,
    net_amount_cents: refundedCents,
    currency: parent.currency,
    provider: parent.provider,
    provider_reference: chargeId,
    status: "refunded",
    refund_of_transaction_id: transactionId,
    refunded_at: new Date().toISOString(),
    failure_reason: "Stripe charge.refunded (partial)",
    created_by_profile_id: parent.created_by_profile_id,
  });
  if (insertErr) {
    logServerError("refunds.recordPartialRefund.insert", insertErr);
    return false;
  }
  return true;
}

/**
 * Reconcile a PARTIAL booking refund (audit #14). Absorbs the refund
 * platform-first, then workspace margin (partial reversal of the workspace
 * leg), protecting the talent's quote; records the partial refund row; and
 * escalates any residual that would otherwise reach the talent.
 */
async function reconcilePartialRefund(
  stripe: Stripe,
  ref: BookingRef,
  refundedCents: number,
  chargeId: string,
): Promise<void> {
  const sb = createServiceRoleClient();
  if (!sb) {
    logServerError("refunds.partial.noDb", new Error(`partial refund ${refundedCents} on txn ${ref.transactionId} — no service-role client`));
    return;
  }

  // Record the partial refund on the books regardless of payout state.
  // `isNew` gates the client notification so a webhook re-delivery (same amount)
  // doesn't re-notify — recordPartialRefund dedups on (parent, amount, refunded).
  const isNew = await recordPartialRefund(sb, ref.transactionId, refundedCents, chargeId);

  if (!ref.bookingId) {
    logServerError(
      `refunds.partial[txn=${ref.transactionId}]`,
      new Error(`Partial refund ${refundedCents} recorded; no booking_id on PI → payout math not reconciled (manual check).`),
    );
    return;
  }

  const snaps = await loadBookingCommissionSnapshots(sb, ref.bookingId);
  const platformFeeCents = snaps.reduce((s, r) => s + (r.platform_fee_cents ?? 0), 0);
  const talentTotalCents = snaps.reduce((s, r) => s + (r.talent_net_cents ?? 0), 0);
  const workspaceLegs = snaps
    .filter((r) => (r.workspace_fee_cents ?? 0) > 0)
    .map((r) => ({ key: reversalLegKey(r.participant_id, "workspace"), amountCents: r.workspace_fee_cents }));

  const clawback = computeTalentProtectiveClawback({
    platformFeeCents,
    workspaceLegs,
    talentTotalCents,
    refundedCents,
  });

  if (clawback.workspaceClawbackTotalCents > 0) {
    await reverseBookingPayouts(
      ref.bookingId,
      { mode: "partial", reference: `partial_refund ${chargeId}`, workspaceClawbackByLeg: clawback.workspaceClawbackByLeg },
      { sb, stripe },
    );
  }

  // The talent is never auto-clawed: a refund that exceeds the platform +
  // workspace buffer leaves a residual that needs human judgment on the talent
  // side. Surface it loudly instead of silently reducing a received payout.
  if (clawback.talentResidualCents > 0) {
    logServerError(
      `refunds.partial.talentResidual[txn=${ref.transactionId}]`,
      new Error(
        `Partial refund ${refundedCents} exceeds platform+workspace buffer by ${clawback.talentResidualCents} cents — talent NOT auto-clawed; needs manual reconciliation.`,
      ),
    );
  }

  void improntaLog("stripe_webhook.info", {
    message: `[refund.partial] booking=${ref.bookingId} refunded=${refundedCents} platformAbsorbed=${clawback.platformAbsorbedCents} workspaceClawed=${clawback.workspaceClawbackTotalCents} talentResidual=${clawback.talentResidualCents}`,
  });

  // Tell the client their (partial) money is on the way back — only on a newly
  // recorded refund so a re-delivered webhook doesn't re-notify. The talent is
  // protected from a partial clawback, so they're intentionally not notified.
  if (isNew) {
    await notifyClientPartialRefund(sb, ref.bookingId, refundedCents);
  }
}

/**
 * Handle a charge.refunded for a booking. FULL refund → mark refunded, reverse
 * payouts (ledger-synced), flip the booking to refunded. PARTIAL refund →
 * talent-protective reconciliation. Returns true if this refund belonged to a
 * booking transaction (so the caller skips the balance-top-up refund path).
 */
export async function handleBookingRefund(
  stripe: Stripe,
  input: { paymentIntentId: string | null; chargeId: string; refundedCents: number },
): Promise<boolean> {
  const ref = await resolveBookingFromPaymentIntent(stripe, input.paymentIntentId);
  if (!ref) return false;

  const isFullRefund = ref.chargeAmountCents > 0 && input.refundedCents >= ref.chargeAmountCents;
  if (!isFullRefund) {
    await reconcilePartialRefund(stripe, ref, input.refundedCents, input.chargeId);
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
    const sb = createServiceRoleClient();
    const outcomes = await reverseBookingPayouts(ref.bookingId, { mode: "full", reference: `refund ${input.chargeId}` }, { sb, stripe });
    if (sb) {
      await markBookingRefunded(sb, ref.bookingId);
      await notifyBookingPayoutReversal(sb, ref.bookingId, outcomes, "refund");
    }
  }
  return true;
}

/**
 * Handle a charge.dispute.* event for a booking.
 *
 *   • created (closed=false): mark `disputed` + alert; transfers NOT reversed.
 *   • closed + lost: mark `refunded`, reverse payouts (ledger-synced), flip the
 *     booking to refunded.
 *   • closed + won: restore the transaction to `paid` (talent keeps the money).
 *
 * Returns true if it was a booking transaction.
 */
export async function handleBookingDispute(
  stripe: Stripe,
  input: {
    paymentIntentId: string | null;
    disputeId: string;
    amount: number;
    reason: string;
    status: string;
    closed: boolean;
  },
): Promise<boolean> {
  const ref = await resolveBookingFromPaymentIntent(stripe, input.paymentIntentId);
  if (!ref) return false;

  // ── dispute opened: flag + alert, do NOT touch the money ──
  if (!input.closed) {
    const marked = await markDisputed(ref.transactionId);
    if (!marked.ok) {
      void improntaLog("stripe_webhook.info", {
        message: `[dispute] markDisputed(${ref.transactionId}) not applied: ${marked.error}`,
      });
    }
    logServerError(
      `stripe-webhook.dispute.booking[txn=${ref.transactionId}]`,
      new Error(
        `Dispute ${input.disputeId} opened on booking transaction — amount=${input.amount} reason=${input.reason} status=${input.status}. Transfers NOT reversed (pending resolution).`,
      ),
    );
    return true;
  }

  // ── dispute closed ──
  if (input.status === "lost") {
    // Funds are gone — mirror the full-refund clawback.
    const marked = await markRefunded(ref.transactionId, {
      providerReference: input.disputeId,
      refundNote: "Stripe charge.dispute.closed (lost)",
    });
    if (!marked.ok) {
      void improntaLog("stripe_webhook.info", {
        message: `[dispute.lost] markRefunded(${ref.transactionId}) not applied: ${marked.error}`,
      });
    }
    if (ref.bookingId) {
      const sb = createServiceRoleClient();
      const outcomes = await reverseBookingPayouts(
        ref.bookingId,
        { mode: "full", reference: `dispute_lost ${input.disputeId}` },
        { sb, stripe },
      );
      if (sb) {
        await markBookingRefunded(sb, ref.bookingId);
        await notifyBookingPayoutReversal(sb, ref.bookingId, outcomes, "dispute");
      }
    }
    logServerError(
      `stripe-webhook.dispute.lost[txn=${ref.transactionId}]`,
      new Error(`Dispute ${input.disputeId} LOST — transfers reversed, booking refunded (amount=${input.amount} reason=${input.reason}).`),
    );
    return true;
  }

  if (input.status === "won") {
    // The platform kept the money; restore the transaction to paid (it was moved
    // to 'disputed' on open). Talent payouts were never reversed, so nothing to
    // re-send. Guarded so it only flips a transaction still sitting in 'disputed'.
    const sb = createServiceRoleClient();
    if (sb) {
      const { error } = await sb
        .from("booking_transactions")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("id", ref.transactionId)
        .eq("status", "disputed");
      if (error) logServerError(`refunds.dispute.won.restore[txn=${ref.transactionId}]`, error);
    }
    void improntaLog("stripe_webhook.info", {
      message: `[dispute.won] booking=${ref.bookingId ?? "?"} txn=${ref.transactionId} dispute=${input.disputeId} — transaction restored to paid.`,
    });
    return true;
  }

  // Any other closed status (e.g. warning_closed) — log, no money movement.
  void improntaLog("stripe_webhook.info", {
    message: `[dispute.closed] txn=${ref.transactionId} dispute=${input.disputeId} status=${input.status} — no action.`,
  });
  return true;
}
