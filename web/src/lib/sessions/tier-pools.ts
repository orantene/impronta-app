/**
 * tier-pools.ts — building a capacity request for a session, correctly.
 *
 * This exists so the windowing rule cannot be forgotten rather than merely
 * documented. A comment saying "always pass the session window" is obeyed until
 * the first person in a hurry; a function that cannot construct a request
 * without one is obeyed always.
 *
 * THE RULE. Every allocation against a session tier pool MUST carry the
 * session's time window, even though the pool is already per-session and a
 * timeless allocation therefore looks sufficient.
 *
 * It IS sufficient — right up until the tier pool gains an ancestor that is
 * shared across time. The moment a tier pool hangs under a room pool, which is
 * what Spaces ships next, a timeless allocation charges that room FOREVER: a
 * Tuesday class blocks Saturday's event in the same room, forever, and the
 * symptom appears months later in a different feature and looks like Spaces'
 * bug. Windowing costs nothing when the pool is parentless, so it is
 * unconditional.
 *
 * Pure: no Supabase import, so it gates in CI.
 */

import type { ReserveRequest } from "@/lib/capacity";

/** The minimum of a session this module needs. */
export type SessionWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
};

/** A tier within a session: the pool_key, never a row in a table of its own. */
export const DEFAULT_TIER_KEY = "default";

/**
 * The reserve request for `units` of one tier of one session.
 *
 * Returns null rather than an unwindowed request when the session is malformed,
 * because the only alternative — reserving without a window — is the failure
 * this function exists to prevent.
 */
export function tierReserveRequest(
  session: SessionWindow,
  poolId: string,
  units = 1,
  orderLineId?: string | null,
): ReserveRequest | null {
  if (!poolId || !session?.startsAt || !session?.endsAt) return null;
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (!Number.isFinite(units) || units <= 0) return null;
  return {
    poolId,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    units: Math.round(units),
    orderLineId: orderLineId ?? null,
  };
}

/**
 * Requests for several tiers of the SAME session, for one atomic batch.
 *
 * Each carries its own `orderLineId`, which is what keeps attribution honest on
 * a multi-tier cart — `capacity_allocations.order_line_id` is what refund-by-line
 * reads, so a shared id means refunding the GA line frees the VIP seats.
 * Returns null if ANY leg is malformed, so a partial batch cannot be built.
 */
export function tierReserveBatch(
  session: SessionWindow,
  legs: ReadonlyArray<{ poolId: string; units?: number; orderLineId?: string | null }>,
): ReserveRequest[] | null {
  if (legs.length === 0) return null;
  const out: ReserveRequest[] = [];
  for (const leg of legs) {
    const req = tierReserveRequest(session, leg.poolId, leg.units ?? 1, leg.orderLineId);
    if (!req) return null;
    out.push(req);
  }
  return out;
}
