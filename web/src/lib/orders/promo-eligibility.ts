/**
 * Which lines a promo code covers, and how its discount divides across them.
 *
 * `applyPromo` (lib/events/promo.ts) is correct and pure, and it takes ONE
 * `subtotalCents`. Its scope checks ask whether the scoped event/tier is
 * PRESENT on the order — which is the right question for "does this code
 * apply at all" and the wrong number to then discount.
 *
 * Passing the whole-order subtotal to a tier-scoped code takes the discount off
 * everything: a "50% off VIP" code on an order of one VIP and four GA tickets
 * would halve the GA tickets too. So the caller computes the ELIGIBLE subtotal
 * here and passes that instead.
 *
 * THE RULING on where truth lives, since the same fact can sit in two places:
 * `orders.discount_cents` is the order-level total and IS the truth — it is
 * what the CHECK constraint balances (`total = subtotal - discount + tax`) and
 * what the customer was charged. Per-line eligibility is an INPUT to it, never
 * a second copy. `order_lines` has no discount column and this does not add
 * one; a line's share is DERIVED on demand by `apportionDiscount` so the two
 * can never disagree.
 */

export type PromoScope = {
  /** NULL scope = the whole workspace. */
  eventId?: string | null;
  variantId?: string | null;
};

export type EligibleLine = {
  id: string;
  totalCents: number;
  eventId?: string | null;
  variantId?: string | null;
};

/** The lines a code's scope actually covers. */
export function eligibleLines<T extends EligibleLine>(
  lines: readonly T[],
  scope: PromoScope,
): T[] {
  // Scopes COMPOSE; they do not override one another. The database enforces
  // `promo_variant_needs_event` (a variant_id requires an event_id), so a tier
  // code always carries an event too — and filtering on the tier ALONE would
  // let a "VIP at Friday's show" code discount the VIP tier at every other
  // show. My first version did exactly that and a test caught it.
  let out = [...lines];
  if (scope.eventId) out = out.filter((l) => l.eventId === scope.eventId);
  if (scope.variantId) out = out.filter((l) => l.variantId === scope.variantId);
  return out;
}

export function eligibleSubtotalCents(
  lines: readonly EligibleLine[],
  scope: PromoScope,
): number {
  return eligibleLines(lines, scope).reduce((sum, l) => sum + Math.max(0, l.totalCents), 0);
}

export type LineShare = { id: string; shareCents: number };

/**
 * A line's share of an order-level discount, for refund-by-line.
 *
 * LARGEST REMAINDER, so the shares sum to EXACTLY the discount. Rounding each
 * line independently loses or invents cents: three lines splitting 100 cents
 * round to 33+33+33 = 99, and the missing cent surfaces as a refund total that
 * does not reconcile with what was charged.
 *
 * Shares are computed over the ELIGIBLE lines only. A GA line on an order that
 * used a VIP-scoped code gets zero, because it was never discounted, and
 * refunding it must return the full amount that line was actually charged.
 */
export function apportionDiscount(
  lines: readonly EligibleLine[],
  scope: PromoScope,
  discountCents: number,
): LineShare[] {
  const all = [...lines];
  const eligible = eligibleLines(all, scope);
  const base = eligible.reduce((s, l) => s + Math.max(0, l.totalCents), 0);

  const zero = (l: EligibleLine): LineShare => ({ id: l.id, shareCents: 0 });
  if (discountCents <= 0 || base <= 0) return all.map(zero);

  // Never apportion more than there was to discount. A discount exceeding the
  // eligible subtotal is a caller bug, and clamping keeps the shares summing to
  // something a refund can actually return.
  const total = Math.min(discountCents, base);

  const exact = eligible.map((l) => ({
    id: l.id,
    ideal: (Math.max(0, l.totalCents) * total) / base,
  }));
  const floors = exact.map((e) => ({ id: e.id, share: Math.floor(e.ideal), rem: e.ideal - Math.floor(e.ideal) }));
  let left = total - floors.reduce((s, f) => s + f.share, 0);

  // Ties broken by line order, not by chance: the same order must apportion the
  // same way every time it is asked, or two refunds of the same line disagree.
  const byRemainder = [...floors].sort((a, b) => (b.rem - a.rem) || (a.id < b.id ? -1 : 1));
  for (const f of byRemainder) {
    if (left <= 0) break;
    f.share += 1;
    left -= 1;
  }

  const shares = new Map(floors.map((f) => [f.id, f.share]));
  return all.map((l) => ({ id: l.id, shareCents: shares.get(l.id) ?? 0 }));
}
