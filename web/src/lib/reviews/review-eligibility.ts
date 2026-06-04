/**
 * Pure review-eligibility + rating-aggregate helpers.
 *
 * Plain module (NOT "use server") so it can be unit-tested and imported by both
 * the server action and the read helpers without dragging server-only deps.
 *
 * Eligibility policy (default, locked this wave): a booking is reviewable by its
 * client when it is COMPLETED, or PAID and the event end has passed.
 */

export type ReviewEligibilityInput = {
  status: string;
  paymentStatus: string;
  /** ISO timestamp of event end, if known. */
  endsAt: string | null;
  /** YYYY-MM-DD event date, if known. */
  eventDate: string | null;
  /** Override "now" for tests. Defaults to Date.now(). */
  now?: number;
};

/** End-of-event instant in ms: endsAt when present, else end of event_date day. */
export function bookingEndMs(
  endsAt: string | null,
  eventDate: string | null,
): number | null {
  if (endsAt) {
    const t = Date.parse(endsAt);
    return Number.isFinite(t) ? t : null;
  }
  if (eventDate) {
    const t = Date.parse(`${eventDate}T23:59:59Z`);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** True when the booking's event end has passed relative to `now`. */
export function bookingEndPassed(
  endsAt: string | null,
  eventDate: string | null,
  now: number = Date.now(),
): boolean {
  const end = bookingEndMs(endsAt, eventDate);
  return end !== null && end <= now;
}

/** Default policy predicate: completed OR (paid AND event end passed). */
export function isBookingReviewable(input: ReviewEligibilityInput): boolean {
  const now = input.now ?? Date.now();
  if (input.status === "completed") return true;
  if (input.paymentStatus === "paid" && bookingEndPassed(input.endsAt, input.eventDate, now)) {
    return true;
  }
  return false;
}

/**
 * Clamp + round a rating average from a set of integer ratings.
 * Returns { average, count }; average rounded to one decimal; 0 when empty.
 */
export function computeRatingSummary(ratings: number[]): {
  average: number;
  count: number;
} {
  const valid = ratings.filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (valid.length === 0) return { average: 0, count: 0 };
  const sum = valid.reduce((a, b) => a + b, 0);
  return { average: Math.round((sum / valid.length) * 10) / 10, count: valid.length };
}

/** True when the supplied rating is a valid 1..5 integer. */
export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

// ---------------------------------------------------------------------------
// Two-sided reviews (W8) — pure authorization predicates.
// ---------------------------------------------------------------------------

/**
 * A talent may leave a CLIENT review on a booking when:
 *   - they are a talent ON that booking, AND
 *   - the booking is reviewable under the default policy (completed, or paid +
 *     event end passed).
 * `callerTalentProfileIds` are the caller's own talent_profiles ids;
 * `bookingTalentProfileIds` are the talent_profiles on the booking.
 */
export function canTalentReviewClient(input: {
  callerTalentProfileIds: string[];
  bookingTalentProfileIds: string[];
  eligibility: ReviewEligibilityInput;
}): boolean {
  const onBooking = input.bookingTalentProfileIds.some((id) =>
    input.callerTalentProfileIds.includes(id),
  );
  if (!onBooking) return false;
  return isBookingReviewable(input.eligibility);
}

/**
 * Who may REPORT (flag) a review: only the SUBJECT of the review.
 *   - talent-subject review (client→talent): the talent who owns the reviewed
 *     profile, i.e. callerUserId === subjectTalentUserId.
 *   - client-subject review (talent→client): the reviewed client,
 *     i.e. callerUserId === subjectClientUserId.
 */
export function canReportReview(input: {
  kind: "talent" | "client";
  callerUserId: string;
  /** owner user of the reviewed talent profile (for kind='talent'). */
  subjectTalentUserId?: string | null;
  /** the reviewed client's user id (for kind='client'). */
  subjectClientUserId?: string | null;
}): boolean {
  if (!input.callerUserId) return false;
  if (input.kind === "talent") {
    return (
      !!input.subjectTalentUserId &&
      input.subjectTalentUserId === input.callerUserId
    );
  }
  return (
    !!input.subjectClientUserId &&
    input.subjectClientUserId === input.callerUserId
  );
}
