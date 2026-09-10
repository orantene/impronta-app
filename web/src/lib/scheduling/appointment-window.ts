/**
 * appointment-window.ts — the time an appointment is actually AT.
 *
 * THE DEFECT THIS CLOSES (proved in a browser, 2026-09-10)
 * ═══════════════════════════════════════════════════════
 * A guest picked "Thu, Sep 10, 9:00 AM" on the public booking page and
 * confirmed it. The talent's hold was written for 15:00–15:45Z, the room's
 * allocation for the same window, the order was opened, and the
 * `agency_bookings` row that Operate → Appointments reads was written with
 * `starts_at = NULL`. So the board said "No time agreed yet" about an
 * appointment starting in twenty minutes, every instant booking landed in the
 * "No date agreed yet" bucket, and the destination named for the day's
 * appointments could not show a single one of them.
 *
 * `createPurchase` was right that a TACO has no time: the menu engine it
 * replaced stamped `starts_at = ends_at = now()` as a placeholder and that is
 * a lie about a pizza. But a purchase that takes somebody's calendar arrives
 * carrying the window it took — `input.reservation`, or the holds of a couples
 * booking — and dropping it is not the same restraint. This module is the one
 * decision: which of those windows is the appointment's own.
 *
 * PURE, so the rule can be checked without a database, and so the pipeline
 * that writes money holds no opinion about calendars beyond calling this.
 *
 * ABSENCE IS A SHAPE, NOT AN EMPTY STRING. A purchase with no slot returns
 * `null` and the booking keeps no time at all, which is the honest record for
 * something nobody has agreed a time for. A caller must not be able to read
 * "no appointment" as "an appointment at the epoch".
 */

/** One calendar slot a purchase holds. The shape both `reservation` and `holds` share. */
export type PurchaseSlot = {
  readonly startsAt: string;
  readonly endsAt: string;
};

export type AppointmentWindow = {
  readonly startsAt: string;
  readonly endsAt: string;
};

/** A parsable instant, or null. An unparsable string is not a time. */
function instant(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The window to stamp on the booking, or null when the purchase takes no time.
 *
 * THE RESERVATION WINS WHEN THERE IS ONE. It is the primary person's slot and
 * the one the buyer chose; the companion holds of a couples booking are the
 * same window seen from another calendar. Only when there is no reservation at
 * all does the earliest hold stand in for it, because that is then the only
 * window anybody agreed to.
 *
 * A slot whose ends is not after its starts is REFUSED rather than repaired.
 * Inventing an end would put a window on the board that nothing else in the
 * build holds, and `reschedule_booking_set` refuses that shape by name
 * (`bad_window`) — a booking the operator could see and could never move.
 */
export function appointmentWindowFor(input: {
  readonly reservation?: PurchaseSlot | null;
  readonly holds?: readonly PurchaseSlot[] | null;
}): AppointmentWindow | null {
  const candidates: PurchaseSlot[] = input.reservation
    ? [input.reservation]
    : [...(input.holds ?? [])];
  if (candidates.length === 0) return null;

  let best: { slot: PurchaseSlot; start: number } | null = null;
  for (const slot of candidates) {
    const start = instant(slot.startsAt);
    const end = instant(slot.endsAt);
    if (start === null || end === null || end <= start) continue;
    if (best === null || start < best.start) best = { slot, start };
  }
  if (best === null) return null;
  return { startsAt: best.slot.startsAt, endsAt: best.slot.endsAt };
}
