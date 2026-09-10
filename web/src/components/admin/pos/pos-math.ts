/**
 * pos-math.ts — the Counter's own pure arithmetic.
 *
 * Basket subtotal/discount/tax/total reuses `cartTotals` from
 * `lib/cart/totals.ts` directly: that module is the ONE place order money
 * arithmetic happens (see its own header), it has no `server-only` tag and no
 * data fetching of its own, and re-deriving the same sums here would be a
 * second source of truth for exactly the thing that file exists to prevent.
 *
 * Change-due is Counter-specific (the engine only ever returns it inside
 * `StartCollectionResult`, never as a standalone helper), so it is a plain
 * function here — no lib/pos import, no server dependency.
 */

import { cartTotals, type CartLineInput, type CartTotals } from "@/lib/cart/totals";
import type { PosBasketLine, PosBasketTotals } from "./pos-types";

function toCartLine(line: PosBasketLine): CartLineInput {
  return {
    unitCents: line.unitCents,
    units: line.units,
    addonCents: line.addonCents ?? 0,
  };
}

/** Basket totals for a set of lines and an already-resolved discount. */
export function basketTotals(
  lines: readonly PosBasketLine[],
  discountCents = 0,
): PosBasketTotals {
  const totals: CartTotals = cartTotals(lines.map(toCartLine), discountCents);
  return totals;
}

/** Cash change: tendered minus the amount being collected, never negative. */
export function changeDueCents(tenderedCents: number, amountCents: number): number {
  if (!Number.isFinite(tenderedCents) || !Number.isFinite(amountCents)) return 0;
  return Math.max(0, Math.trunc(tenderedCents) - Math.trunc(amountCents));
}

/** Cash tendered is short of what this collection needs. */
export function tenderIsShort(tenderedCents: number, amountCents: number): boolean {
  if (!Number.isFinite(tenderedCents) || !Number.isFinite(amountCents)) return true;
  return Math.trunc(tenderedCents) < Math.trunc(amountCents);
}
