/**
 * G2: which completed bookings are due their ONE automatic review request.
 *
 * PURE: no database, no clock of its own. The producer loads the rows and acts
 * on the decision; every rule lives here so it is testable.
 *
 * A booking is due when ALL hold:
 *   - it is `completed`;
 *   - it ended (end, else start, else event date) at least MIN_HOURS ago and at
 *     most MAX_DAYS ago (a very old booking is not nagged after the fact);
 *   - it has someone to ask: the booking's own client account or contact email.
 *     Never any other address;
 *   - it has exactly ONE booked talent (the review is about one person; a roster
 *     booking is left to the manual flow);
 *   - no review request exists for it yet, of any kind (manual or automatic).
 * "Once" is also enforced by the database (a unique partial index on the
 * automatic request), so a re-run or two overlapping runs collapse to one.
 */

/** Wait this long after the booking ended before asking: the work should be done and fresh. */
export const AUTO_REVIEW_MIN_HOURS_AFTER_END = 3;
/** Stop asking this many days after the booking ended. */
export const AUTO_REVIEW_MAX_DAYS_AFTER_END = 14;

export type AutoReviewBooking = {
  id: string;
  tenant_id: string;
  status: string;
  ends_at: string | null;
  starts_at: string | null;
  event_date: string | null;
  client_user_id: string | null;
  contact_email: string | null;
  order_id: string | null;
  title: string | null;
};

export type AutoReviewSkip =
  | "not_completed"
  | "no_end"
  | "too_soon"
  | "too_old"
  | "no_recipient"
  | "talent_count"
  | "already_requested";

export type AutoReviewDecision = {
  /** Bookings to create a request for, with the one talent and the address to ask. */
  due: Array<{
    booking: AutoReviewBooking;
    talentProfileId: string;
    clientUserId: string | null;
    invitedEmail: string | null;
  }>;
  skipped: Record<AutoReviewSkip, number>;
};

/** When the booking ended: its end, else its start, else the end of its event date (UTC). */
export function bookingEndedAt(b: Pick<AutoReviewBooking, "ends_at" | "starts_at" | "event_date">): Date | null {
  for (const v of [b.ends_at, b.starts_at]) {
    if (v) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  if (b.event_date) {
    const d = new Date(`${b.event_date.slice(0, 10)}T23:59:59Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function cleanEmail(raw: string | null): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e) ? e : null;
}

export function decideAutoReviewRequests(input: {
  now: Date;
  bookings: readonly AutoReviewBooking[];
  /** booking id -> distinct talent profile ids booked on it. */
  talentsByBooking: ReadonlyMap<string, readonly string[]>;
  /** Booking ids that already have a review request of any kind. */
  requestedBookingIds: ReadonlySet<string>;
}): AutoReviewDecision {
  const out: AutoReviewDecision = {
    due: [],
    skipped: {
      not_completed: 0,
      no_end: 0,
      too_soon: 0,
      too_old: 0,
      no_recipient: 0,
      talent_count: 0,
      already_requested: 0,
    },
  };
  const nowMs = input.now.getTime();
  const minMs = AUTO_REVIEW_MIN_HOURS_AFTER_END * 3_600_000;
  const maxMs = AUTO_REVIEW_MAX_DAYS_AFTER_END * 86_400_000;

  for (const b of input.bookings) {
    if (b.status !== "completed") {
      out.skipped.not_completed += 1;
      continue;
    }
    const ended = bookingEndedAt(b);
    if (!ended) {
      out.skipped.no_end += 1;
      continue;
    }
    const age = nowMs - ended.getTime();
    if (age < minMs) {
      out.skipped.too_soon += 1;
      continue;
    }
    if (age > maxMs) {
      out.skipped.too_old += 1;
      continue;
    }
    if (input.requestedBookingIds.has(b.id)) {
      out.skipped.already_requested += 1;
      continue;
    }
    const clientUserId = b.client_user_id?.trim() || null;
    const invitedEmail = cleanEmail(b.contact_email);
    if (!clientUserId && !invitedEmail) {
      out.skipped.no_recipient += 1;
      continue;
    }
    const talents = [...new Set(input.talentsByBooking.get(b.id) ?? [])];
    if (talents.length !== 1) {
      out.skipped.talent_count += 1;
      continue;
    }
    out.due.push({ booking: b, talentProfileId: talents[0], clientUserId, invitedEmail });
  }
  return out;
}
