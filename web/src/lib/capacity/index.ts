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
 * The hold-TTL bounds are DELIBERATELY NOT re-exported from this barrel. Import
 * them from the module directly:
 *
 *   import { CAPACITY_HOLD_TTL_MAX_SECONDS } from "@/lib/capacity/hold-ttl-bounds";
 *
 * WHY — and I shipped the re-export in #1891 before working this out:
 * `hold-ttl-bounds.ts` has ZERO imports, deliberately, so anything at all can
 * read the engine's cap. This barrel re-exports `reserve.ts` and
 * `offering-stock-admin.ts`, both of which import `@/lib/supabase/admin`. Going
 * through the barrel to reach two integers therefore pulls the Supabase SDK and
 * the service-role factory into the importer's module graph.
 *
 * WHAT THAT IS AND IS NOT, because I first wrote this down as worse than it is:
 * it is a needless dependency edge and bundle weight. It is NOT a secret leak —
 * `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix, so it is `undefined`
 * in any browser bundle and the factory returns null. And `admin.ts` carries no
 * `server-only` marker, so nothing would have failed loudly either; the cost
 * would just have been paid quietly by whoever imported it.
 *
 * Every real consumer already uses the direct path — `lib/orders/door-hold.ts`,
 * `lib/scheduling/reservation-hold.ts`, and Events' ticket purchase. The
 * re-export had ZERO importers, so this removes a door nobody walked through
 * that would have been the wrong one.
 */
