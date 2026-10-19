/**
 * E5 (TUL-1268 M9): reverse only the refunded CHARGE's share of a booking's payouts.
 *
 * Payout legs are per booking (`booking_payouts` is unique on booking +
 * participant + party) and are paid once, on the balance/full charge
 * (payout-on-full, `markPaid`). On a deposit + balance booking each leg is
 * therefore funded by BOTH charges. A full refund (or lost dispute) of ONE of
 * them used to call `reverseBookingPayouts(..., { mode: "full" })`, which takes
 * back every leg in full: refund the 30000 deposit of a 100000 booking and the
 * talent lost the whole 70000 payout while the 70000 balance stayed paid.
 *
 * The rule here:
 *  - The refunded charge is the only live charge on the booking (single-charge
 *    booking, or every other charge already refunded): unchanged, the full
 *    reversal of what is left on each leg.
 *  - Other charges are still live: each leg gives back
 *    `round(leg * refunded / (refunded + other live))`, capped at what is still
 *    un-reversed on its transfer. A held/failed leg (money never sent) is
 *    reduced by the same share so a later release pays only what is still owed.
 *
 * Idempotent: a Stripe reversal is keyed per (transfer, charge) and every leg it
 * touches is stamped with `[charge_share:<anchor>]`, so a re-delivered webhook
 * never takes the share twice. A failed read falls back to the previous
 * behaviour (full reversal) and is logged, never a silent skip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import {
  reverseBookingPayouts,
  type PayoutParty,
  type PayoutReversalOutcome,
} from "@/lib/payments/booking-payouts-ledger";
import { getStripeFor } from "@/lib/stripe/client";
import { loadChargePlatformForBooking } from "@/lib/stripe/charge-platform";
import { logServerError } from "@/lib/server/safe-error";

/** Charge rows that still hold the client's money (a dispute is not lost yet). */
const LIVE_CHARGE_STATUSES = new Set(["paid", "payout_pending", "payout_sent", "disputed"]);

export type BookingChargeRow = {
  id: string;
  status: string | null;
  gross_amount_cents: number | null;
  refund_of_transaction_id: string | null;
};

/** Pure: the refunded charge and the sum of the OTHER charges still live on the booking. */
export function chargeShareOf(
  transactionId: string,
  fallbackChargeCents: number,
  rows: readonly BookingChargeRow[],
): { refundedChargeCents: number; otherLiveChargeCents: number } {
  const own = rows.find((r) => r.id === transactionId)?.gross_amount_cents;
  const refundedChargeCents = typeof own === "number" && own > 0 ? own : Math.max(0, fallbackChargeCents);
  const otherLiveChargeCents = rows
    .filter((r) => r.id !== transactionId && !r.refund_of_transaction_id && LIVE_CHARGE_STATUSES.has(r.status ?? ""))
    .reduce((sum, r) => sum + Math.max(0, r.gross_amount_cents ?? 0), 0);
  return { refundedChargeCents, otherLiveChargeCents };
}

/** Pure: the part of one leg that belongs to the refunded charge (integer minor units). */
export function shareOfLegCents(legCents: number, refundedChargeCents: number, otherLiveChargeCents: number): number {
  const leg = Math.max(0, Math.round(legCents));
  if (otherLiveChargeCents <= 0) return leg;
  const total = refundedChargeCents + otherLiveChargeCents;
  if (total <= 0 || refundedChargeCents <= 0) return 0;
  return Math.min(leg, Math.round((leg * refundedChargeCents) / total));
}

type ShareLegRow = {
  id: string;
  participant_id: string;
  party: PayoutParty;
  amount_cents: number;
  status: string;
  stripe_transfer_id: string | null;
  last_error: string | null;
};

/**
 * Drop-in for `reverseBookingPayouts(bookingId, { mode: "full", reference })` on
 * the full-refund and lost-dispute paths. `anchor` names the event (charge id /
 * dispute id) for the idempotency key and marker.
 */
export async function reverseRefundedChargePayouts(
  ref: { bookingId: string; transactionId: string; chargeAmountCents: number },
  plan: { reference: string; anchor: string },
  deps: { sb: SupabaseClient | null; stripe?: Stripe | null },
): Promise<PayoutReversalOutcome[]> {
  const full = () => reverseBookingPayouts(ref.bookingId, { mode: "full", reference: plan.reference }, deps);
  const sb = deps.sb;
  if (!sb) return full();

  const { data: chargeRows, error: chargeErr } = await sb
    .from("booking_transactions")
    .select("id, status, gross_amount_cents, refund_of_transaction_id")
    .eq("booking_id", ref.bookingId);
  if (chargeErr) {
    logServerError(`refunds.chargeShare.read[booking=${ref.bookingId}]`, chargeErr);
    return full();
  }
  const share = chargeShareOf(ref.transactionId, ref.chargeAmountCents, (chargeRows ?? []) as BookingChargeRow[]);
  if (share.otherLiveChargeCents <= 0) return full();

  const { data: legRows, error: legErr } = await sb
    .from("booking_payouts")
    .select("id, participant_id, party, amount_cents, status, stripe_transfer_id, last_error")
    .eq("booking_id", ref.bookingId);
  if (legErr) {
    logServerError(`refunds.chargeShare.legs[booking=${ref.bookingId}]`, legErr);
    return [];
  }
  const legs = (legRows ?? []) as ShareLegRow[];
  if (legs.length === 0) return [];

  const stripe = deps.stripe ?? getStripeFor(await loadChargePlatformForBooking(ref.bookingId, sb));
  const reversedAlready = new Map<string, number>();
  if (stripe) {
    try {
      const list = await stripe.transfers.list({ transfer_group: `booking_${ref.bookingId}`, limit: 100 });
      for (const t of list.data) reversedAlready.set(t.id, t.amount_reversed ?? 0);
    } catch (err) {
      logServerError(`refunds.chargeShare.list[booking=${ref.bookingId}]`, err);
    }
  }

  const marker = `[charge_share:${plan.anchor}]`;
  const outcomes: PayoutReversalOutcome[] = [];
  for (const leg of legs) {
    const base = { legId: leg.id, participantId: leg.participant_id, party: leg.party } as const;
    if (leg.status === "reversed" || (leg.last_error ?? "").includes(marker)) {
      outcomes.push({ ...base, amountCents: 0, result: "noop" });
      continue;
    }
    const claw = shareOfLegCents(leg.amount_cents, share.refundedChargeCents, share.otherLiveChargeCents);
    const note = (text: string) => `${(leg.last_error ?? "").trim()} ${plan.reference} ${text} ${marker}`.trim();

    if (leg.status === "held" || leg.status === "failed") {
      // Never sent: owe only the live charges' share from now on.
      const { error } = await sb
        .from("booking_payouts")
        .update({ amount_cents: Math.max(0, leg.amount_cents - claw), last_error: note(`share_reduced ${claw}`), updated_at: new Date().toISOString() })
        .eq("id", leg.id);
      if (error) logServerError(`refunds.chargeShare.reduceHeld[leg=${leg.id}]`, error);
      outcomes.push({ ...base, amountCents: 0, result: "cancelled_held", detail: `reduced by ${claw}` });
      continue;
    }
    if (leg.status !== "transferred") continue;

    const already = leg.stripe_transfer_id ? (reversedAlready.get(leg.stripe_transfer_id) ?? 0) : 0;
    const amount = Math.min(claw, Math.max(0, leg.amount_cents - already));
    if (amount <= 0) {
      outcomes.push({ ...base, amountCents: 0, result: "noop" });
      continue;
    }
    let reversalId: string | null = null;
    if (leg.stripe_transfer_id && stripe) {
      try {
        const reversal = await stripe.transfers.createReversal(
          leg.stripe_transfer_id,
          { amount },
          { idempotencyKey: `reverse_share_${leg.stripe_transfer_id}_${plan.anchor}` },
        );
        reversalId = reversal.id;
      } catch (err) {
        logServerError(`refunds.chargeShare.reverse[leg=${leg.id}]`, err);
        outcomes.push({ ...base, amountCents: 0, result: "failed", detail: err instanceof Error ? err.message : "reversal failed" });
        continue;
      }
    }
    // The leg stays 'transferred': the live charges' share is still paid out.
    await sb
      .from("booking_payouts")
      .update({ last_error: note(`share_reversal ${amount}${reversalId ? ` -> ${reversalId}` : " (mock)"}`), updated_at: new Date().toISOString() })
      .eq("id", leg.id);
    outcomes.push({ ...base, amountCents: amount, result: "reversed", reversalId });
  }
  return outcomes;
}
