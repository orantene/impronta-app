/**
 * Talent payout "attention" payload — the shapes + pure helpers behind the
 * talent-facing view of payout legs that did NOT land.
 *
 * Client-safe on purpose (no `server-only`, no Supabase import): the payouts UI
 * imports these types and helpers directly, while the loader that fills them in
 * lives in `talent-payout-attention.ts` (service-role read).
 *
 * A talent used to be told "A payout was reversed" by a notification and then
 * land on a payouts page that never mentioned it — reversed legs reached no
 * talent surface at all, and held legs only reached one banner that hid itself
 * as soon as the Connect account was enabled (i.e. in exactly the state a
 * reversal happens). These types back the honest replacement.
 */

/** The non-transferred ledger states a talent has a right to see. */
export type PayoutAttentionState = "held" | "failed" | "reversed";

/**
 * Why a leg was reversed, derived from the ledger's operator note.
 *
 * `booking_payouts` has NO reason column. What it has is `last_error`, which the
 * reversal path fills with the caller's `reference` — `refund <chargeId>`,
 * `dispute_lost <disputeId>`, `partial_refund <id>`, optionally suffixed
 * `(cancelled before transfer)`. Those strings carry Stripe ids and raw API
 * errors, so they are never shown to a talent; this coarse cause is what we
 * derive from them instead.
 */
export type PayoutReversalCause = "refund" | "dispute" | "cancelled_before_transfer" | "unknown";

export type TalentPayoutAttentionLeg = {
  id: string;
  bookingId: string;
  state: PayoutAttentionState;
  /** Minor units, exactly as stored in `booking_payouts.amount_cents`. */
  amountCents: number;
  /**
   * The leg's OWN settled currency (`booking_payouts.currency`), upper-cased.
   * This is a per-transaction fact, not anyone's configured default currency —
   * blank/missing falls back to USD (the platform's operating currency).
   */
  currency: string;
  /** Booking title — the reference a talent recognises. Null if the booking is gone. */
  bookingTitle: string | null;
  /** Booking event date (YYYY-MM-DD) when the booking carries one. */
  eventDate: string | null;
  /** When the leg entered this state (`updated_at`, else `created_at`). */
  atIso: string;
  /** Derived cause — meaningful for `reversed`, `"unknown"` elsewhere. */
  cause: PayoutReversalCause;
};

export type TalentPayoutAttentionTotal = {
  state: PayoutAttentionState;
  currency: string;
  amountCents: number;
  count: number;
};

export type TalentPayoutAttention = {
  legs: TalentPayoutAttentionLeg[];
  totals: TalentPayoutAttentionTotal[];
};

export const EMPTY_TALENT_PAYOUT_ATTENTION: TalentPayoutAttention = { legs: [], totals: [] };

/** Ledger statuses this payload covers, in the order the UI shows them. */
export const PAYOUT_ATTENTION_STATES: PayoutAttentionState[] = ["reversed", "failed", "held"];

/** Normalize a ledger currency to a display code. Never reads a default_currency column. */
export function payoutLegCurrency(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toUpperCase();
  return code.length === 3 ? code : "USD";
}

/**
 * Coarse, talent-safe cause from the ledger's operator note. Prefix-matched on
 * the `reference` the reversal path writes; anything unrecognised is "unknown"
 * so we describe the leg honestly instead of guessing.
 */
export function payoutReversalCause(note: string | null | undefined): PayoutReversalCause {
  const text = (note ?? "").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("cancelled before transfer")) return "cancelled_before_transfer";
  if (text.startsWith("dispute")) return "dispute";
  if (text.startsWith("refund") || text.startsWith("partial_refund")) return "refund";
  return "unknown";
}

/**
 * Per (state, currency) totals for a set of legs. Grouped by the leg's own
 * currency so a legacy EUR leg is never summed into a USD figure — mixing them
 * would misstate money on a page whose whole point is honesty.
 */
export function summarizePayoutAttention(
  legs: TalentPayoutAttentionLeg[],
): TalentPayoutAttentionTotal[] {
  const byKey = new Map<string, TalentPayoutAttentionTotal>();
  for (const leg of legs) {
    const key = `${leg.state}:${leg.currency}`;
    const acc = byKey.get(key) ?? { state: leg.state, currency: leg.currency, amountCents: 0, count: 0 };
    acc.amountCents += leg.amountCents;
    acc.count += 1;
    byKey.set(key, acc);
  }
  const order = new Map(PAYOUT_ATTENTION_STATES.map((s, i) => [s, i]));
  return [...byKey.values()].sort(
    (a, b) => (order.get(a.state) ?? 9) - (order.get(b.state) ?? 9) || a.currency.localeCompare(b.currency),
  );
}
