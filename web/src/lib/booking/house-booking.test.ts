import test from "node:test";
import assert from "node:assert/strict";

import {
  houseBookingModeFor,
  houseOfferingIsSlotBookable,
  isHouseOwnedOffering,
} from "./house-booking";

type Offering = {
  talentProfileId: string | null;
  capacityPoolId: string | null;
  durationMinutes: number | null;
};

const HOUSE: Offering = {
  talentProfileId: null,
  capacityPoolId: "pool-1",
  durationMinutes: 30,
};
const TALENT: Offering = {
  talentProfileId: "talent-1",
  capacityPoolId: "pool-1",
  durationMinutes: 30,
};
const AGENCY_HOST = { kind: "agency", tenantId: "t1" };

test("the absence of a talent is what makes an offering house-owned", () => {
  assert.equal(isHouseOwnedOffering(HOUSE), true);
  assert.equal(isHouseOwnedOffering(TALENT), false);
  assert.equal(isHouseOwnedOffering({ talentProfileId: "" } as Offering), true);
});

test("a house service is slot-bookable only with BOTH a pool and a duration", () => {
  // The pool is the half that is new. Before Capacity 0.2 there was nowhere to
  // hold a house booking even if the page had rendered it, which is what makes
  // the difference between a menu item (bought) and a service (booked).
  assert.equal(houseOfferingIsSlotBookable(HOUSE), true);
  assert.equal(houseOfferingIsSlotBookable({ ...HOUSE, capacityPoolId: null }), false);
  assert.equal(houseOfferingIsSlotBookable({ ...HOUSE, durationMinutes: null }), false);
  assert.equal(houseOfferingIsSlotBookable({ ...HOUSE, durationMinutes: 0 }), false);
});

test("a talent offering is never treated as house-owned", () => {
  // The two paths must not overlap: a person's calendar has rules a chair does
  // not, and quietly routing a talent through the house path would drop them.
  assert.equal(houseOfferingIsSlotBookable(TALENT), false);
  assert.equal(houseBookingModeFor(TALENT, AGENCY_HOST), "inquire");
});

test("a bookable house service on a real host is instant", () => {
  // This is the whole fix: a salon's /book page was empty by construction.
  assert.equal(houseBookingModeFor(HOUSE, AGENCY_HOST), "instant");
  assert.equal(houseBookingModeFor(HOUSE, { kind: "talent_site" }), "instant");
  assert.equal(houseBookingModeFor(HOUSE, { kind: "hub" }), "instant");
});

test("an unknown host kind falls back to inquire, using THEIR rule", () => {
  // `bookingSurfaceFromHost` is the Appointments Manager's; this calls it
  // rather than restating it, so a host-kind change lands in both paths at once.
  assert.equal(houseBookingModeFor(HOUSE, { kind: "marketing" }), "inquire");
  assert.equal(houseBookingModeFor(HOUSE, { kind: "" }), "inquire");
});

test("anything not clearly bookable degrades to inquire, never to instant", () => {
  // The safe direction. An enquiry always works; offering an instant slot the
  // engine cannot hold takes a customer to a refusal instead of a booking.
  const broken: Offering[] = [
    { ...HOUSE, capacityPoolId: null },
    { ...HOUSE, durationMinutes: null },
    { ...HOUSE, durationMinutes: -30 },
    { ...HOUSE, durationMinutes: Number.NaN },
  ];
  for (const offering of broken) {
    assert.equal(
      houseBookingModeFor(offering, AGENCY_HOST),
      "inquire",
      JSON.stringify(offering),
    );
  }
});

test("the mode values match the Appointments union exactly", () => {
  // Sharing the type is what makes this one resolver with two entry points
  // rather than two implementations. A house mode that was not a
  // TalentBookingMode would fork the submit gate.
  const modes = new Set([
    houseBookingModeFor(HOUSE, AGENCY_HOST),
    houseBookingModeFor(TALENT, AGENCY_HOST),
    houseBookingModeFor(HOUSE, { kind: "other" }),
  ]);
  for (const mode of modes) {
    assert.ok(["inquire", "request", "instant"].includes(mode), mode);
  }
});
