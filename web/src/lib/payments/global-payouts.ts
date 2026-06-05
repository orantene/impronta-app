/**
 * lib/payments/global-payouts.ts
 *
 * Stripe **Global Payouts (v2 Money Movement)** helpers — the alternative
 * money-OUT rail to the existing Connect `transfers.create` path.
 *
 * Model (docs.stripe.com/global-payouts):
 *   FinancialAccount (platform balance, source)  ──OutboundPayment──▶
 *     recipient Account (v2 core account) + PayoutMethod (bank/wire/instant/crypto)
 *
 * This reaches ~50+ countries (incl. MX/AR/CO) and supports USDC payouts —
 * far wider than Connect cross-border (US/UK/EEA/CA/CH only). It's gated on the
 * platform activating Global Payouts (which provisions the FinancialAccount);
 * until then `getPrimaryFinancialAccountId()` returns null and callers fall back
 * to the Connect rail.
 *
 * Built on the fetch-based v2 client so the app's pinned v1 SDK is untouched.
 * Server-only.
 */

import "server-only";
import { stripeV2, isStripeV2Configured, type StripeV2List, type StripeV2Result } from "./stripe-v2";
import { logServerError } from "@/lib/server/safe-error";

export type GlobalPayoutsFinancialAccount = {
  id: string;
  object: string;
};

/** Lifecycle states a v2 OutboundPayment moves through. */
export type OutboundPaymentStatus =
  | "processing"
  | "posted"
  | "failed"
  | "returned"
  | "canceled"
  | (string & {});

export type OutboundPayment = {
  id: string;
  object: string;
  status: OutboundPaymentStatus;
  amount: { value: number; currency: string };
  to?: { recipient?: string; payout_method?: string } | null;
  from?: { financial_account?: string; currency?: string } | null;
  metadata?: Record<string, string> | null;
  livemode?: boolean;
};

// Short per-invocation cache so a fan-out of N talent legs doesn't re-list the
// FinancialAccount N times. (Date.now is fine in app/runtime code.)
let _faCache: { id: string | null; at: number } | null = null;
const FA_CACHE_TTL_MS = 60_000;

/**
 * The primary FinancialAccount id — the SOURCE of every OutboundPayment.
 * Returns null when Global Payouts isn't activated yet (no FA provisioned),
 * which is the signal for callers to fall back to the Connect rail.
 */
export async function getPrimaryFinancialAccountId(opts?: { force?: boolean }): Promise<string | null> {
  if (!opts?.force && _faCache && Date.now() - _faCache.at < FA_CACHE_TTL_MS) {
    return _faCache.id;
  }
  const r = await stripeV2.get<StripeV2List<GlobalPayoutsFinancialAccount>>(
    "/v2/money_management/financial_accounts",
  );
  if (!r.ok) {
    logServerError("global-payouts.getPrimaryFinancialAccountId", new Error(r.error.message ?? "v2 list failed"));
    return null;
  }
  const id = r.data.data?.[0]?.id ?? null;
  _faCache = { id, at: Date.now() };
  return id;
}

/** Reset the FA cache (tests / after activation). */
export function _resetFinancialAccountCache(): void {
  _faCache = null;
}

/**
 * Whether the Global Payouts rail is live on this account right now:
 * Stripe configured + a FinancialAccount exists. Cheap-ish (cached).
 */
export async function isGlobalPayoutsActive(): Promise<boolean> {
  if (!isStripeV2Configured()) return false;
  return (await getPrimaryFinancialAccountId()) != null;
}

/** True when the active secret key is a LIVE key (sk_live_…). */
export function isLiveStripeKey(key = process.env.STRIPE_SECRET_KEY): boolean {
  return !!key && key.startsWith("sk_live_");
}

/**
 * Safety gate for real-money moves. On a LIVE key, money-moving calls
 * (OutboundPayment, fund-from-balance) are REFUSED unless
 * STRIPE_ALLOW_LIVE_PAYOUTS=true. This lets us point the app at the live account
 * for read/verify (is GP active? which recipients?) with ZERO risk of moving
 * funds; flip the flag only at prod go-live (or for one deliberate live payout).
 */
export function assertLivePayoutSafe(
  key = process.env.STRIPE_SECRET_KEY,
): { ok: true } | { ok: false; error: string } {
  if (isLiveStripeKey(key) && process.env.STRIPE_ALLOW_LIVE_PAYOUTS !== "true") {
    return { ok: false, error: "Live payouts disabled — set STRIPE_ALLOW_LIVE_PAYOUTS=true to move real money." };
  }
  return { ok: true };
}

/**
 * Safety gate for live RECIPIENT writes — creating a Global Payouts recipient
 * (v2 core account) or attaching a bank payout method. On a LIVE key these create
 * real, durable Stripe records (and, for Mexico, a real CLABE), so they're REFUSED
 * unless STRIPE_ALLOW_LIVE_PAYOUTS=true. Same condition as {@link assertLivePayoutSafe}
 * (the env's single master switch), so production onboarding — where the flag is
 * on — is unaffected, while a dev/QA box pointed at live keys can't silently
 * pollute live Stripe with throwaway recipients/banks. Reads (status/list) stay
 * open so we can still verify against live with zero writes.
 */
export function assertLiveRecipientWriteSafe(
  key = process.env.STRIPE_SECRET_KEY,
): { ok: true } | { ok: false; error: string } {
  if (isLiveStripeKey(key) && process.env.STRIPE_ALLOW_LIVE_PAYOUTS !== "true") {
    return {
      ok: false,
      error: "Live payout setup disabled — set STRIPE_ALLOW_LIVE_PAYOUTS=true to create a live payout recipient.",
    };
  }
  return { ok: true };
}

/**
 * Create a v2 OutboundPayment from the platform FinancialAccount to a recipient.
 * `payoutMethodId` is optional — omit to use the recipient's default method.
 * Idempotent via `idempotencyKey` (mirror the Connect rail's per-leg key).
 * Blocked on a LIVE key unless STRIPE_ALLOW_LIVE_PAYOUTS=true (see assertLivePayoutSafe).
 */
export async function createOutboundPayment(opts: {
  financialAccountId: string;
  recipientAccountId: string;
  payoutMethodId?: string | null;
  amountCents: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<StripeV2Result<OutboundPayment>> {
  const guard = assertLivePayoutSafe();
  if (!guard.ok) {
    return { ok: false, status: 0, error: { code: "live_payouts_disabled", message: guard.error } };
  }
  const currency = opts.currency.toLowerCase();
  const body: Record<string, unknown> = {
    from: { financial_account: opts.financialAccountId, currency },
    to: {
      recipient: opts.recipientAccountId,
      ...(opts.payoutMethodId ? { payout_method: opts.payoutMethodId } : {}),
    },
    amount: { value: opts.amountCents, currency },
  };
  if (opts.description) body.description = opts.description;
  if (opts.metadata) body.metadata = opts.metadata;

  return stripeV2.post<OutboundPayment>("/v2/money_management/outbound_payments", body, {
    idempotencyKey: opts.idempotencyKey,
  });
}

/** Retrieve a v2 OutboundPayment (for status polling / webhook reconciliation). */
export async function getOutboundPayment(id: string): Promise<StripeV2Result<OutboundPayment>> {
  return stripeV2.get<OutboundPayment>(`/v2/money_management/outbound_payments/${id}`);
}

/** Map an OutboundPayment status to the booking_payouts ledger status. */
export function outboundPaymentLedgerStatus(
  status: OutboundPaymentStatus,
): "transferred" | "failed" | "held" {
  if (status === "posted" || status === "processing") return "transferred";
  if (status === "failed" || status === "returned" || status === "canceled") return "failed";
  return "held";
}
