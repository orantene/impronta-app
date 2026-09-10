/**
 * appointments-board.ts — what an appointment's row says, and what its one
 * button does.
 *
 * PURE, AND ON PURPOSE ON THE SERVER SIDE OF THE FETCH
 * ═══════════════════════════════════════════════════
 * "Today" and "upcoming" are decisions about the clock, and the clock is the
 * one input a client render must never key layout on: a row that is upcoming
 * when the server renders and today when the browser hydrates is a mismatch
 * nothing else in the build can see. So the SERVER decides the bucket, once,
 * and hands the client a row that already carries it. Nothing downstream calls
 * `new Date()` to decide where a row goes.
 *
 * Which is also why the day boundary takes a timezone rather than the reader's.
 * A front desk in Tulum reading a workspace in Tulum wants Tulum's midnight; a
 * consultant reading it from Madrid wants the same rows in the same buckets,
 * because they are the venue's days, not the reader's.
 *
 * ONE NEXT ACTION PER ROW
 * ═══════════════════════
 * The design's rule for this list, and it is a rule about honesty as much as
 * layout: offering "Reschedule" beside a cancelled booking, or beside one the
 * RPC would refuse with `not_reschedulable`, teaches an operator that the
 * buttons on this screen are decorative. `nextActionFor` therefore derives the
 * action from the SAME status set `reschedule_booking_set` accepts
 * (20261231010200: tentative, confirmed, draft, in_progress) rather than a
 * second list that can drift from it.
 */

import { utcToZonedYmd } from "@/lib/scheduling/tz";

/**
 * The statuses `reschedule_booking_set` will move. Copied from the RPC's own
 * gate, and `reschedule-refusal-and-board.test.ts` fails if the two ever
 * disagree — this is the list, not a description of it.
 */
export const RESCHEDULABLE_BOOKING_STATUSES: readonly string[] = [
  "tentative",
  "confirmed",
  "draft",
  "in_progress",
];

export type AppointmentBucket = "today" | "upcoming" | "earlier" | "undated";

export type AppointmentNextAction =
  /** Move it. The only write this surface performs on a booking. */
  | { kind: "reschedule" }
  /** Nothing here can move it; the booking's own page is where the rest lives. */
  | { kind: "open" }
  /** There is nothing to do, and the row says which state it is resting in. */
  | { kind: "none"; because: "cancelled" | "completed" };

export type AppointmentRow = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** ISO instants. Null is a real state: a booking agreed with no date yet. */
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /** Who it is with. Null when the booking carries no contact at all. */
  readonly customerName: string | null;
  /** Who is serving, from the `talent_bookings` mirror. Possibly several. */
  readonly servedBy: readonly string[];
  /** The room or resource, from the space assignments behind the order lines. */
  readonly places: readonly string[];
  /** The venue's zone for this row, when one is known. */
  readonly timeZone: string | null;
  readonly bucket: AppointmentBucket;
  readonly nextAction: AppointmentNextAction;
};

/**
 * Which day-shaped group a start instant belongs to, in the venue's own zone.
 *
 * `undated` is not "unknown" and not an error: `agency_bookings.starts_at` is
 * nullable, and a booking whose date is still being agreed is a row an operator
 * needs to see MORE than the settled ones, not less. Sorting it into "earlier"
 * would bury it.
 */
export function bucketForStart(
  startsAt: string | null,
  now: Date,
  timeZone: string | null,
): AppointmentBucket {
  if (!startsAt) return "undated";
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return "undated";

  const zone = timeZone && timeZone.trim() ? timeZone.trim() : "UTC";
  const startDay = utcToZonedYmd(new Date(startMs), zone);
  const today = utcToZonedYmd(now, zone);
  if (startDay === null || today === null) {
    // An unreadable zone must not silently reclassify a row. Fall back to the
    // instant comparison, which is always answerable.
    return startMs < now.getTime() ? "earlier" : "upcoming";
  }
  if (startDay === today) return "today";
  return startDay < today ? "earlier" : "upcoming";
}

/**
 * The single button this row gets.
 *
 * A booking in the past is not offered a reschedule even when its status would
 * allow one: moving a job that already happened is a correction, and it belongs
 * on the booking's own page beside the rest of the corrections, not behind a
 * one-click control in a list.
 */
export function nextActionFor(input: {
  status: string;
  bucket: AppointmentBucket;
}): AppointmentNextAction {
  const status = input.status.trim().toLowerCase();
  if (status === "cancelled") return { kind: "none", because: "cancelled" };
  if (status === "completed") return { kind: "none", because: "completed" };
  if (!RESCHEDULABLE_BOOKING_STATUSES.includes(status)) return { kind: "open" };
  if (input.bucket === "earlier") return { kind: "open" };
  return { kind: "reschedule" };
}

/**
 * Sort within a bucket: undated first (they need a decision), then by start.
 * A stable tiebreak on id keeps two bookings at the same minute in one order
 * across reloads, so a list does not shuffle under an operator's cursor.
 */
export function compareAppointments(a: AppointmentRow, b: AppointmentRow): number {
  const aMs = a.startsAt ? Date.parse(a.startsAt) : Number.NaN;
  const bMs = b.startsAt ? Date.parse(b.startsAt) : Number.NaN;
  const aHas = Number.isFinite(aMs);
  const bHas = Number.isFinite(bMs);
  if (!aHas && !bHas) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (!aHas) return -1;
  if (!bHas) return 1;
  if (aMs !== bMs) return aMs - bMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Split a `<input type="datetime-local">` value into the two arguments
 * `zonedLocalToUtc` takes.
 *
 * THE HAZARD THIS EXISTS FOR. A datetime-local control hands back a WALL CLOCK
 * with no zone attached, and `new Date("2027-03-14T09:00")` reads it in the
 * BROWSER's zone. An operator in Madrid moving a Tulum booking to "09:00" means
 * nine in the morning at the venue, and the naive parse would store nine in the
 * morning in Madrid — a booking three hours from where anybody expects it, with
 * nothing on screen to show for it. So the value is decomposed here and the
 * venue's zone is applied by the caller.
 *
 * Returns null on anything that is not a complete local date and time, so an
 * unusable value is structurally distinct from a usable one rather than
 * becoming an Invalid Date that flows onward.
 */
export function parseLocalDateTime(
  value: string,
): { ymd: string; minutesOfDay: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  return { ymd: match[1]!, minutesOfDay: hours * 60 + minutes };
}

export const APPOINTMENT_BUCKET_ORDER: readonly AppointmentBucket[] = [
  "undated",
  "today",
  "upcoming",
  "earlier",
];

/** The board, already bucketed and ordered, ready to render without a clock. */
export function groupAppointments(
  rows: readonly AppointmentRow[],
): Array<{ bucket: AppointmentBucket; rows: AppointmentRow[] }> {
  return APPOINTMENT_BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: rows.filter((row) => row.bucket === bucket).sort(compareAppointments),
  })).filter((group) => group.rows.length > 0);
}
