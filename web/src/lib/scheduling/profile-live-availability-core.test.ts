/**
 * TUL-861: the profile badge "Available N of the next 30 days" must not promise what the
 * booking sheet refuses. It hides only when every public bookable service is cleanly empty.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { PublicOpenTimesResult } from "./public-open-times";
import { badgeFromLiveDays, liveOpenDays, liveSlotsAllEmpty } from "./profile-live-availability-core";

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

describe("TUL-861: the badge count is the live day count", () => {
  const base = { nextAvailableDate: "2100-01-01", availableDaysInNext30: 30, availabilityDots14d: null };
  const at = (daysAhead: number): string => new Date(Date.UTC(2099, 0, 5 + daysAhead, 17, 0)).toISOString();
  const res = (slots: string[]): PublicOpenTimesResult => ({ ok: true, slots, timezone: "America/Cancun" });

  it("counts distinct days across services, not the matview's 30", () => {
    const days = liveOpenDays([res([at(0), at(0), at(2)]), res([at(2), at(4)])]);
    assert.deepEqual(days, ["2099-01-05", "2099-01-07", "2099-01-09"]);
    const badge = badgeFromLiveDays(base, days ?? [], new Date(Date.UTC(2099, 0, 5, 12, 0)));
    assert.equal(badge.availableDaysInNext30, 3);
    assert.equal(badge.nextAvailableDate, "2099-01-05");
    assert.equal(badge.availabilityDots14d?.length, 14);
  });

  it("returns null (keep the matview) when no answer was usable", () => {
    assert.equal(liveOpenDays([failed]), null);
  });
});

describe("TUL-861: request link and no double services (static)", () => {
  it("the slot picker keeps the request link when times exist", () => {
    const src = readFileSync("src/components/public-booking/SlotPicker.tsx", "utf8");
    assert.match(src, /data-testid="slot-picker-request"/);
    assert.match(src, /public\.slotPicker\.sendRequest/);
  });
  it("the book page drops request rows already in the bookable list", () => {
    const src = readFileSync("src/app/(public)/book/page.tsx", "utf8");
    assert.match(src, /bookableIds\.has\(i\.offeringId\)/);
  });
});
