import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIRST_DAY_STEPS,
  firstDayCompletedStepIds,
  hasBookingHoursWindows,
  isFirstDayEligible,
} from "./first-day";
import type { BookingHours } from "@/lib/scheduling/hours-types";

const emptyWeekly = {
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
} as BookingHours["weekly"];

const hoursOpen: BookingHours = {
  timezone: "UTC",
  weekly: { ...emptyWeekly, 1: [{ startMin: 9 * 60, endMin: 17 * 60 }] },
  exceptions: [],
  slotMinutes: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  horizonDays: 30,
};

describe("hasBookingHoursWindows", () => {
  it("is false for null or empty weeks", () => {
    assert.equal(hasBookingHoursWindows(null), false);
    assert.equal(
      hasBookingHoursWindows({ ...hoursOpen, weekly: emptyWeekly }),
      false,
    );
  });
  it("is true when a weekday has a window", () => {
    assert.equal(hasBookingHoursWindows(hoursOpen), true);
  });
});

describe("firstDayCompletedStepIds", () => {
  it("uses missing keys when provided", () => {
    const done = firstDayCompletedStepIds({
      missingKeys: ["media", "location"],
      profileCode: "abc",
      workflowStatus: "draft",
      hours: hoursOpen,
    });
    assert.deepEqual(done, ["services", "availability", "preview"]);
  });
  it("falls back to profile signals without completion", () => {
    const done = firstDayCompletedStepIds({
      portfolioCount: 2,
      primaryTypeLabel: "Dancer",
      homeCity: "CDMX",
      profileCode: null,
      hours: null,
    });
    assert.deepEqual(done, ["photo", "services", "location"]);
  });
});

describe("isFirstDayEligible", () => {
  it("requires empty agenda and incomplete steps", () => {
    assert.equal(
      isFirstDayEligible({
        agendaItemCount: 0,
        completedStepIds: ["photo"],
      }),
      true,
    );
    assert.equal(
      isFirstDayEligible({
        agendaItemCount: 1,
        completedStepIds: ["photo"],
      }),
      false,
    );
    assert.equal(
      isFirstDayEligible({
        agendaItemCount: 0,
        completedStepIds: [...FIRST_DAY_STEPS],
      }),
      false,
    );
    assert.equal(
      isFirstDayEligible({
        loadError: "fail",
        agendaItemCount: 0,
        completedStepIds: [],
      }),
      false,
    );
  });
});
