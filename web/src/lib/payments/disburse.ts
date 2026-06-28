/**
 * lib/payments/disburse.ts
 *
 * Rail-agnostic payout router. A single booking payout leg can settle via:
 *   • "connect_transfer" — the existing Connect rail: stripe.transfers.create
 *     → the recipient's connected (Express/Custom) account. US/UK/EEA/CA/CH.
 *   • "global_payouts"   — the v2 Money Movement rail: an OutboundPayment from
 *     the platform FinancialAccount → the recipient's v2 account + PayoutMethod.
 *     ~50+ countries incl. MX/AR/CO, and USDC.
 *
 * Both produce the SAME outcome shape so the caller (executeBookingTransfers)
 * records the booking_payouts ledger identically regardless of rail. All I/O is
 * via injected deps (Stripe client / GP executor), so this is unit-testable
 * with no network. The Connect path preserves the exact idempotency key + status
 * semantics of the original payParty() so existing behaviour is unchanged.
 */

import type Stripe from "stripe";
import { logServerError } from "@/lib/server/safe-error";
import {
  createOutboundPayment as defaultCreateOutboundPayment,
  assertLivePayoutSafe as defaultAssertLivePayoutSafe,
  type OutboundPayment,
} from "./global-payouts";
import { isStripeV2Configured, type StripeV2Result } from "./stripe-v2";

export type PayoutRail = "connect_transfer" | "global_payouts";

export type DisburseStatus =
  | "transferred"
  | "skipped_no_account"
  | "skipped_zero"
  | "skipped_live_disabled"
  | "mock"
  | "failed";

export type DisburseRoute =
  | { rail: "connect_transfer"; connectAccountId: string | null }
  | {
      rail: "global_payouts";
      financialAccountId: string | null;
      recipientAccountId: string | null;
      payoutMethodId?: string | null;
    };

export type DisbursePartyKind = "talent" | "workspace" | "channel_referral";

export type DisburseInput = {
  party: DisbursePartyKind;
  participantId: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  route: DisburseRoute;
};

export type DisburseOutcome = {
  party: DisbursePartyKind;
  participantId: string;
  amountCents: number;
  currency: string;
  rail: PayoutRail;
  status: DisburseStatus;
  destination?: string | null;
  /** Connect transfer id (tr_…) OR v2 outbound payment id (obp_…). */
  transferId?: string | null;
  detail?: string;
};

export type DisburseDeps = {
  /** Connect rail client; null → "mock" (no STRIPE_SECRET_KEY). */
  stripe?: Stripe | null;
  /** Injectable GP executor (tests). Defaults to the real createOutboundPayment. */
  createOutboundPaymentFn?: typeof defaultCreateOutboundPayment;
  /** Override the "v2 configured" check (tests). */
  isV2Configured?: () => boolean;
  /** Injectable live-payout safety gate (tests). Defaults to the real env-backed guard. */
  assertLivePayoutSafe?: typeof defaultAssertLivePayoutSafe;
};

/** Stable idempotency key for a Connect transfer leg (unchanged from payParty). */
export function connectIdempotencyKey(bookingId: string, participantId: string, party: string): string {
  return `transfer_${bookingId}_${participantId}_${party}`;
}
/** Stable idempotency key for a Global Payouts OutboundPayment leg. */
export function outboundIdempotencyKey(bookingId: string, participantId: string, party: string): string {
  return `op_${bookingId}_${participantId}_${party}`;
}

async function connectTransfer(input: DisburseInput, deps: DisburseDeps): Promise<DisburseOutcome> {
  const { party, participantId, bookingId, amountCents, currency, route } = input;
  const accountId = route.rail === "connect_transfer" ? route.connectAccountId : null;
  const base = { party, participantId, amountCents, currency, rail: "connect_transfer" as const };

  if (!accountId) {
    return {
      ...base,
      status: "skipped_no_account",
      detail: "no enabled connected account — payout pending onboarding (funds held on platform)",
    };
  }
  if (!deps.stripe) return { ...base, status: "mock", destination: accountId };

  // Single master switch: on a LIVE key, refuse to move real money unless
  // STRIPE_ALLOW_LIVE_PAYOUTS=true. Same gate the Global Payouts rail uses, so
  // the flag governs BOTH rails. Blocked legs HOLD on the platform (not failed)
  // and settle on the next run once the flag is flipped.
  const liveGuard = (deps.assertLivePayoutSafe ?? defaultAssertLivePayoutSafe)();
  if (!liveGuard.ok) {
    return { ...base, status: "skipped_live_disabled", destination: accountId, detail: liveGuard.error };
  }

  try {
    const transfer = await deps.stripe.transfers.create(
      {
        amount: amountCents,
        currency,
        destination: accountId,
        transfer_group: `booking_${bookingId}`,
        metadata: { booking_id: bookingId, participant_id: participantId, party },
      },
      { idempotencyKey: connectIdempotencyKey(bookingId, participantId, party) },
    );
    return { ...base, status: "transferred", destination: accountId, transferId: transfer.id };
  } catch (err) {
    logServerError(`disburse.connect[${party}][booking=${bookingId}]`, err);
    return {
      ...base,
      status: "failed",
      destination: accountId,
      detail: err instanceof Error ? err.message : "transfer failed",
    };
  }
}

async function globalPayout(input: DisburseInput, deps: DisburseDeps): Promise<DisburseOutcome> {
  const { party, participantId, bookingId, amountCents, currency, route } = input;
  const base = { party, participantId, amountCents, currency, rail: "global_payouts" as const };
  if (route.rail !== "global_payouts") return { ...base, status: "failed", detail: "wrong route for global_payouts" };

  const { financialAccountId, recipientAccountId, payoutMethodId } = route;
  if (!financialAccountId || !recipientAccountId) {
    return {
      ...base,
      status: "skipped_no_account",
      detail: "Global Payouts not active or recipient not onboarded — funds held on platform",
    };
  }
  const configured = (deps.isV2Configured ?? isStripeV2Configured)();
  if (!configured) return { ...base, status: "mock", destination: recipientAccountId };

  const fn = deps.createOutboundPaymentFn ?? defaultCreateOutboundPayment;
  let r: StripeV2Result<OutboundPayment>;
  try {
    r = await fn({
      financialAccountId,
      recipientAccountId,
      payoutMethodId: payoutMethodId ?? null,
      amountCents,
      currency,
      metadata: { booking_id: bookingId, participant_id: participantId, party },
      idempotencyKey: outboundIdempotencyKey(bookingId, participantId, party),
    });
  } catch (err) {
    logServerError(`disburse.gp[${party}][booking=${bookingId}]`, err);
    return {
      ...base,
      status: "failed",
      destination: recipientAccountId,
      detail: err instanceof Error ? err.message : "outbound payment failed",
    };
  }

  if (r.ok) {
    return { ...base, status: "transferred", destination: recipientAccountId, transferId: r.data.id };
  }
  // Live-payouts kill-switch tripped inside createOutboundPayment: HOLD on the
  // platform (same as the Connect rail), don't record it as a failure.
  if (r.error.code === "live_payouts_disabled") {
    return { ...base, status: "skipped_live_disabled", destination: recipientAccountId, detail: r.error.message };
  }
  logServerError(
    `disburse.gp[${party}][booking=${bookingId}]`,
    new Error(r.error.message ?? "outbound payment failed"),
  );
  return {
    ...base,
    status: "failed",
    destination: recipientAccountId,
    detail: r.error.message ?? "outbound payment failed",
  };
}

/**
 * Route one payout leg via the chosen rail. Zero-amount legs short-circuit.
 * Never throws — failures come back as a "failed" outcome so the caller can
 * record + reconcile.
 */
export async function disburse(input: DisburseInput, deps: DisburseDeps = {}): Promise<DisburseOutcome> {
  const { party, participantId, amountCents, currency, route } = input;
  if (amountCents <= 0) {
    return { party, participantId, amountCents, currency, rail: route.rail, status: "skipped_zero" };
  }
  return route.rail === "global_payouts" ? globalPayout(input, deps) : connectTransfer(input, deps);
}
