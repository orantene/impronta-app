/**
 * promo.ts — applying a tenant promo code to an order subtotal.
 *
 * Pure: no Supabase import, so it gates in CI.
 *
 * INTEGER CENTS THROUGHOUT. No floats touch money here. A percentage is applied
 * with integer arithmetic and floored, which is stated rather than incidental:
 * see `discountFor`.
 *
 * EVERY REFUSAL IS NAMED. A promo code that "does not apply" is a sentence a
 * customer reads at checkout, and "invalid code" for an expired early-bird is
 * both untrue and unhelpful -- they typed it correctly, it ended on Sunday.
 * A boolean here becomes a support conversation.
 */

export type PromoKind = "percent" | "fixed";

export type PromoCode = {
  id: string;
  code: string;
  kind: PromoKind;
  /** A percentage 1..100 when `percent`; integer cents when `fixed`. */
  value: number;
  currency?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  perCustomerLimit: number;
  /** NULL scope = the whole workspace. */
  eventId?: string | null;
  variantId?: string | null;
};

/** What the caller has counted, from rows, before asking. */
export type RedemptionCounts = {
  total: number;
  forThisCustomer: number;
};

export type PromoContext = {
  now: string | Date;
  subtotalCents: number;
  /** The event this order is for, if any. */
  eventId?: string | null;
  /** Every variant on the order, for a variant-scoped code. */
  variantIds?: readonly string[];
  counts: RedemptionCounts;
};

export type PromoResult =
  | { ok: true; discountCents: number; clamped: boolean }
  | { ok: false; reason: "inactive" }
  | { ok: false; reason: "not_started"; startsAt: string }
  | { ok: false; reason: "expired"; endsAt: string }
  | { ok: false; reason: "exhausted" }
  | { ok: false; reason: "customer_limit_reached"; limit: number }
  | { ok: false; reason: "wrong_event" }
  | { ok: false; reason: "wrong_tier" }
  | { ok: false; reason: "nothing_to_discount" }
  | { ok: false; reason: "bad_input" };

/**
 * The discount a code is worth against a subtotal, in cents.
 *
 * FLOORED, not rounded. A 10% code on a $30.05 ticket is 300 cents rather than
 * 301: the discount never exceeds the percentage the venue advertised, and
 * rounding up hands out a cent that nobody agreed to. It is one cent either way
 * and the point is that it is DECIDED rather than inherited from whichever
 * rounding the language happens to do.
 */
export function discountFor(code: PromoCode, subtotalCents: number): number {
  if (code.kind === "percent") {
    return Math.floor((subtotalCents * code.value) / 100);
  }
  return code.value;
}

/**
 * Whether this code applies to this order, and for how much.
 *
 * THE CLAMP IS NOT COSMETIC. `orders` carries
 * `CHECK (total_cents = subtotal_cents - discount_cents + tax_cents)` and
 * `CHECK (total_cents >= 0)`. A $5-off code on a $3 ticket produces a discount
 * of 500 against a subtotal of 300, and writing that violates the constraint --
 * the insert fails and the buyer sees a checkout error rather than a free
 * ticket. So the discount is clamped to the subtotal and `clamped` is returned,
 * because the caller may want to say "this code covers the whole order" rather
 * than showing a $5 discount on a $3 line.
 */
export function applyPromo(code: PromoCode, ctx: PromoContext): PromoResult {
  const t = ctx.now instanceof Date ? ctx.now.getTime() : Date.parse(ctx.now);
  if (!Number.isFinite(t)) return { ok: false, reason: "bad_input" };
  if (!Number.isInteger(ctx.subtotalCents) || ctx.subtotalCents < 0) {
    return { ok: false, reason: "bad_input" };
  }
  if (!Number.isInteger(code.value) || code.value <= 0) return { ok: false, reason: "bad_input" };
  if (code.kind === "percent" && code.value > 100) return { ok: false, reason: "bad_input" };

  if (!code.isActive) return { ok: false, reason: "inactive" };

  // Window first, because "it starts on Friday" and "it ended on Sunday" are
  // the two things a customer most often needs told, and both are true of a
  // code that is otherwise perfect.
  if (code.startsAt) {
    const from = Date.parse(code.startsAt);
    if (Number.isFinite(from) && t < from) {
      return { ok: false, reason: "not_started", startsAt: code.startsAt };
    }
  }
  if (code.endsAt) {
    const until = Date.parse(code.endsAt);
    if (Number.isFinite(until) && t >= until) {
      return { ok: false, reason: "expired", endsAt: code.endsAt };
    }
  }

  // Counts come from ROWS the caller has already counted. This module never
  // reads a stored counter, because a stored counter is the thing that drifts.
  if (code.maxRedemptions != null && ctx.counts.total >= code.maxRedemptions) {
    return { ok: false, reason: "exhausted" };
  }
  if (ctx.counts.forThisCustomer >= code.perCustomerLimit) {
    return { ok: false, reason: "customer_limit_reached", limit: code.perCustomerLimit };
  }

  // Scope narrows: a workspace code applies anywhere, an event code only to its
  // event, a tier code only when that tier is actually on the order.
  if (code.eventId && code.eventId !== ctx.eventId) return { ok: false, reason: "wrong_event" };
  if (code.variantId && !(ctx.variantIds ?? []).includes(code.variantId)) {
    return { ok: false, reason: "wrong_tier" };
  }

  // A free order has nothing to discount. Returning 0 would let a comp code burn
  // one of its twenty redemptions on an order it did not change.
  if (ctx.subtotalCents === 0) return { ok: false, reason: "nothing_to_discount" };

  const raw = discountFor(code, ctx.subtotalCents);
  const discountCents = Math.min(raw, ctx.subtotalCents);
  return { ok: true, discountCents, clamped: discountCents < raw };
}
