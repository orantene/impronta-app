import {
  CAPACITY_HOLD_TTL_MAX_SECONDS,
  clampToEngineHoldTtl,
} from "@/lib/capacity/hold-ttl-bounds";

/**
 * How long a pay-at-the-door hold lives.
 *
 * THE RULING: hold at creation, commit at settlement, and the hold lasts until
 * the session ENDS. A commit has no TTL and nothing reclaims it, so committing
 * early turns an abandoned click into a seat sold forever, indistinguishable
 * from real demand on a forty-seat room. Fifteen minutes is the opposite
 * failure: the hold lapses while the customer is still travelling to the venue.
 *
 * DERIVED, NOT PASSED. The caller already declares WHICH session each line is
 * for (`lines[].sessionId`); the pipeline reads WHEN it ends. A caller handing
 * over a duration would be computing `end - now` at request time, and a
 * duration computed from a wall clock is where the drift lives. One fact, one
 * source, no arithmetic at the seam.
 */

/**
 * The ceiling, DERIVED from the engine rather than restated.
 *
 * My first version clamped at 30 days — three times what the engine accepts —
 * so a door order eight days out passed here and died at reserve with an opaque
 * `CP007 invalid_ttl`. Replacing it with a literal `604800` fixes today and
 * reproduces the defect one refactor later: two copies of one number, drifting
 * silently. Events made that argument and it is right.
 *
 * `CAPACITY_HOLD_TTL_MAX_SECONDS` is asserted against the migration SQL by
 * `capacity/hold-ttl-bounds.static.test.ts`, so a change to the CHECK fails a
 * test rather than a customer's reserve.
 */
export const MAX_DOOR_HOLD_SECONDS = CAPACITY_HOLD_TTL_MAX_SECONDS;

/**
 * Below this a hold is not worth taking. The engine's floor is 30 seconds; this
 * is deliberately stricter, because a hold measured in seconds is indistinct
 * from no hold at all.
 */
export const MIN_DOOR_HOLD_SECONDS = 60;

export type DoorHoldResolution =
  | { ok: true; seconds: number }
  /** Use the pools' own TTL. Not an error — most orders are not door orders. */
  | { ok: false; reason: "not_a_door_order" | "no_session_end" }
  /** REFUSE the purchase. An online door order for a finished session. */
  | { ok: false; reason: "already_ended" };

/**
 * Seconds from `now` until the latest session on the order ends.
 *
 * The LATEST, not the earliest: an order spanning two sessions must hold every
 * seat until the last one is done, or the second session's seat lapses while
 * the customer is still at the first.
 */
export function doorHoldSeconds(input: {
  paymentChoice: string;
  /** `sessions.ends_at` for each line that has a session. */
  sessionEnds: readonly (string | Date | null | undefined)[];
  now?: Date;
}): DoorHoldResolution {
  // Only a door order. A card order is bounded by Checkout, not by the event.
  if (input.paymentChoice !== "in_person") return { ok: false, reason: "not_a_door_order" };

  const now = (input.now ?? new Date()).getTime();
  let latest = Number.NEGATIVE_INFINITY;
  for (const e of input.sessionEnds) {
    if (e == null) continue;
    const t = e instanceof Date ? e.getTime() : Date.parse(e);
    if (!Number.isFinite(t)) continue;
    if (t > latest) latest = t;
  }
  if (!Number.isFinite(latest)) return { ok: false, reason: "no_session_end" };

  const seconds = Math.floor((latest - now) / 1000);

  // A session already over REFUSES the purchase rather than falling back.
  //
  // I had this as a fallback, reasoning that someone buying at the door of a
  // running event is a real customer. Events corrected it: that person is the
  // door's own `sellAtDoor`, which commits immediately and holds nothing. An
  // ONLINE pay-at-the-door order for an event that has ended is not a late
  // sale, it is a mistake — and falling back would sell it a pool-TTL hold on a
  // seat nobody can use.
  if (seconds < MIN_DOOR_HOLD_SECONDS) return { ok: false, reason: "already_ended" };

  // Clamped through the engine's own helper: a product limit may tighten
  // this, never widen it.
  return { ok: true, seconds: clampToEngineHoldTtl(seconds) };
}
