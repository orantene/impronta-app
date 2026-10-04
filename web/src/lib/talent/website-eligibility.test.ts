import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWebsiteEligibility,
  inferWebsiteWorkingMode,
} from "./website-eligibility";

const fullBookings = {
  hasNameAndWork: true,
  photoCount: 6,
  bookableCount: 3,
  hasIntro: true,
  hasAvailability: true,
  hasPlace: true,
  workingMode: "bookings" as const,
};

describe("getWebsiteEligibility", () => {
  it("bookings mode unlocks at 100 with §4.2 floors", () => {
    const result = getWebsiteEligibility(fullBookings);
    assert.equal(result.percent, 100);
    assert.equal(result.unlocked, true);
    assert.equal(result.workingMode, "bookings");
    assert.equal(
      result.slices.filter((s) => s.required).reduce((n, s) => n + s.weight, 0),
      100,
    );
  });

  it("does not turn an unknown required slice into zero", () => {
    const result = getWebsiteEligibility({ ...fullBookings, hasAvailability: null });
    assert.equal(result.percent, null);
    assert.equal(result.slices.find((s) => s.key === "when")?.done, null);
    assert.equal(result.unlocked, false);
  });

  it("bookings needs six photos and three bookable things", () => {
    const result = getWebsiteEligibility({
      ...fullBookings,
      photoCount: 3,
      bookableCount: 1,
    });
    assert.equal(result.slices.find((s) => s.key === "photos")?.done, false);
    assert.equal(result.slices.find((s) => s.key === "offer")?.done, false);
    assert.equal(result.unlocked, false);
  });

  it("inquiries omits offer and when from the score", () => {
    const result = getWebsiteEligibility({
      hasNameAndWork: true,
      photoCount: 6,
      bookableCount: 0,
      hasIntro: true,
      hasAvailability: false,
      hasPlace: true,
      workingMode: "inquiries",
    });
    assert.equal(result.unlocked, true);
    assert.equal(result.percent, 100);
    assert.equal(result.slices.find((s) => s.key === "offer")?.required, false);
    assert.equal(result.slices.find((s) => s.key === "when")?.required, false);
  });

  it("quotes unlocks with two photos and two services", () => {
    const result = getWebsiteEligibility({
      hasNameAndWork: true,
      photoCount: 2,
      bookableCount: 2,
      hasIntro: true,
      hasAvailability: false,
      hasPlace: true,
      workingMode: "quotes",
    });
    assert.equal(result.unlocked, true);
    assert.equal(result.percent, 100);
  });
});

describe("inferWebsiteWorkingMode", () => {
  it("maps common labels", () => {
    assert.equal(inferWebsiteWorkingMode("Fashion Model"), "inquiries");
    assert.equal(inferWebsiteWorkingMode("Private Chef"), "quotes");
    assert.equal(inferWebsiteWorkingMode("Nail Artist"), "bookings");
    assert.equal(inferWebsiteWorkingMode(null), "bookings");
  });
});
