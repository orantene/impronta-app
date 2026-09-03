/**
 * remaining.ts — the one rule the whole engine derives from, in TypeScript.
 *
 * This is a deliberate second implementation of the SQL in
 * 20261229000200_capacity_engine.sql, so a surface that has already loaded a
 * pool and its allocations can say "3 left" without another round trip. The two
 * must agree; the concurrency proof and the unit tests below are what keep them
 * honest. If you change the rule, change it in BOTH places.
 *
 *   remaining(P, W) = P.unitsTotal + P.overbookUnits
 *                   - Σ units of allocations A where
 *                         A.poolPath contains P.id      (P or any descendant)
 *                     AND A is live (committed, or a hold that has not lapsed)
 *                     AND A overlaps W
 */

import type { CapacityAllocation, CapacityPool, CapacityWindow } from "./types";

const TIMELESS: CapacityWindow = { startsAt: null, endsAt: null };

/**
 * True when the allocation still consumes units. A committed allocation always
 * does. A hold does until its expiry passes — which is why a late reaper costs
 * table size and nothing else. A released allocation never does.
 */
export function isAllocationLive(alloc: CapacityAllocation, now: Date = new Date()): boolean {
  if (alloc.state === "committed") return true;
  if (alloc.state !== "hold") return false;
  if (alloc.expiresAt == null) return false;
  const ms = Date.parse(alloc.expiresAt);
  return Number.isFinite(ms) && ms > now.getTime();
}

/**
 * Half-open overlap, matching Postgres `tstzrange(a, b, '[)')`. A 19:00-21:00
 * booking and a 21:00-23:00 booking do NOT collide.
 *
 * A timeless allocation (null range) overlaps EVERY window, and a timeless
 * query window is overlapped by every allocation. That asymmetry is deliberate:
 * it is what makes plain stock work through the same rule as a seated table.
 */
export function overlapsWindow(alloc: CapacityAllocation, window: CapacityWindow): boolean {
  if (alloc.startsAt == null || alloc.endsAt == null) return true;
  if (window.startsAt == null || window.endsAt == null) return true;
  const aStart = Date.parse(alloc.startsAt);
  const aEnd = Date.parse(alloc.endsAt);
  const wStart = Date.parse(window.startsAt);
  const wEnd = Date.parse(window.endsAt);
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd)) return true;
  if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) return true;
  return aStart < wEnd && wStart < aEnd;
}

/** True when this allocation charges the given pool: it is on it, or below it. */
export function chargesAgainst(alloc: CapacityAllocation, poolId: string): boolean {
  return alloc.poolPath.includes(poolId);
}

/**
 * Units still available on this pool for this window. Never negative.
 *
 * NOTE this answers for ONE pool. A child pool's true availability is the
 * tightest answer across its whole ancestor chain (a free table in a bought-out
 * room is not free) — that is what the database's reserve walk and
 * capacity_remaining_public both compute. Callers holding the chain should use
 * remainingAcrossChain below rather than calling this on the leaf alone.
 */
export function remainingUnits(
  pool: CapacityPool,
  allocations: readonly CapacityAllocation[],
  window: CapacityWindow = TIMELESS,
  now: Date = new Date(),
): number {
  if (!pool.isActive) return 0;
  let used = 0;
  for (const alloc of allocations) {
    if (!chargesAgainst(alloc, pool.id)) continue;
    if (!isAllocationLive(alloc, now)) continue;
    if (!overlapsWindow(alloc, window)) continue;
    used += alloc.units;
  }
  return Math.max(pool.unitsTotal + pool.overbookUnits - used, 0);
}

/**
 * What a buyer actually experiences: the tightest constraint anywhere in the
 * chain. `chain` is the leaf's ancestors including itself, in any order.
 */
export function remainingAcrossChain(
  chain: readonly CapacityPool[],
  allocations: readonly CapacityAllocation[],
  window: CapacityWindow = TIMELESS,
  now: Date = new Date(),
): number {
  if (chain.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const pool of chain) {
    const rem = remainingUnits(pool, allocations, window, now);
    if (rem < min) min = rem;
  }
  return Number.isFinite(min) ? min : 0;
}
