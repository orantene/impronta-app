import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWebsiteEligibility } from "./website-eligibility";

const full = {
  hasNameAndWork: true,
  photoCount: 3,
  bookableCount: 1,
  hasIntro: true,
  hasAvailability: true,
  hasPlace: true,
};

describe("getWebsiteEligibility", () => {
  it("weights 20 / 30 / 28 / 10 / 6 / 6", () => {
    const result = getWebsiteEligibility(full);
    assert.equal(result.percent, 100);
    assert.deepEqual(
      result.slices.map((s) => s.weight),
      [20, 30, 28, 10, 6, 6],
    );
    assert.equal(result.unlocked, true);
  });

  it("does not turn an unknown slice into zero", () => {
    const result = getWebsiteEligibility({ ...full, hasAvailability: null });
    assert.equal(result.percent, null);
    assert.equal(result.slices.find((s) => s.key === "when")?.done, null);
    assert.equal(result.unlocked, false);
  });

  it("needs three photos and one bookable thing", () => {
    const result = getWebsiteEligibility({ ...full, photoCount: 2, bookableCount: 0 });
    assert.equal(result.percent, 100 - 30 - 28);
    assert.equal(result.slices.find((s) => s.key === "photos")?.done, false);
    assert.equal(result.slices.find((s) => s.key === "offer")?.done, false);
  });
});
