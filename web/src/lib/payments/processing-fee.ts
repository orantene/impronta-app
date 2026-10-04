/**
 * lib/payments/processing-fee.ts
 *
 * The ACTUAL payment-processing fee of a settled charge, for the
 * `processing_mode = 'pass_through'` payout step (see lib/billing/commission.ts).
 *
 * The commission snapshot is frozen at quote/conversion time, but Stripe's real
 * fee is known only once the charge settles. transfers.ts therefore reads it
 * from the charge's balance transaction (expand
 * `latest_charge.balance_transaction` on the PaymentIntent) and subtracts it
 * from the seller lane at payout time.
 *
 * Rules:
 *  - fee = balance_transaction.fee_details minus our own `application_fee`
 *    (Stripe fee + tax on it); falls back to `fee` when no detail is present.
 *  - the fee is denominated in the balance transaction's currency. If that
 *    differs from the charge currency, convert with the balance transaction's
 *    `exchange_rate` (bt.amount = charge.amount * rate  =>  fee_charge = fee/rate).
 *  - anything we cannot determine returns { ok: false } — the caller HOLDS the
 *    payout leg. We never guess and never fall back to paying the full amount.
 *
 * Pure parts (extractProcessingFee, apportionFeeCents) are exported for tests.
 */

import type Stripe from "stripe";

export type ProcessingFeeResult =
  | { ok: true; feeCents: number; currency: string; source: "balance_transaction" }
  | { ok: false; reason: string };

function isObj<T>(v: unknown): v is T {
  return typeof v === "object" && v !== null;
}

/** Pure: derive the processing fee (in the CHARGE currency) from an expanded PaymentIntent. */
export function extractProcessingFee(pi: Stripe.PaymentIntent | null | undefined): ProcessingFeeResult {
  if (!pi) return { ok: false, reason: "payment_intent_missing" };
  const charge = pi.latest_charge;
  if (!isObj<Stripe.Charge>(charge)) return { ok: false, reason: "latest_charge_not_expanded" };
  const bt = charge.balance_transaction;
  if (!isObj<Stripe.BalanceTransaction>(bt)) return { ok: false, reason: "balance_transaction_not_available" };

  const btCurrency = String(bt.currency ?? "").toLowerCase();
  const chargeCurrency = String(charge.currency ?? "").toLowerCase();
  if (!btCurrency || !chargeCurrency) return { ok: false, reason: "currency_missing" };

  const details = Array.isArray(bt.fee_details) ? bt.fee_details : [];
  let fee: number;
  if (details.length > 0) {
    fee = details
      .filter((d) => d.type !== "application_fee")
      .reduce((sum, d) => sum + (d.amount ?? 0), 0);
  } else {
    fee = bt.fee ?? 0;
  }
  if (!Number.isFinite(fee) || fee < 0) return { ok: false, reason: "fee_invalid" };

  if (btCurrency === chargeCurrency) {
    return { ok: true, feeCents: Math.round(fee), currency: chargeCurrency, source: "balance_transaction" };
  }
  const rate = bt.exchange_rate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return {
      ok: false,
      reason: `fee_currency_${btCurrency}_differs_from_charge_${chargeCurrency}_no_exchange_rate`,
    };
  }
  return { ok: true, feeCents: Math.round(fee / rate), currency: chargeCurrency, source: "balance_transaction" };
}

/**
 * Pure: split a fee across rows in proportion to `weights` (largest remainder,
 * ties broken by index) so the parts sum EXACTLY to `feeCents`. Deterministic:
 * the same inputs always give the same split, which is what keeps a re-delivered
 * webhook from computing a different payout amount.
 */
export function apportionFeeCents(feeCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const total = weights.reduce((a, b) => a + Math.max(b, 0), 0);
  if (total <= 0) {
    const out = weights.map(() => 0);
    out[0] = feeCents;
    return out;
  }
  const raw = weights.map((w) => (feeCents * Math.max(w, 0)) / total);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = feeCents - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (remainder <= 0) break;
    floors[o.i] += 1;
    remainder -= 1;
  }
  return floors;
}

/** IO: fetch the PaymentIntent with the balance transaction expanded and extract the fee. */
export async function fetchProcessingFee(
  stripe: Pick<Stripe, "paymentIntents">,
  paymentIntentId: string | null,
): Promise<ProcessingFeeResult> {
  if (!paymentIntentId) return { ok: false, reason: "payment_intent_id_unknown" };
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    return extractProcessingFee(pi);
  } catch (err) {
    return { ok: false, reason: `stripe_error: ${err instanceof Error ? err.message : "unknown"}` };
  }
}
