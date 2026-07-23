/**
 * cancellation-window.ts — pure policy math for talent_offerings.cancellation_hours.
 *
 * "Free cancellation until Nh before" was display-only; this resolves whether a
 * cancellation attempted NOW falls inside the window (i.e. the free-cancel
 * period has already ended). Clients cannot self-cancel bookings today, so the
 * verdict is SURFACED to staff (audit payload + refund decisions), not used to
 * hard-block — staff keep override authority.
 *
 * Schedule source: agency_bookings.starts_at (timestamptz, set by reschedule)
 * falling back to event_date (a bare DATE — treated as start-of-day UTC, the
 * conservative reading: the window closes at the earliest plausible moment).
 * No schedule at all ⇒ unenforceable (verdict false, flagged as such).
 */

export type CancellationWindowVerdict = {
  /** There was a policy AND a schedule to measure against. */
  enforceable: boolean;
  /** True when the free-cancellation deadline has already passed. */
  insideWindow: boolean;
  /** The free-cancel deadline (ISO), when computable. */
  deadlineIso: string | null;
};

export function resolveCancellationWindow(input: {
  cancellationHours: number | null | undefined;
  startsAt: string | null | undefined;
  eventDate: string | null | undefined;
  nowMs: number;
}): CancellationWindowVerdict {
  const hours = input.cancellationHours;
  // null = flexible policy; 0 = explicitly flexible. Neither restricts.
  if (hours == null || !Number.isFinite(hours) || hours <= 0) {
    return { enforceable: false, insideWindow: false, deadlineIso: null };
  }

  let startMs: number | null = null;
  if (input.startsAt) {
    const t = Date.parse(input.startsAt);
    if (Number.isFinite(t)) startMs = t;
  }
  if (startMs == null && input.eventDate) {
    const t = Date.parse(`${input.eventDate}T00:00:00.000Z`);
    if (Number.isFinite(t)) startMs = t;
  }
  if (startMs == null) return { enforceable: false, insideWindow: false, deadlineIso: null };

  const deadlineMs = startMs - hours * 3_600_000;
  return {
    enforceable: true,
    insideWindow: input.nowMs > deadlineMs,
    deadlineIso: new Date(deadlineMs).toISOString(),
  };
}
