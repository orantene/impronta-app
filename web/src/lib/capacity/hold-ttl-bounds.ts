/**
 * The capacity engine's hold-TTL bounds, in ONE place.
 *
 * These are the database's numbers, not a product preference:
 *
 *   capacity_pools_hold_ttl_seconds_check   CHECK (BETWEEN 30 AND 604800)
 *   _capacity_reserve_locked                IF v_ttl < 30 OR > 604800 → CP007
 *
 * WHY THEY LIVE HERE. Orders needed a ceiling for pay-at-the-door holds and I
 * wrote `30 days` — three times what the engine accepts. A door order eight
 * days out would have passed the caller's clamp and died at reserve with an
 * opaque `invalid_ttl`, after everything upstream had succeeded.
 *
 * Replacing it with a literal `604800` in the caller fixes today and reproduces
 * the defect one refactor later: two copies of one number, drifting silently.
 * So the number is exported from the engine's own area, and
 * `hold-ttl-bounds.static.test.ts` asserts it against the migration SQL — if
 * the CHECK moves and this does not, that test fails rather than a customer's
 * reserve.
 *
 * Added by Orders & Checkout, in Capacity's area, by the precedent this
 * department has used all week: whoever needs the value writes it where it
 * belongs and tells the owner.
 */

/** Shortest hold the engine will accept. */
export const CAPACITY_HOLD_TTL_MIN_SECONDS = 30;

/** Longest hold the engine will accept. 7 days. */
export const CAPACITY_HOLD_TTL_MAX_SECONDS = 604800;

/**
 * Clamp a desired TTL into what the engine will accept.
 *
 * A caller with its own, tighter product limit passes it: the result is the
 * smaller of the two, so a product rule can never widen the engine's bound.
 */
export function clampToEngineHoldTtl(seconds: number, productMaxSeconds?: number): number {
  const ceiling = productMaxSeconds == null
    ? CAPACITY_HOLD_TTL_MAX_SECONDS
    : Math.min(productMaxSeconds, CAPACITY_HOLD_TTL_MAX_SECONDS);
  return Math.max(CAPACITY_HOLD_TTL_MIN_SECONDS, Math.min(Math.floor(seconds), ceiling));
}
