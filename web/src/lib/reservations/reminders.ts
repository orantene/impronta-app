/**
 * reminders.ts — which reservations are due a reminder, and which kind.
 *
 * TWO REMINDERS, AND THEY HAVE DIFFERENT SHAPES.
 *
 *   day_before  Per VENUE, at 08:00 in the venue's own clock, about tomorrow's
 *               bookings. That sweep already exists: `tenantsDueForSweep` in
 *               lib/spaces/reminder-schedule.ts answers "is it 8am where you
 *               are". This module does not re-derive it.
 *   soon        Per RESERVATION, a fixed lead before the seating. Nothing
 *               existing does this, because a booking-level lead is not a daily
 *               sweep.
 *
 * WHY `soon` IS A WINDOW AND NOT A MOMENT. The cron runs hourly. A test like
 * `now === startsAt - 120min` is true for one instant an hour never lands on,
 * so the reminder fires NEVER — and it would look like a delivery problem
 * rather than an arithmetic one. So "due" is true across the whole interval
 * from the lead until the seating, and firing once is the dispatch log's job,
 * exactly as the day-before sweep already documents: a stable eventId plus the
 * dedupe unique index make a second sweep a no-op at the database level.
 *
 * Idempotency at the database is the right place for it. A module that tried to
 * be idempotent by narrowing the window would be choosing between "fires twice"
 * and "fires never", and the second failure is invisible.
 *
 * EVERY DURATION IS ADDED TO THE INSTANT, never to a wall clock. A reservation
 * two hours before 01:30 on a spring-forward night is a real moment; computing
 * it on the clock lands an hour out, silently, once a year.
 *
 * PURE. No DB, no clock of its own.
 */

/** What a reminder is about, in the words the catalog will use. */
export type ReminderKind = "day_before" | "soon";

export type RemindableReservation = {
  admissionId: string;
  startsAt: Date;
  /** Nobody arrived and the host marked it. A no-show is not reminded. */
  noShowAt: Date | null;
  /** They are already at the table. */
  admittedCount: number;
  /** A cancelled or refunded admission is not reminded. */
  status: "valid" | "void" | "refunded";
};

export type DueReminder = {
  admissionId: string;
  kind: ReminderKind;
  /**
   * The dedupe key the dispatcher uses. Stable per reservation and kind, so a
   * second sweep is refused by the unique index rather than by this module
   * guessing whether it already sent one.
   */
  eventId: string;
};

export const DEFAULT_SOON_LEAD_MINUTES = 120;

/** A reservation nobody should be reminded about. */
function isRemindable(r: RemindableReservation): boolean {
  if (r.status !== "valid") return false;
  // Already sitting down. Reminding a seated party is the kind of message that
  // makes a venue turn reminders off entirely.
  if (r.admittedCount > 0) return false;
  if (r.noShowAt !== null) return false;
  return true;
}

/**
 * The `soon` reminders due at `now`.
 *
 * Due from `lead` minutes before the seating until the seating itself. Not
 * after: a reminder that arrives once the table is already being held says
 * nothing useful and reads as a system that is behind.
 */
export function soonRemindersDue(
  reservations: readonly RemindableReservation[],
  now: Date,
  leadMinutes: number = DEFAULT_SOON_LEAD_MINUTES,
): DueReminder[] {
  if (!Number.isFinite(leadMinutes) || leadMinutes < 0) return [];
  const out: DueReminder[] = [];
  for (const r of reservations) {
    if (!isRemindable(r)) continue;
    const at = r.startsAt.getTime();
    const opens = at - leadMinutes * 60_000;
    if (now.getTime() < opens) continue;
    if (now.getTime() >= at) continue;
    out.push({
      admissionId: r.admissionId,
      kind: "soon",
      eventId: `reservation-soon:${r.admissionId}`,
    });
  }
  return out;
}

/**
 * The `day_before` reminders for one venue's sweep.
 *
 * The caller supplies the UTC window of the venue's local tomorrow, from
 * `tenantsDueForSweep`. Half-open `[start, end)`, so a 00:00 seating belongs to
 * the day that starts at it and not to the one that ends there.
 */
export function dayBeforeRemindersDue(
  reservations: readonly RemindableReservation[],
  window: { start: Date; end: Date },
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const r of reservations) {
    if (!isRemindable(r)) continue;
    const at = r.startsAt.getTime();
    if (at < window.start.getTime()) continue;
    if (at >= window.end.getTime()) continue;
    out.push({
      admissionId: r.admissionId,
      kind: "day_before",
      eventId: `reservation-day-before:${r.admissionId}`,
    });
  }
  return out;
}

/**
 * A guest tapping "running late" holds the table longer.
 *
 * Returns the new hold-until instant, clamped: a guest cannot extend past the
 * turn they booked, or one late party eats the next party's table and the
 * second guest is the one who suffers for the first one's lateness.
 */
export function extendHold(input: {
  startsAt: Date;
  turnMinutes: number;
  extraMinutes: number;
  alreadyHeldUntil: Date | null;
}): Date {
  const base = input.alreadyHeldUntil ?? input.startsAt;
  const wanted = base.getTime() + Math.max(0, input.extraMinutes) * 60_000;
  const ceiling = input.startsAt.getTime() + input.turnMinutes * 60_000;
  return new Date(Math.min(wanted, ceiling));
}
