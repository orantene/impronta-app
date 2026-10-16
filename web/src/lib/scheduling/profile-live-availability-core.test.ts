/**
 * TUL-861: the profile badge "Available N of the next 30 days" must not promise what the
 * booking sheet refuses. It hides only when every public bookable service is cleanly empty.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicOpenTimesResult } from "./public-open-times";
import { liveSlotsAllEmpty } from "./profile-live-availability-core";

const empty = (reason?: "no_booking_hours" | "fully_booked"): PublicOpenTimesResult => ({ ok: true, slots: [], reason: reason ?? null });
// Relative to now, so the fixture never goes stale (test-fixed-dates guard).
const open: PublicOpenTimesResult = { ok: true, slots: [new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()] };
const failed: PublicOpenTimesResult = { ok: false, status: 500, error: "query_failed" };

describe("liveSlotsAllEmpty", () => {
  it("hides the badge when every service has no times, whatever the reason", () => {
    assert.equal(liveSlotsAllEmpty([empty("no_booking_hours")]), true);
    assert.equal(liveSlotsAllEmpty([empty("fully_booked"), empty()]), true);
  });

  it("keeps the badge when any service has an open time", () => {
    assert.equal(liveSlotsAllEmpty([empty(), open]), false);
    assert.equal(liveSlotsAllEmpty([open]), false);
  });

  it("keeps the badge when an answer is unknown (a failed read never blanks it)", () => {
    assert.equal(liveSlotsAllEmpty([empty(), failed]), false);
    assert.equal(liveSlotsAllEmpty([failed]), false);
  });

  it("keeps the badge when there is no service to check", () => {
    assert.equal(liveSlotsAllEmpty([]), false);
  });
});
