/**
 * book.ts — today's book, as the host stand reads it.
 *
 * SIX STATES, ALL DERIVED, NO NEW COLUMN. Everything below falls out of
 * `no_show_at`, `completed_at`, `admitted_count`, `party_size` and `starts_at`,
 * which Events & Ticketing shipped on `admissions`.
 *
 * NOTHING DERIVES FROM `status`. `valid` / `void` / `refunded` is COMMERCIAL
 * state and renders as a separate badge, because "seated, then refunded" is a
 * real sentence about one reservation and a single label cannot say it. That
 * split is the reason there are two fields and not one, and collapsing them
 * here would undo it at the only place a human looks.
 *
 * `part_seated` IS THE ONE A TICKET DOOR DOES NOT HAVE. Two of a four-top
 * arrive at 20:00 and the rest at 20:40; the table is held and the row is
 * visibly incomplete. It costs no column because `admitted_count` already
 * counts people rather than events.
 *
 * PURE. No DB.
 */

import { addUtcDays } from "@/lib/scheduling/tz";
import { resolveWallClock } from "./windows";

export type BookState =
  | "booked"
  | "arriving"
  | "late"
  | "part_seated"
  | "seated"
  | "no_show"
  | "completed";

export type BookRow = {
  admissionId: string;
  startsAt: Date;
  partySize: number;
  admittedCount: number;
  noShowAt: Date | null;
  completedAt: Date | null;
  status: "valid" | "void" | "refunded";
  holderName: string | null;
  /** Null is a VALID state: the host has not placed this party yet. */
  spaceCode: string | null;
  /**
   * When the party was checked in (`admissions.seated_at`). Optional: the
   * desk's decisions never read it; the floor uses it to tell tonight's
   * EARLIER party at a table from the one sitting there now.
   */
  seatedAt?: Date | null;
};

export type BookEntry = BookRow & {
  state: BookState;
  /** Minutes past the seating with nobody arrived. 0 unless `late`. */
  lateMinutes: number;
  /** Commercial state, shown separately. Never folded into `state`. */
  isRefunded: boolean;
  isVoid: boolean;
  /**
   * They were marked a no-show and then arrived.
   *
   * A SEPARATE FIELD FOR THE SAME REASON `isRefunded` IS ONE. Making arrival
   * win the STATE is right — they are sitting down — but it would make the
   * stamp invisible, and a no-show FEE may already be on this guest's bill.
   * The host stand is the one place a human can explain that charge to the
   * person standing in front of them, so the fact has to survive the state it
   * lost to. Folding it away would be the same collapse this file refuses for
   * `status`.
   */
  wasMarkedNoShow: boolean;
};

/** How soon before the seating a row starts reading as "arriving". */
export const ARRIVING_WINDOW_MINUTES = 15;

/**
 * The state of one row.
 *
 * Order matters and is the whole function. `completed` and `no_show` are
 * TERMINAL and are tested first, because a stamped row must not drift back into
 * a live state when the clock moves past it — a no-show at 20:00 must not read
 * as "late by 180 minutes" at 23:00.
 */
export function bookState(row: BookRow, now: Date, graceMinutes: number): BookState {
  if (row.completedAt !== null) return "completed";

  // ARRIVAL BEATS A NO-SHOW STAMP, and the stamp is NOT cleared.
  //
  // Someone can be marked a no-show and then walk in: the host was early, or
  // the grace job fired while they were parking. The obvious repair is to null
  // `no_show_at` on arrival, and it is wrong — a no-show fee may ALREADY HAVE
  // BEEN CHARGED off that stamp, and clearing it leaves money that moved with
  // nothing on the row explaining why. The guest disputes the charge and the
  // record cannot answer.
  //
  // So the stamp stays as the record of what was decided and when, and the
  // DISPLAY prefers the newer fact: they are here. Agreed with Events &
  // Ticketing, who own `check_in`; no-show semantics are mine.
  if (row.admittedCount >= row.partySize) return "seated";
  if (row.admittedCount > 0) return "part_seated";

  if (row.noShowAt !== null) return "no_show";

  const at = row.startsAt.getTime();
  const t = now.getTime();

  // Past the grace period with nobody arrived. NOT a no-show: that is a stamp
  // a human or the grace job applies, and this function must never imply one
  // has been applied when it has not.
  if (t > at + graceMinutes * 60_000) return "late";
  if (t >= at - ARRIVING_WINDOW_MINUTES * 60_000) return "arriving";
  return "booked";
}

/** Today's book, ordered the way a host reads it: by time, earliest first. */
export function buildBook(
  rows: readonly BookRow[],
  now: Date,
  graceMinutes: number,
): BookEntry[] {
  return rows
    .map((row) => {
      const state = bookState(row, now, graceMinutes);
      return {
        ...row,
        state,
        lateMinutes:
          state === "late"
            ? Math.floor((now.getTime() - row.startsAt.getTime()) / 60_000)
            : 0,
        isRefunded: row.status === "refunded",
        isVoid: row.status === "void",
        // True only when the stamp LOST to an arrival. A row still reading
        // `no_show` does not need a badge saying so.
        wasMarkedNoShow: row.noShowAt !== null && row.admittedCount > 0,
      };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type BookSummary = {
  /** People expected to eat: booked covers, minus the ones who did not come. */
  covers: number;
  /** People actually through the door. */
  arrived: number;
  arrivingNow: number;
  runningLate: number;
  unassigned: number;
};

/**
 * The four counters at the top of the host stand.
 *
 * `covers` and `arrived` are DIFFERENT NUMBERS and both are wanted: a restaurant
 * asking "how many covers tonight" means the first before service and the second
 * after it. Summing `party_size` alone would count no-shows as diners; summing
 * `admitted_count` alone would report an empty room at 18:00.
 */
export function summariseBook(entries: readonly BookEntry[]): BookSummary {
  let covers = 0;
  let arrived = 0;
  let arrivingNow = 0;
  let runningLate = 0;
  let unassigned = 0;

  for (const e of entries) {
    if (e.isVoid) continue; // a cancelled booking is not a cover
    if (e.state !== "no_show") covers += e.partySize;
    arrived += e.admittedCount;
    if (e.state === "arriving") arrivingNow += 1;
    if (e.state === "late") runningLate += 1;
    if (e.spaceCode === null && e.state !== "no_show" && e.state !== "completed") {
      unassigned += 1;
    }
  }

  return { covers, arrived, arrivingNow, runningLate, unassigned };
}

/**
 * The instants tonight's book covers: the venue's own calendar day, widened by
 * any service window that runs past midnight.
 *
 * WHY NOT THE SERVICE WINDOWS. The book used to run from the first window's
 * start to the last window's end. On the QA floor that was 12:00 to 22:00, and
 * a walk-in taken at 10:20 was on the FLOOR (holding its table, counted late)
 * and absent from the DESK, which had just said "added to the book". Two
 * screens reading the same rows disagreed about who was booked tonight, and a
 * host who takes a party ten minutes before service opens is the ordinary
 * case, not the edge. The venue's day is the honest span: a booking made for
 * today is on today's book whether or not a window was open at that minute.
 *
 * WHY THE WINDOWS STILL MATTER. A late service that resolves past midnight
 * belongs to the evening it started, so the span is widened to the latest
 * window's end rather than cut at 24:00. Windows never NARROW the span.
 *
 * A zone or date that cannot be resolved falls back to the windows' own span,
 * and with no windows either to twenty-four hours from UTC midnight, so the
 * desk degrades to the old behaviour rather than to an empty book.
 */
export function bookSpan(input: {
  onDate: string;
  timeZone: string;
  windows: ReadonlyArray<{ startsAt: Date; endsAt: Date }>;
}): { start: Date; end: Date } {
  const { onDate, timeZone, windows } = input;
  const windowStart =
    windows.length > 0 ? new Date(Math.min(...windows.map((w) => w.startsAt.getTime()))) : null;
  const windowEnd =
    windows.length > 0 ? new Date(Math.max(...windows.map((w) => w.endsAt.getTime()))) : null;

  // Midnight to the NEXT midnight, both resolved as instants in the venue's
  // zone: the day is however long the zone makes it (23 or 25 hours on a DST
  // change), never a fixed 24 hours added to the first instant.
  const nextDate = addUtcDays(onDate, 1);
  const dayStart = resolveWallClock(onDate, 0, timeZone, "next");
  const dayEnd = nextDate === null ? null : resolveWallClock(nextDate, 0, timeZone, "next");
  if (dayStart === null || dayEnd === null || dayEnd.getTime() <= dayStart.getTime()) {
    const start = windowStart ?? new Date(`${onDate}T00:00:00Z`);
    const end = windowEnd ?? new Date(start.getTime() + 24 * 3_600_000);
    return { start, end };
  }

  return {
    start: windowStart && windowStart.getTime() < dayStart.getTime() ? windowStart : dayStart,
    end: windowEnd && windowEnd.getTime() > dayEnd.getTime() ? windowEnd : dayEnd,
  };
}
