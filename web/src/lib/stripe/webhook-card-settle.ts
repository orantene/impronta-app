/**
 * lib/stripe/webhook-card-settle.ts
 *
 * The two things a one-time Checkout session can tell us about a money row, and
 * the ONE path each takes. Split out of `webhook-handler.ts` (which keeps the
 * dispatch) so invoices, POS card sales and payment links settle through the
 * same function and that function stays readable.
 *
 *   settleCheckoutPayment  — the charge landed: amount guard, then `markPaid`
 *                            (PaymentIntent id, booking sync, receipt, transfers,
 *                            order, claim, payment link). A charge it cannot
 *                            book (wrong amount, closed row, second PaymentIntent
 *                            on a paid row) leaves a durable flag on the row
 *                            (`payment-review-flags.ts`) and moves no money.
 *   closeCheckoutSession   — the session can never be paid: a payment link's
 *                            row fails, its claim goes back, the link expires.
 *
 * Neither throws: they return `{ ok: false, error }` and the handler turns that
 * into its retryable error, so this module needs nothing from the handler.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markFailed, markPaid } from "@/lib/bookings/transactions";
import { unwindClosedCheckoutSession } from "@/lib/orders/unwind-failed-checkout";
import { closePaymentLinkForClosedCheckout } from "@/lib/payments/link-settlement";
import { releasePromoHoldsForClosedCheckout } from "@/lib/promos/redemption/order-redemptions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { StripeAccountKey } from "@/lib/stripe/client";
import { loadChargePlatformForTransaction, recordChargePlatform } from "@/lib/stripe/charge-platform";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { advanceDraftForSettlement, type DraftAdvanceResult } from "@/lib/stripe/webhook-draft-advance";
import { flagPaymentForReview, type FlagPaymentResult } from "@/lib/payments/payment-review-flags";
import type { PaymentReviewFlagInput, PaymentReviewReason } from "@/lib/payments/payment-review-flags-model";

/** Audit #5: pull the actually-charged amount + currency from the settlement event
 *  (PaymentIntent or Checkout Session) so it can be reconciled against the booking
 *  transaction before payout. Returns null for event types without a clear amount. */
export function extractChargedAmount(event: Stripe.Event): { amountCents: number; currency: string } | null {
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    return { amountCents: pi.amount ?? 0, currency: pi.currency ?? "" };
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    return { amountCents: s.amount_total ?? 0, currency: s.currency ?? "" };
  }
  return null;
}

const SETTLED_TRANSACTION_STATUSES = new Set(["paid", "payout_pending", "payout_sent"]);

/** TUL-1284: a row that can never be paid. A charge landing on it is owed back. */
const INACTIVE_TRANSACTION_STATUSES = new Set(["cancelled", "failed"]);

/** The PaymentIntent `markPaid` recorded when it settled the row (see markPaid). */
function paidByPaymentIntent(providerMetadata: unknown): string | null {
  if (!providerMetadata || typeof providerMetadata !== "object" || Array.isArray(providerMetadata)) return null;
  const id = (providerMetadata as Record<string, unknown>).payment_intent_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

type RowFacts = {
  status: string | null;
  paidBy: string | null;
  expectedAmountCents: number | null;
  expectedCurrency: string | null;
};

/** Where the row went after `markPaid` refused it (another writer won, or it was closed). */
async function readRowAfterRefusal(
  transactionId: string,
  getAdmin: () => SupabaseClient | null,
): Promise<{ status: string | null; paidBy: string | null } | null> {
  const sb = getAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from("booking_transactions")
    .select("status, provider_metadata")
    .eq("id", transactionId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { status?: unknown; provider_metadata?: unknown };
  return {
    status: typeof row.status === "string" ? row.status : null,
    paidBy: paidByPaymentIntent(row.provider_metadata),
  };
}

export type SettleCheckoutResult =
  | { ok: true; outcome: "paid" | "already_settled" | "amount_mismatch" | "charge_on_inactive_row" | "duplicate_charge" }
  | { ok: false; error: string };

/** Everything `settleCheckoutPayment` reaches outside itself. Each defaults to the
 *  production import; tests pass fakes so the settle path runs without a database. */
export type SettleDeps = {
  markPaid: (
    transactionId: string,
    opts?: { paymentIntentId?: string | null },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  recordChargePlatform: (transactionId: string, key: StripeAccountKey) => Promise<boolean>;
  loadChargePlatformForTransaction: (transactionId: string) => Promise<StripeAccountKey>;
  getAdmin: () => SupabaseClient | null;
  /** TUL-1268 M1: a checkout row still at `draft` steps to `payment_requested` first. */
  advanceDraft: (sb: SupabaseClient, transactionId: string) => Promise<DraftAdvanceResult>;
  /** TUL-1283 / TUL-1284 / M2: durable flag on the money row for a person. Never moves money. */
  flagPayment: (transactionId: string, flag: PaymentReviewFlagInput) => Promise<FlagPaymentResult>;
};

export async function settleCheckoutPayment(
  event: Stripe.Event,
  action: { transactionId: string; paymentIntentId: string | null },
  /** Platform account the event arrived on. */
  account: StripeAccountKey = "us",
  deps: Partial<SettleDeps> = {},
): Promise<SettleCheckoutResult> {
  const markPaidFn = deps.markPaid ?? markPaid;
  const recordPlatform = deps.recordChargePlatform ?? recordChargePlatform;
  const loadPlatform = deps.loadChargePlatformForTransaction ?? loadChargePlatformForTransaction;
  const getAdmin = deps.getAdmin ?? createServiceRoleClient;
  const advanceDraft = deps.advanceDraft ?? advanceDraftForSettlement;
  const flagPayment =
    deps.flagPayment ??
    (async (transactionId: string, flag: PaymentReviewFlagInput): Promise<FlagPaymentResult> => {
      const sb = getAdmin();
      if (!sb) return { ok: false, error: "payment flag: database unavailable" };
      return flagPaymentForReview(sb, { transactionId, flag });
    });
  // The platform that delivered this settlement IS the platform that took the
  // charge. Record it BEFORE markPaid fans out payouts (transfers, refunds and
  // reversals all key off it), and flag a disagreement with what checkout stored.
  if (account === "mx") {
    if (!(await recordPlatform(action.transactionId, "mx"))) {
      return { ok: false, error: `could not record charge platform mx for ${action.transactionId}` };
    }
  } else if ((await loadPlatform(action.transactionId)) === "mx") {
    logServerError(
      "stripe-webhook.charge_platform_mismatch",
      new Error(`ALERT US-platform settlement for txn ${action.transactionId} recorded as an MX charge (event ${event.id})`),
    );
  }

  const charged = extractChargedAmount(event);

  /** Raise one flag; a flag that cannot be written is a retry, because it is the only record. */
  const raise = async (
    reason: PaymentReviewReason,
    row: RowFacts,
    otherPaymentIntentId: string | null,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const flagged = await flagPayment(action.transactionId, {
      reason,
      paymentIntentId: action.paymentIntentId,
      otherPaymentIntentId,
      expectedAmountCents: row.expectedAmountCents,
      expectedCurrency: row.expectedCurrency,
      chargedAmountCents: charged?.amountCents ?? null,
      chargedCurrency: charged?.currency ?? null,
      rowStatus: row.status,
      stripeEventId: event.id,
    });
    return flagged.ok ? { ok: true } : { ok: false, error: `${reason} flag for ${action.transactionId}: ${flagged.error}` };
  };

  /**
   * The row is no longer waiting for money. Three answers, none of them a retry:
   *   settled by THIS PaymentIntent  -> a replay; acknowledged, nothing runs twice.
   *   settled by ANOTHER one         -> M2 duplicate charge; flagged with both ids.
   *   cancelled / failed             -> TUL-1284 charge on an inactive row; flagged
   *                                     for refund. Retrying for three days would
   *                                     only hide that the money was taken.
   * Returns null when the row is still open and the ordinary path continues.
   */
  const closedRowAnswer = async (row: RowFacts): Promise<SettleCheckoutResult | null> => {
    if (row.status && SETTLED_TRANSACTION_STATUSES.has(row.status)) {
      if (action.paymentIntentId && row.paidBy && row.paidBy !== action.paymentIntentId) {
        const flagged = await raise("duplicate_charge", row, row.paidBy);
        return flagged.ok ? { ok: true, outcome: "duplicate_charge" } : flagged;
      }
      void improntaLog("stripe_webhook.info", {
        message: `booking_payment already settled: transaction ${action.transactionId} (event ${event.id})`,
      });
      return { ok: true, outcome: "already_settled" };
    }
    if (row.status && INACTIVE_TRANSACTION_STATUSES.has(row.status)) {
      const flagged = await raise("charge_on_inactive_row", row, null);
      return flagged.ok ? { ok: true, outcome: "charge_on_inactive_row" } : flagged;
    }
    return null;
  };

  // Audit #5: verify the actually-charged amount + currency match the booking
  // transaction BEFORE marking paid + disbursing. The PaymentIntent is
  // idempotency-keyed at its first amount, so a later gross edit can silently
  // diverge; auto-paying out on a mismatched charge would over/under-pay the
  // talent. On mismatch, skip markPaid and write a reconciliation flag
  // (TUL-1283) instead of auto-paying the wrong amount.
  let facts: RowFacts = { status: null, paidBy: null, expectedAmountCents: null, expectedCurrency: null };
  const sbGuard = getAdmin();
  if (sbGuard) {
    const { data: txnRow, error: guardErr } = await sbGuard
      .from("booking_transactions")
      .select("gross_amount_cents, currency, status, provider_metadata")
      .eq("id", action.transactionId)
      .maybeSingle();
    // A guard that cannot read the row cannot vouch for the amount: retry
    // rather than pay out unguarded (this used to fall through to markPaid).
    if (guardErr) return { ok: false, error: `amount guard read failed for ${action.transactionId}: ${guardErr.message}` };
    if (txnRow) {
      const row = txnRow as { gross_amount_cents?: unknown; currency?: unknown; status?: unknown; provider_metadata?: unknown };
      facts = {
        status: typeof row.status === "string" ? row.status : null,
        paidBy: paidByPaymentIntent(row.provider_metadata),
        expectedAmountCents: row.gross_amount_cents == null ? null : Number(row.gross_amount_cents),
        expectedCurrency: row.currency == null ? null : String(row.currency),
      };
      // A closed row first: a second charge on a paid row is a duplicate even
      // when its amount differs, and a charge on a cancelled row is owed back
      // whatever it was for.
      const closed = await closedRowAnswer(facts);
      if (closed) return closed;
      if (
        charged &&
        (Number(row.gross_amount_cents) !== charged.amountCents ||
          String(row.currency).toLowerCase() !== charged.currency.toLowerCase())
      ) {
        logServerError(
          "stripe-webhook.booking_payment.amount_mismatch",
          new Error(
            `charged ${charged.amountCents} ${charged.currency} != txn ${String(row.gross_amount_cents)} ${String(row.currency)} (txn ${action.transactionId}): skipped markPaid, flagged for reconciliation`,
          ),
        );
        const flagged = await raise("amount_mismatch", facts, null);
        return flagged.ok ? { ok: true, outcome: "amount_mismatch" } : flagged;
      }
    }
  }
  // TUL-1268 M1: a guest card checkout opens its row at `draft` and nothing
  // moved it on, so `markPaid` refused it forever. Charged means requested.
  const sbAdvance = getAdmin();
  if (sbAdvance) {
    const advanced = await advanceDraft(sbAdvance, action.transactionId);
    if (!advanced.ok) return { ok: false, error: advanced.error };
  }
  // Thread the settling PaymentIntent onto the transaction so a refund can
  // later be issued against the real charge (see markPaid).
  const result = await markPaidFn(action.transactionId, { paymentIntentId: action.paymentIntentId });
  if (result.ok) return { ok: true, outcome: "paid" };

  // ALREADY SETTLED IS AN ANSWER, NOT A FAULT. `markPaid` refuses a row that is
  // no longer waiting (`Cannot transition from 'paid'`), and a second delivery
  // for the same payment (a replay after a lost claim, the recovery worker
  // getting there first, `async_payment_succeeded` after `completed`) used to
  // turn that refusal into a 5xx that Stripe retried for three days against
  // money already booked. Settled once means acknowledged; nothing runs twice.
  // The row may also have moved between the guard read and markPaid (a racing
  // PaymentIntent won, or a cancel landed): the same three answers apply.
  const after = await readRowAfterRefusal(action.transactionId, getAdmin);
  if (after) {
    const closed = await closedRowAnswer({ ...facts, status: after.status, paidBy: after.paidBy });
    if (closed) return closed;
  }
  // Otherwise almost always a transient DB blip. The caller retries rather
  // than silently lose a paid booking.
  return { ok: false, error: `markPaid(${action.transactionId}): ${result.error}` };
}

const UUID_TXN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function closeCheckoutSession(action: {
  transactionId: string;
  reason: "expired" | "async_payment_failed";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "checkout_session_closed: database unavailable" };
  const closed = await closePaymentLinkForClosedCheckout(
    sb,
    { transactionId: action.transactionId, reason: action.reason },
    { markFailed },
  );
  if (!closed.ok) return { ok: false, error: `checkout_session_closed(${action.transactionId}): ${closed.reason}` };
  if (closed.outcome === "skipped") {
    // TUL-706: not a payment link. An instant-book row gets the failed-checkout
    // unwind (booking, transaction, order), each write guarded on unpaid.
    const unwound = await unwindClosedCheckoutSession(sb, action);
    if (!unwound.ok) return { ok: false, error: `checkout_session_closed(${action.transactionId}): unwind incomplete` };
  }
  // Promos v1: an abandoned instant checkout frees its held promo now (the
  // sweep cron covers anything this misses). Best effort, never a retry.
  if (UUID_TXN.test(action.transactionId)) await releasePromoHoldsForClosedCheckout(sb, action.transactionId);
  return { ok: true };
}
