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
  capacityRemaining,
  commitCapacity,
  releaseCapacity,
  reserveCapacity,
  reserveCapacityBatch,
  type ReserveRequest,
} from "./reserve";
