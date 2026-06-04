/**
 * Unit tests for review eligibility + rating-aggregate logic.
 *
 * Pure logic — no DB, no mocks. Pins down:
 *   - completed bookings are always reviewable
 *   - paid-but-future events are NOT reviewable until the event end passes
 *   - paid + past = reviewable; unpaid + past = NOT reviewable
 *   - ends_at takes precedence over event_date for the "past" check
 *   - rating 1..5 integer validation
 *   - average computation (rounding, empty set, out-of-range filtering)
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  bookingEndPassed,
  canReportReview,
  canTalentReviewClient,
  computeRatingSummary,
  isBookingReviewable,
  isValidRating,
} from "./review-eligibility";

const T = (iso: string) => Date.parse(iso);

describe("isBookingReviewable — default policy", () => {
  const now = T("2026-06-03T12:00:00Z");

  it("completed is reviewable regardless of payment/date", () => {
    assert.equal(
      isBookingReviewable({
        status: "completed",
        paymentStatus: "unpaid",
        endsAt: null,
        eventDate: "2099-01-01",
        now,
      }),
      true,
    );
  });

  it("paid + past event end is reviewable", () => {
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "paid",
        endsAt: "2026-06-01T20:00:00Z",
        eventDate: null,
        now,
      }),
      true,
    );
  });

  it("paid + FUTURE event end is NOT reviewable", () => {
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "paid",
        endsAt: "2026-06-10T20:00:00Z",
        eventDate: null,
        now,
      }),
      false,
    );
  });

  it("unpaid + past event is NOT reviewable (must be completed or paid)", () => {
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "unpaid",
        endsAt: "2026-06-01T20:00:00Z",
        eventDate: null,
        now,
      }),
      false,
    );
  });

  it("partial payment + past event is NOT reviewable", () => {
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "partial",
        endsAt: "2026-06-01T20:00:00Z",
        eventDate: null,
        now,
      }),
      false,
    );
  });

  it("falls back to event_date end-of-day when ends_at is null", () => {
    // event_date 2026-06-03; day ends 23:59:59Z which is AFTER now (12:00Z) → not passed yet
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "paid",
        endsAt: null,
        eventDate: "2026-06-03",
        now,
      }),
      false,
    );
    // event_date in the past → passed
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "paid",
        endsAt: null,
        eventDate: "2026-06-02",
        now,
      }),
      true,
    );
  });

  it("no end signal at all → not past → not reviewable when only paid", () => {
    assert.equal(
      isBookingReviewable({
        status: "confirmed",
        paymentStatus: "paid",
        endsAt: null,
        eventDate: null,
        now,
      }),
      false,
    );
  });
});

describe("bookingEndPassed", () => {
  const now = T("2026-06-03T12:00:00Z");
  it("ends_at takes precedence over event_date", () => {
    // ends_at future even though event_date is past → not passed
    assert.equal(bookingEndPassed("2026-06-10T00:00:00Z", "2020-01-01", now), false);
  });
  it("returns false on no signal", () => {
    assert.equal(bookingEndPassed(null, null, now), false);
  });
});

describe("isValidRating", () => {
  it("accepts 1..5 integers", () => {
    for (const r of [1, 2, 3, 4, 5]) assert.equal(isValidRating(r), true);
  });
  it("rejects out-of-range + non-integers", () => {
    for (const r of [0, 6, -1, 3.5, NaN, Infinity]) assert.equal(isValidRating(r), false);
  });
});

describe("computeRatingSummary", () => {
  it("returns 0/0 for an empty set", () => {
    assert.deepEqual(computeRatingSummary([]), { average: 0, count: 0 });
  });
  it("averages and rounds to one decimal", () => {
    // (5+4+4) / 3 = 4.333 → 4.3
    assert.deepEqual(computeRatingSummary([5, 4, 4]), { average: 4.3, count: 3 });
  });
  it("filters out-of-range ratings before averaging", () => {
    // 6 and 0 dropped; (5+3)/2 = 4
    assert.deepEqual(computeRatingSummary([5, 6, 0, 3]), { average: 4, count: 2 });
  });
  it("handles a single review", () => {
    assert.deepEqual(computeRatingSummary([5]), { average: 5, count: 1 });
  });
});

// ---------------------------------------------------------------------------
// Two-sided reviews (W8)
// ---------------------------------------------------------------------------

describe("canTalentReviewClient — talent → client eligibility", () => {
  const now = T("2026-06-03T12:00:00Z");
  const completed = {
    status: "completed",
    paymentStatus: "unpaid",
    endsAt: null,
    eventDate: "2026-06-01",
    now,
  };

  it("allows a talent ON the booking when the booking is reviewable", () => {
    assert.equal(
      canTalentReviewClient({
        callerTalentProfileIds: ["tp-1", "tp-2"],
        bookingTalentProfileIds: ["tp-9", "tp-1"],
        eligibility: completed,
      }),
      true,
    );
  });

  it("rejects a talent NOT on the booking even when reviewable", () => {
    assert.equal(
      canTalentReviewClient({
        callerTalentProfileIds: ["tp-1"],
        bookingTalentProfileIds: ["tp-9", "tp-8"],
        eligibility: completed,
      }),
      false,
    );
  });

  it("rejects a talent on the booking when the booking is NOT reviewable", () => {
    assert.equal(
      canTalentReviewClient({
        callerTalentProfileIds: ["tp-1"],
        bookingTalentProfileIds: ["tp-1"],
        eligibility: {
          status: "confirmed",
          paymentStatus: "paid",
          endsAt: "2026-06-10T20:00:00Z", // future
          eventDate: null,
          now,
        },
      }),
      false,
    );
  });

  it("rejects when the caller has no talent profiles", () => {
    assert.equal(
      canTalentReviewClient({
        callerTalentProfileIds: [],
        bookingTalentProfileIds: ["tp-1"],
        eligibility: completed,
      }),
      false,
    );
  });
});

describe("canReportReview — only the SUBJECT may report", () => {
  it("talent-subject: the reviewed talent's user can report", () => {
    assert.equal(
      canReportReview({
        kind: "talent",
        callerUserId: "u-talent",
        subjectTalentUserId: "u-talent",
      }),
      true,
    );
  });

  it("talent-subject: a different user cannot report", () => {
    assert.equal(
      canReportReview({
        kind: "talent",
        callerUserId: "u-other",
        subjectTalentUserId: "u-talent",
      }),
      false,
    );
  });

  it("talent-subject: missing subject owner → cannot report", () => {
    assert.equal(
      canReportReview({
        kind: "talent",
        callerUserId: "u-talent",
        subjectTalentUserId: null,
      }),
      false,
    );
  });

  it("client-subject: the reviewed client can report", () => {
    assert.equal(
      canReportReview({
        kind: "client",
        callerUserId: "u-client",
        subjectClientUserId: "u-client",
      }),
      true,
    );
  });

  it("client-subject: a different user cannot report", () => {
    assert.equal(
      canReportReview({
        kind: "client",
        callerUserId: "u-talent",
        subjectClientUserId: "u-client",
      }),
      false,
    );
  });

  it("empty caller id → cannot report either kind", () => {
    assert.equal(
      canReportReview({
        kind: "client",
        callerUserId: "",
        subjectClientUserId: "u-client",
      }),
      false,
    );
    assert.equal(
      canReportReview({
        kind: "talent",
        callerUserId: "",
        subjectTalentUserId: "u-talent",
      }),
      false,
    );
  });
});
