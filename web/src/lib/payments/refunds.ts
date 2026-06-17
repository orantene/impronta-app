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
import { markRefunded as markRefundedReal, markDisputed as markDisputedReal } from "@/lib/bookings/transactions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadBookingCommissionSnapshots } from "@/lib/billing/commission-engine";
import {
  reverseBookingPayouts,
  computeTalentProtectiveClawback,
  reversalLegKey,
} from "@/lib/payments/booking-payouts-ledger";
import {
  notifyBookingPayoutReversal as notifyBookingPayoutReversalReal,
  notifyClientPartialRefund as notifyClientPartialRefundReal,
} from "@/lib/payments/payout-reversal-notify";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import type { SupabaseClient } from "@supabase/supabase-js";

type BookingRef = { transactionId: string; bookingId: string | null; chargeAmountCents: number };

/**
 * Optional dependency-injection seam for the refund/dispute handlers.
 *
 * Production passes NOTHING: `supabase` defaults to the real
 * `createServiceRoleClient()`, the booking-transaction transitions
 * (`markRefunded` / `markDisputed`) and the reversal notifications default to the
 * real server-only implementations (each of which resolves its own service-role
 * client). The Stripe client stays the first positional arg (the live webhook
 * passes it), so production behaviour is byte-for-byte identical.
 *
 * Tests inject a recording Supabase fake + a mock Stripe + no-op transition /
 * notify stubs so the full refund → markRefunded → payout-reversal flow can be
 * asserted end-to-end without a live Stripe account or DB.
 */
export type RefundDeps = {
  /** Service-role Supabase client; defaults to createServiceRoleClient(). */
  supabase?: SupabaseClient | null;
  /** Flip a booking_transaction to 'refunded' (+ linked refund row). Defaults to the real markRefunded. */
  markRefunded?: typeof markRefundedReal;
  /** Flip a booking_transaction to 'disputed'. Defaults to the real markDisputed. */
  markDisputed?: typeof markDisputedReal;
  /** Notify talent + client of a full payout reversal. Defaults to the real notifier. */
  notifyBookingPayoutReversal?: typeof notifyBookingPayoutReversalReal;
  /** Notify the client of a partial refund. Defaults to the real notifier. */
  notifyClientPartialRefund?: typeof notifyClientPartialRefundReal;
};

/** Resolve the injected deps, defaulting every slot to its real implementation. */
function resolveRefundDeps(deps: RefundDeps): {
  resolveSupabase: () => SupabaseClient | null;
  markRefunded: typeof markRefundedReal;
  markDisputed: typeof markDisputedReal;
  notifyBookingPayoutReversal: typeof notifyBookingPayoutReversalReal;
  notifyClientPartialRefund: typeof notifyClientPartialRefundReal;
} {
  return {
    // A test passes `supabase` once and reuses it for every internal read/write;
    // production resolves a fresh service-role client per call site (unchanged).
    resolveSupabase: () => (deps.supabase !== undefined ? deps.supabase : createServiceRoleClient()),
    markRefunded: deps.markRefunded ?? markRefundedReal,
    markDisputed: deps.markDisputed ?? markDisputedReal,
    notifyBookingPayoutReversal: deps.notifyBookingPayoutReversal ?? notifyBookingPayoutReversalReal,
    notifyClientPartialRefund: deps.notifyClientPartialRefund ?? notifyClientPartialRefundReal,
  };
}

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
 * satisfies the platform_fee + net = gross balance check).
 *
 * EVENT-BASED idempotency (P1 hardening): the row is keyed on the Stripe Refund
 * id (`re_...`), persisted in `provider_refund_id` with a UNIQUE index. Stripe
 * emits one `charge.refunded` per refund, and `charge.amount_refunded` is
 * cumulative — so amount-based dedup couldn't tell a re-delivered event from a
 * genuinely new additive partial, and each new amount inserted another clawing
 * row (double-claw of the workspace leg). Keying on `re_...` makes a re-delivery
 * (same id) a no-op while a real new partial (new id) records exactly once.
 * When no refund id is available (legacy/trimmed payload) we fall back to the
 * previous (parent, amount, refunded) probe so that legacy shape still doesn't
 * duplicate on re-delivery.
 *
 * `refundAmountCents` is THIS refund's own slice (not the cumulative charge
 * total) so additive partials each record only what they refunded.
 *
 * Exported (not just module-private) so the event-based dedup contract can be
 * unit-tested against a recording-fake Supabase without a live DB — the handler
 * entry points (`handleBookingRefund`) resolve their own service-role client and
 * are not injectable. See `refunds.test.ts`.
 */
export async function recordPartialRefund(
  sb: SupabaseClient,
  transactionId: string,
  refundAmountCents: number,
  chargeId: string,
  refundId: string | null,
): Promise<boolean> {
  if (refundAmountCents <= 0) return false;
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

  // Idempotency. Prefer the event-based key (Stripe Refund id). Fall back to
  // the legacy amount probe only when no refund id is available.
  if (refundId) {
    const { data: existing } = await sb
      .from("booking_transactions")
      .select("id")
      .eq("provider_refund_id", refundId)
      .maybeSingle();
    if (existing) return false;
  } else {
    const { data: existing } = await sb
      .from("booking_transactions")
      .select("id")
      .eq("refund_of_transaction_id", transactionId)
      .eq("gross_amount_cents", refundAmountCents)
      .eq("status", "refunded")
      .maybeSingle();
    if (existing) return false;
  }

  const { error: insertErr } = await sb.from("booking_transactions").insert({
    booking_id: parent.booking_id,
    source_tenant_id: parent.source_tenant_id,
    source_inquiry_id: parent.source_inquiry_id,
    payer_user_id: parent.payer_user_id,
    payer_email: parent.payer_email,
    payout_receiver_id: parent.payout_receiver_id,
    payout_receiver_kind: parent.payout_receiver_kind,
    payout_receiver_display_name: parent.payout_receiver_display_name,
    gross_amount_cents: refundAmountCents,
    platform_fee_basis_points: 0,
    platform_fee_cents: 0,
    net_amount_cents: refundAmountCents,
    currency: parent.currency,
    provider: parent.provider,
    provider_reference: chargeId,
    provider_refund_id: refundId,
    status: "refunded",
    refund_of_transaction_id: transactionId,
    refunded_at: new Date().toISOString(),
    failure_reason: "Stripe charge.refunded (partial)",
    created_by_profile_id: parent.created_by_profile_id,
  });
  if (insertErr) {
    // A unique-violation on provider_refund_id is a benign re-delivery race
    // (two webhook deliveries inserting the same refund id concurrently) — the
    // row already exists, so treat it as "not newly recorded", not an error.
    if ((insertErr as { code?: string }).code === "23505") return false;
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
 *
 * `refundAmountCents` is THIS refund event's own slice (Stripe `Refund.amount`),
 * NOT the cumulative `charge.amount_refunded` — so the clawback math and the
 * recorded leg cover only the money this delivery actually refunded. The
 * workspace clawback per-leg partial reversal is keyed on the leg's transfer id
 * (in reverseBookingPayouts), and the recorded refund row is keyed on the
 * Stripe Refund id, so a sequence of additive partials each reverse/record
 * exactly their own portion with no double-claw.
 */
async function reconcilePartialRefund(
  stripe: Stripe,
  ref: BookingRef,
  refundAmountCents: number,
  chargeId: string,
  refundId: string | null,
  deps: RefundDeps = {},
): Promise<void> {
  const d = resolveRefundDeps(deps);
  const sb = d.resolveSupabase();
  if (!sb) {
    logServerError("refunds.partial.noDb", new Error(`partial refund ${refundAmountCents} on txn ${ref.transactionId} — no service-role client`));
    return;
  }

  // Record the partial refund on the books regardless of payout state.
  // `isNew` gates the client notification + the payout clawback so a webhook
  // re-delivery (same Stripe Refund id) doesn't re-claw or re-notify —
  // recordPartialRefund dedups on the refund id (event-based).
  const isNew = await recordPartialRefund(sb, ref.transactionId, refundAmountCents, chargeId, refundId);

  if (!ref.bookingId) {
    logServerError(
      `refunds.partial[txn=${ref.transactionId}]`,
      new Error(`Partial refund ${refundAmountCents} recorded; no booking_id on PI → payout math not reconciled (manual check).`),
    );
    return;
  }

  // Only run the clawback for a NEWLY-recorded refund. A re-delivered event
  // (already-recorded refund id) must not claw again. The per-transfer Stripe
  // idempotency key in reverseBookingPayouts is a second line of defence; this
  // is the primary event-level guard.
  if (!isNew) {
    void improntaLog("stripe_webhook.info", {
      message: `[refund.partial] booking=${ref.bookingId} refund=${refundId ?? "(no-id)"} already recorded — clawback + notify skipped (re-delivery).`,
    });
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
    refundedCents: refundAmountCents,
  });

  if (clawback.workspaceClawbackTotalCents > 0) {
    // The partial-reversal idempotency key is anchored on the same stable
    // per-refund value as the reference: the Stripe Refund id (`re_...`) when we
    // have it, else the charge id. Distinct refunds → distinct anchors →
    // distinct keys (so a 2nd partial on the same transfer is applied, not
    // rejected); a re-delivered same refund → same anchor → same key (replay,
    // no double-claw).
    await reverseBookingPayouts(
      ref.bookingId,
      {
        mode: "partial",
        reference: `partial_refund ${refundId ?? chargeId}`,
        workspaceClawbackByLeg: clawback.workspaceClawbackByLeg,
        partialReversalAnchor: refundId ?? chargeId,
      },
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
        `Partial refund ${refundAmountCents} exceeds platform+workspace buffer by ${clawback.talentResidualCents} cents — talent NOT auto-clawed; needs manual reconciliation.`,
      ),
    );
  }

  void improntaLog("stripe_webhook.info", {
    message: `[refund.partial] booking=${ref.bookingId} refunded=${refundAmountCents} platformAbsorbed=${clawback.platformAbsorbedCents} workspaceClawed=${clawback.workspaceClawbackTotalCents} talentResidual=${clawback.talentResidualCents}`,
  });

  // Tell the client their (partial) money is on the way back. The talent is
  // protected from a partial clawback, so they're intentionally not notified.
  await d.notifyClientPartialRefund(sb, ref.bookingId, refundAmountCents);
}

/**
 * Handle a charge.refunded for a booking. FULL refund → mark refunded, reverse
 * payouts (ledger-synced), flip the booking to refunded. PARTIAL refund →
 * talent-protective reconciliation. Returns true if this refund belonged to a
 * booking transaction (so the caller skips the balance-top-up refund path).
 *
 * `refundedCents` is Stripe's CUMULATIVE `amount_refunded` — used only to decide
 * full-vs-partial. `refundAmountCents` is THIS refund event's own slice (used
 * for the partial leg + clawback), and `refundId` (Stripe `re_...`) is the
 * event-based idempotency key the partial path dedups on.
 */
export async function handleBookingRefund(
  stripe: Stripe,
  input: {
    paymentIntentId: string | null;
    chargeId: string;
    refundedCents: number;
    refundId?: string | null;
    refundAmountCents?: number;
  },
  deps: RefundDeps = {},
): Promise<boolean> {
  const d = resolveRefundDeps(deps);
  const ref = await resolveBookingFromPaymentIntent(stripe, input.paymentIntentId);
  if (!ref) return false;

  const isFullRefund = ref.chargeAmountCents > 0 && input.refundedCents >= ref.chargeAmountCents;
  if (!isFullRefund) {
    // The individual refund slice drives the partial reconciliation; fall back
    // to the cumulative amount only if the routing layer couldn't enumerate the
    // refund object (legacy/trimmed payload).
    const refundAmountCents = input.refundAmountCents ?? input.refundedCents;
    await reconcilePartialRefund(stripe, ref, refundAmountCents, input.chargeId, input.refundId ?? null, deps);
    return true;
  }

  const marked = await d.markRefunded(ref.transactionId, {
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
    const sb = d.resolveSupabase();
    const outcomes = await reverseBookingPayouts(ref.bookingId, { mode: "full", reference: `refund ${input.chargeId}` }, { sb, stripe });
    if (sb) {
      await markBookingRefunded(sb, ref.bookingId);
      await d.notifyBookingPayoutReversal(sb, ref.bookingId, outcomes, "refund");
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
  deps: RefundDeps = {},
): Promise<boolean> {
  const d = resolveRefundDeps(deps);
  const ref = await resolveBookingFromPaymentIntent(stripe, input.paymentIntentId);
  if (!ref) return false;

  // ── dispute opened: flag + alert, do NOT touch the money ──
  if (!input.closed) {
    const marked = await d.markDisputed(ref.transactionId);
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
    const marked = await d.markRefunded(ref.transactionId, {
      providerReference: input.disputeId,
      refundNote: "Stripe charge.dispute.closed (lost)",
    });
    if (!marked.ok) {
      void improntaLog("stripe_webhook.info", {
        message: `[dispute.lost] markRefunded(${ref.transactionId}) not applied: ${marked.error}`,
      });
    }
    if (ref.bookingId) {
      const sb = d.resolveSupabase();
      const outcomes = await reverseBookingPayouts(
        ref.bookingId,
        { mode: "full", reference: `dispute_lost ${input.disputeId}` },
        { sb, stripe },
      );
      if (sb) {
        await markBookingRefunded(sb, ref.bookingId);
        await d.notifyBookingPayoutReversal(sb, ref.bookingId, outcomes, "dispute");
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
    const sb = d.resolveSupabase();
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
