/**
 * Turning a cart's capacity needs into reservation requests.
 *
 * ONE ALLOCATION PER UNIT, not one allocation of N.
 *
 * Capacity's ruling, and the reason is idempotency rather than tidiness. A
 * partial refund needs to free SOME of a line's seats, and the only primitive is
 * `release_capacity(uuid[])` — by identity. Capacity refused a
 * `release_capacity_units(alloc, n)` decrement precisely because a retried
 * webhook or a double-clicked refund calls it twice and frees seats still in
 * someone's pocket. Release by identity is idempotent: `released_at` makes the
 * second call a no-op, and a decrement never can. It is the
 * `release_offering_stock` shape they dropped in #1661.
 *
 * `reserve_capacity_batch` loops `jsonb_array_elements` and calls
 * `_capacity_reserve_locked` once per element, so N single-unit requests produce
 * N DISTINCT allocations with no coalescing — verified in the function source,
 * and Events proved it against production: 3 requests for 3 seats gave 3 ids,
 * and 4 against 3 refused atomically with zero rows written.
 *
 * CONSEQUENCE, stated because it is a real cost: a 50-unit line holds 50
 * allocation rows rather than 1. That is the engine's own invariant — remaining
 * is DERIVED FROM ROWS, not from a counter — so the rows are the model working
 * rather than overhead, but the count is visible.
 *
 * APPLIED TO EVERY CAPACITY LINE, not only session-backed ones. The ruling
 * arrived scoped to sessions; widened here because the argument is about the
 * release primitive, which is identical for a product, and two reserve shapes in
 * one pipeline is the divergence this phase spent a night removing. Capacity and
 * Events are both told; either can narrow it.
 */

export type CapacityNeed = {
  offeringId: string;
  poolId: string;
  startsAt?: string | null;
  endsAt?: string | null;
  units?: number;
};

export type CapacityRequest = {
  poolId: string;
  startsAt: string | null;
  endsAt: string | null;
  units: 1;
  orderLineId: string | null;
};

/**
 * Ceiling on allocations one order may reserve.
 *
 * With one allocation per unit, a mistyped quantity becomes an array of that
 * many objects before the engine can refuse it. 500 is far above any real cart
 * and far below anything that would hurt.
 */
export const MAX_ALLOCATIONS_PER_ORDER = 500;

export type BuildRequestsResult =
  | { ok: true; requests: CapacityRequest[] }
  | { ok: false; reason: "too_many_allocations"; count: number };

export function buildPerUnitRequests(
  needs: readonly CapacityNeed[],
  lineIdByOffering: ReadonlyMap<string, string>,
): BuildRequestsResult {
  const requests: CapacityRequest[] = [];
  for (const need of needs) {
    // Floor and clamp: a fractional or zero `units` still reserves one seat
    // rather than none. Reserving nothing for a line that was sold is the
    // oversell this path exists to prevent.
    const units = Math.max(1, Math.floor(need.units ?? 1));
    for (let i = 0; i < units; i += 1) {
      requests.push({
        poolId: need.poolId,
        startsAt: need.startsAt ?? null,
        endsAt: need.endsAt ?? null,
        units: 1,
        orderLineId: lineIdByOffering.get(need.offeringId) ?? null,
      });
      // Bound checked INSIDE the loop, so a single absurd `units` cannot build
      // a huge array before anything looks at its length.
      if (requests.length > MAX_ALLOCATIONS_PER_ORDER) {
        return { ok: false, reason: "too_many_allocations", count: requests.length };
      }
    }
  }
  return { ok: true, requests };
}
