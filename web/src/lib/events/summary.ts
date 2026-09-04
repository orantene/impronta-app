/**
 * summary.ts — the numbers every Events screen shows, computed in one place.
 *
 * Pure: no Supabase import, so it gates in CI.
 *
 * `TicketsTab` shows "88 of 300" and "14 held in checkouts right now".
 * `SalesTab` shows gross, orders and a per-tier split. The door shows scanned
 * versus still-to-come. Those are four screens reading the same three facts, and
 * the failure mode if each computes its own is that they disagree in front of a
 * venue owner on the night — which is worse than any of them being wrong alone,
 * because it destroys trust in all four.
 *
 * WHAT THIS MODULE REFUSES TO DO: infer. Every input is passed in. There is no
 * "if the pool is missing, assume unlimited" and no "if nothing is held, assume
 * zero" — an absent pool and a pool of zero are different facts and the caller
 * has to say which it has.
 */

/** A tier's capacity, as the pool reports it for ONE session. */
export type TierPoolState = {
  poolKey: string;
  /** Null means UNCAPPED — no pool exists, so nothing can refuse. */
  unitsTotal: number | null;
  /** Committed: sold and settled. */
  unitsCommitted: number;
  /** Held: in someone's checkout, TTL running. Not sold, not available. */
  unitsHeld: number;
};

export type TierSummary = {
  poolKey: string;
  label: string;
  amountCents: number;
  sold: number;
  held: number;
  /** Null when uncapped. */
  capacity: number | null;
  /** Null when uncapped: "remaining" is not a number if there is no ceiling. */
  remaining: number | null;
  soldOut: boolean;
  grossCents: number;
};

/**
 * One tier's line on the tickets table.
 *
 * REMAINING SUBTRACTS HELD AS WELL AS SOLD. A seat in someone's ten-minute
 * checkout is not available, and showing it as available is how two people buy
 * the last ticket and one of them finds out at the door. The capacity engine
 * already refuses the second sale; this is about not advertising it in the first
 * place.
 *
 * SOLD OUT IS `remaining <= 0`, NOT `sold >= capacity`. With holds outstanding
 * those differ, and the second one keeps a page saying "2 left" while every one
 * of those two is inside a live checkout.
 */
export function summariseTier(
  tier: { poolKey: string; label: string; amountCents: number },
  pool: TierPoolState | null,
): TierSummary {
  // No pool at all is UNCAPPED, not "zero left". `set_offering_stock(NULL)`
  // deactivates the pool and clears the reference, so an uncapped tier genuinely
  // has nothing to point at — and treating that as sold out would silently stop
  // a free RSVP event from taking anyone.
  if (!pool) {
    return {
      poolKey: tier.poolKey,
      label: tier.label,
      amountCents: tier.amountCents,
      sold: 0,
      held: 0,
      capacity: null,
      remaining: null,
      soldOut: false,
      grossCents: 0,
    };
  }

  const sold = Math.max(0, pool.unitsCommitted);
  const held = Math.max(0, pool.unitsHeld);
  const capacity = pool.unitsTotal;
  const remaining = capacity === null ? null : Math.max(0, capacity - sold - held);

  return {
    poolKey: tier.poolKey,
    label: tier.label,
    amountCents: tier.amountCents,
    sold,
    held,
    capacity,
    remaining,
    soldOut: capacity !== null && remaining !== null && remaining <= 0,
    grossCents: sold * tier.amountCents,
  };
}

export type EventSummary = {
  tiers: TierSummary[];
  totalSold: number;
  totalHeld: number;
  /** Null when ANY tier is uncapped: a total with an infinity in it is not a number. */
  totalCapacity: number | null;
  totalRemaining: number | null;
  grossCents: number;
  soldOut: boolean;
};

/**
 * The whole event's line.
 *
 * `totalCapacity` is NULL when any tier is uncapped rather than summing the
 * capped ones. A "300 capacity" that silently omits the unlimited RSVP tier is a
 * number a venue would plan a night around, and it would be wrong in the
 * direction that matters — it under-reports how many people are coming.
 *
 * `soldOut` for the event is every SELLABLE tier being sold out. An event whose
 * only remaining tier is uncapped is never sold out.
 */
export function summariseEvent(
  tiers: ReadonlyArray<{ poolKey: string; label: string; amountCents: number }>,
  pools: ReadonlyMap<string, TierPoolState>,
): EventSummary {
  const rows = tiers.map((t) => summariseTier(t, pools.get(t.poolKey) ?? null));

  const anyUncapped = rows.some((r) => r.capacity === null);
  const totalSold = rows.reduce((n, r) => n + r.sold, 0);
  const totalHeld = rows.reduce((n, r) => n + r.held, 0);

  return {
    tiers: rows,
    totalSold,
    totalHeld,
    totalCapacity: anyUncapped ? null : rows.reduce((n, r) => n + (r.capacity ?? 0), 0),
    totalRemaining: anyUncapped ? null : rows.reduce((n, r) => n + (r.remaining ?? 0), 0),
    grossCents: rows.reduce((n, r) => n + r.grossCents, 0),
    // An empty event is not sold out; it has nothing to sell.
    soldOut: rows.length > 0 && rows.every((r) => r.soldOut),
  };
}

export type DoorCounts = {
  expected: number;
  arrived: number;
  stillToCome: number;
  noShows: number;
};

/**
 * The door's three numbers, from admissions rather than from pools.
 *
 * DELIBERATELY NOT DERIVED FROM THE POOL. Capacity says how many were sold;
 * admissions say how many people those sales admit, and they are different once
 * one admission admits a party — a VIP table for six is ONE unit of capacity and
 * SIX people through the door. A door reading the pool would tell a venue to
 * expect 88 when 118 are coming.
 *
 * A no-show is a positive call by a human (`noShowAt`), never inferred from a
 * zero count: not-yet-arrived and did-not-come are different facts, and at 21:30
 * on a Saturday almost every row is the first one.
 */
export function doorCounts(
  admissions: ReadonlyArray<{
    partySize: number;
    admittedCount: number;
    status: "valid" | "void" | "refunded";
    noShowAt?: string | null;
  }>,
): DoorCounts {
  let expected = 0;
  let arrived = 0;
  let noShows = 0;

  for (const a of admissions) {
    // A voided or refunded ticket is not expected at the door. Someone who
    // already came through and was refunded afterwards still counts as arrived:
    // they were in the room, and the end-of-night headcount is a fact about the
    // room rather than about the money.
    arrived += Math.max(0, a.admittedCount);
    if (a.status !== "valid") continue;
    if (a.noShowAt) {
      noShows += Math.max(0, a.partySize - a.admittedCount);
      continue;
    }
    expected += Math.max(0, a.partySize);
  }

  return {
    expected,
    arrived,
    stillToCome: Math.max(0, expected - arrived),
    noShows,
  };
}
