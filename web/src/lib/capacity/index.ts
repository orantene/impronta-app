/**
 * The capacity engine (Sell the Room 0.2).
 *
 * "N units of a subject over a time window", and nothing else. Spaces, sessions,
 * tiers and offerings all bind to it; none of them are defined here.
 */
export * from "./types";
export {
  chargesAgainst,
  isAllocationLive,
  overlapsWindow,
  remainingAcrossChain,
  remainingUnits,
} from "./remaining";
export {
  capacityHoldTtlSeconds,
  capacityRemaining,
  commitCapacity,
  releaseCapacity,
  reserveCapacity,
  reserveCapacityBatch,
  type ReserveRequest,
} from "./reserve";
export {
  setOfferingStock,
  stockChanged,
  type SetOfferingStockResult,
} from "./offering-stock-admin";
/**
 * The engine's hold-TTL bounds, so nobody has to read the SQL to learn them.
 *
 * The cap lives in TWO places in the database — the `capacity_pools.hold_ttl_seconds`
 * CHECK and the `v_ttl` guard inside `_capacity_reserve_locked` — and in neither
 * of them can a TypeScript caller see it. Orders wrote a 30-day ceiling for
 * pay-at-the-door holds against this engine's 7-day one; a door order eight days
 * out would have passed their clamp and died at reserve with `CP007
 * invalid_ttl`, AFTER the order, the customer and the capacity request had all
 * succeeded. That was not carelessness — the number was genuinely unreadable
 * from where they stood.
 *
 * The module is Orders'; the re-export is here because `@/lib/capacity` is where
 * a caller looks for a capacity fact. Four TypeScript copies of `604800`
 * collapse onto it.
 */
export {
  CAPACITY_HOLD_TTL_MAX_SECONDS,
  CAPACITY_HOLD_TTL_MIN_SECONDS,
  clampToEngineHoldTtl,
} from "./hold-ttl-bounds";
