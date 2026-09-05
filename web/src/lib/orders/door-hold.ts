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

/** A hold may not outlive this, whatever the data says. 30 days. */
export const MAX_DOOR_HOLD_SECONDS = 30 * 24 * 60 * 60;

/** Below this a hold is not worth taking; the caller falls back to the pool TTL. */
export const MIN_DOOR_HOLD_SECONDS = 60;

export type DoorHoldResolution =
  | { ok: true; seconds: number }
  /** Use the pools' own TTL. Not an error — most orders are not door orders. */
  | { ok: false; reason: "not_a_door_order" | "no_session_end" | "already_ended" };

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

  // A session already over cannot bound a hold. Falling back to the pool TTL is
  // right: the order is still valid (someone may be buying at the door of a
  // running event), it just has no future end to hold against.
  if (seconds < MIN_DOOR_HOLD_SECONDS) return { ok: false, reason: "already_ended" };

  return { ok: true, seconds: Math.min(seconds, MAX_DOOR_HOLD_SECONDS) };
}
