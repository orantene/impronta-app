import "server-only";

/**
 * transfer-guards.ts — the two checks executeBookingTransfers makes before it moves money on a leg
 * (TUL-1746). Split out of transfers.ts, which is under a file-size budget.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { logServerError } from "@/lib/server/safe-error";
import type { DisburseOutcome } from "@/lib/payments/disburse";
import { recordPayoutLeg } from "@/lib/payments/booking-payouts-ledger";
import {
  REFUND_PENDING_ERROR_PREFIX,
  refundAheadOfLedger,
  stripeBackedCharges,
  type BookingTxnRow,
} from "./balance-payout-refund-net";

export type LedgerParty = "talent" | "workspace" | "channel_referral";

export type LegLedgerState = {
  /** Parties whose leg the ledger shows as 'transferred': never recomputed or re-sent, on any re-run. */
  transferred: ReadonlySet<LedgerParty>;
  /** The ledger could not be read, so "already paid?" is unknown: the caller HOLDS the legs, never pays blind. */
  unreadable: boolean;
};

/**
 * What the booking_payouts ledger says about this participant's legs. A paid leg is NEVER recomputed or re-sent
 * on any re-run (a re-delivered webhook, a fulfillment re-invoke, the held-payout retry). TUL-1746: refunds are
 * netted out of the legs now, so a re-run after a refund computes a DIFFERENT amount under the SAME Stripe
 * idempotency key; Stripe then rejects it within 24h and, once the window lapses, creates a second transfer.
 * The ledger is the truth for "already paid", not Stripe's key. (This used to run for pass_through rows only.)
 * One read per snapshot; on a read error the legs are HELD under a retryable reason (the cron owns them).
 */
export async function readLegLedgerState(sb: SupabaseClient, bookingId: string, participantId: string): Promise<LegLedgerState> {
  const { data, error } = await sb.from("booking_payouts").select("party, status").eq("booking_id", bookingId).eq("participant_id", participantId);
  if (error) {
    logServerError(
      "transfers.ledger_read_failed",
      new Error(`booking ${bookingId} participant ${participantId}: ${error.message} (legs held, retried by the cron)`),
    );
    return { transferred: new Set(), unreadable: true };
  }
  const transferred = new Set<LedgerParty>();
  for (const r of (data ?? []) as Array<{ party: string; status: string }>) {
    if (r.status === "transferred") transferred.add(r.party as LedgerParty);
  }
  return { transferred, unreadable: false };
}

/**
 * TUL-1746: is a refund in flight? Our refund rows are only written when Stripe's webhook lands, so between
 * Stripe issuing a refund and that webhook the database cannot see it. Stripe's charge.amount_refunded can.
 * Returns the hold reason (starts with "refund pending", the prefix the retry cron reads) when Stripe has
 * refunded more than our rows record on any of the booking's Stripe charges, or when that cannot be read
 * (never guess); null when clear or when there is no Stripe-backed charge to ask about.
 */
export async function refundInFlightReason(stripe: Stripe | null, rows: readonly BookingTxnRow[]): Promise<string | null> {
  const charges = stripeBackedCharges(rows);
  if (!stripe || charges.length === 0) return null;
  const refunded = new Map<string, number>();
  for (const c of charges) {
    try {
      const pi = await stripe.paymentIntents.retrieve(c.paymentIntentId, { expand: ["latest_charge"] });
      const latest = pi.latest_charge;
      const amount = typeof latest === "object" && latest ? latest.amount_refunded : 0;
      refunded.set(c.paymentIntentId, typeof amount === "number" ? amount : 0);
    } catch (err) {
      return `${REFUND_PENDING_ERROR_PREFIX}: could not verify refund state with Stripe (${err instanceof Error ? err.message : "unreadable"}); payout held, not guessed`;
    }
  }
  const ahead = refundAheadOfLedger(charges, refunded);
  return ahead
    ? `${REFUND_PENDING_ERROR_PREFIX}: Stripe shows ${ahead.stripeRefundedCents} refunded on charge ${ahead.chargeId}, the ledger records ${ahead.recordedRefundedCents}; payout held until the refund is recorded`
    : null;
}


/** Hold the channel referral leg (zero amount, retryable reason) and return its outcome. */
export async function holdChannelReferralLeg(
  sb: SupabaseClient,
  i: {
    bookingId: string;
    transactionId: string;
    participantId: string;
    owningPartyType: string;
    owningPartyId: string;
    channelPartyId: string;
    currency: string;
    reason: string;
    status: "skipped_refund_pending" | "skipped_ledger_unreadable";
  },
): Promise<DisburseOutcome> {
  await recordPayoutLeg(sb, {
    bookingId: i.bookingId,
    transactionId: i.transactionId,
    participantId: i.participantId,
    party: "channel_referral",
    owningPartyType: i.owningPartyType,
    owningPartyId: i.owningPartyId,
    talentProfileId: null,
    tenantId: i.channelPartyId,
    destinationAccountId: null,
    amountCents: 0,
    currency: i.currency,
    status: "held",
    stripeTransferId: null,
    payoutRail: "connect_transfer",
    releaseAfter: null,
    lastError: i.reason,
  });
  return {
    party: "channel_referral",
    participantId: i.participantId,
    amountCents: 0,
    currency: i.currency,
    rail: "connect_transfer",
    status: i.status,
    detail: i.reason,
  };
}
