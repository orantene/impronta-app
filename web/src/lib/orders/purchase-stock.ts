/**
 * Offering stock on every sales path (TUL-1268 item 4, D5).
 *
 * THE GAP THIS CLOSES. `createPurchase` reserved capacity only for the pools a
 * caller DECLARED. Instant book, tickets, class seats, reservations and the POS
 * desk declare theirs; the menu (`submitMenuOrder`) and the storefront cart
 * (`cart-checkout.core.ts`) declare none, so a stock-limited item sold on those
 * paths never touched its pool and could be sold past zero while the page still
 * read the `inventory_qty` mirror.
 *
 * THE RULE. A line whose offering has a stock pool
 * (`talent_offerings.capacity_pool_id`, NULL = unlimited) holds that pool,
 * unless the caller already declared capacity for that offering. The hold goes
 * through the existing reserve (`reserve_resource_set_v2` ->
 * `reserve_capacity_batch` -> `_capacity_reserve_locked`, a check-and-take under
 * the pool's row lock), so two buyers racing for the last unit get one yes and
 * one `sold_out`. Release is the existing ledger: the pipeline's unwind on a
 * failure, the reaper on a lapsed card hold, `cancel_booking_set` on a cancel.
 *
 * "Already declared" is keyed by OFFERING, not by pool, on purpose: a session
 * line declares its seat tier pool and an instant booking declares the stock
 * pool plus a room. Adding the stock pool again would double-count units the
 * caller already took, which is a different oversell (refusing real buyers).
 *
 * Pure. No I/O.
 */
import type { CapacityNeed } from "@/lib/orders/capacity-requests";

export function withOfferingStockNeeds(
  declared: readonly CapacityNeed[],
  lines: ReadonlyArray<{ offeringId: string; units: number }>,
  stockPools: ReadonlyMap<string, string | null> | undefined,
): CapacityNeed[] {
  const needs = [...declared];
  if (!stockPools || stockPools.size === 0) return needs;
  const covered = new Set(declared.map((n) => n.offeringId));
  // One leg per LINE, not summed: `buildCapacityRequests` must still see each
  // line's own units so a part quantity is refused rather than added up into a
  // whole one. Two legs on one pool are fine; the batch takes them atomically.
  for (const line of lines) {
    if (covered.has(line.offeringId)) continue;
    const poolId = stockPools.get(line.offeringId);
    if (!poolId) continue;
    needs.push({ offeringId: line.offeringId, poolId, units: line.units, perUnitDomainRow: false });
  }
  return needs;
}

/**
 * Should a pay-in-person order keep its stock until the visit?
 *
 * A held unit lapses with the pool TTL (15 minutes) and `decideOrderExpiry`
 * then cancels the order. That is right for a card checkout (an abandoned
 * Checkout frees the unit) and wrong for "pay when you pick it up": the menu
 * order would vanish a quarter of an hour after it was placed. So when the
 * buyer pays in person and EVERY leg is offering stock this module added (no
 * caller-declared pools, no seat session, no calendar slot), the units are
 * committed at creation and released only by a cancel. Caller-declared pools
 * (tables, door holds, instant book) keep exactly the behaviour they had.
 */
export function keepsStockUntilVisit(input: {
  payInPerson: boolean;
  declared: readonly CapacityNeed[];
  needs: readonly CapacityNeed[];
  slotHolds: number;
  lines: ReadonlyArray<{ sessionId?: string | null }>;
}): boolean {
  return (
    input.payInPerson
    && input.declared.length === 0
    && input.needs.length > 0
    && input.slotHolds === 0
    && input.lines.every((l) => !l.sessionId)
  );
}
