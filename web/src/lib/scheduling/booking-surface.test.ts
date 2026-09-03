import test from "node:test";
import assert from "node:assert/strict";

import { resolveAppointmentPolicy } from "./appointment-policy";
import {
  bookingSurfaceFromHost,
  talentBookingModeFromPolicy,
} from "./booking-surface";
import { isSlotEligibleOffering, pickBookableOffering } from "../../components/public-booking/pick-bookable-offering";
import type { TalentOffering } from "../talent/offerings-types";

test("host kind maps to workspace_site / own_page / hub; other kinds stay other", () => {
  assert.equal(bookingSurfaceFromHost("agency"), "workspace_site");
  assert.equal(bookingSurfaceFromHost("talent_site"), "own_page");
  assert.equal(bookingSurfaceFromHost("hub"), "hub");
  assert.equal(bookingSurfaceFromHost("platform"), "other");
  assert.equal(bookingSurfaceFromHost("marketing"), "other");
});

test("policy off or disabled is inquire; request stays request; instant+ climbs to instant", () => {
  assert.equal(
    talentBookingModeFromPolicy({ enabled: false, effectiveMode: "request" }),
    "inquire",
  );
  assert.equal(
    talentBookingModeFromPolicy({ enabled: true, effectiveMode: "off" }),
    "inquire",
  );
  assert.equal(
    talentBookingModeFromPolicy({ enabled: true, effectiveMode: "request" }),
    "request",
  );
  assert.equal(
    talentBookingModeFromPolicy({ enabled: true, effectiveMode: "instant" }),
    "instant",
  );
  assert.equal(
    talentBookingModeFromPolicy({ enabled: true, effectiveMode: "deposit" }),
    "instant",
  );
  assert.equal(
    talentBookingModeFromPolicy({ enabled: true, effectiveMode: "full" }),
    "instant",
  );
});

test("workspace_site characterization: existing AND-gate still produces request", () => {
  const policy = resolveAppointmentPolicy({
    tenant: { enabled: true, allowTalentDirectBooking: true },
    talent: { profileKind: "person", directBookingOptIn: true },
    planTier: "free",
    offering: { bookingMode: "request", durationMinutes: 30 },
  });
  assert.equal(policy.enabled, true);
  assert.equal(talentBookingModeFromPolicy(policy), "request");
});

function fakeOffering(partial: Partial<TalentOffering> & Pick<TalentOffering, "id">): TalentOffering {
  return {
    talentProfileId: "t1",
    ownerKind: "talent",
    tenantId: "agency-1",
    kind: "service",
    title: "Cut",
    description: null,
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 4000,
    currency: "USD",
    bookingMode: "request",
    reserveMode: "full",
    depositPct: null,
    allowPayInPerson: false,
    requireAccountToBook: false,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: 30,
    category: null,
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: 0,
    attributes: {},
    imageUrls: [],
    ...partial,
  };
}

test("b1: pickBookableOffering never falls back to a zero-duration offering", () => {
  const inquireOnly = fakeOffering({ id: "pkg", durationMinutes: 0, title: "Day rate" });
  assert.equal(isSlotEligibleOffering(inquireOnly), false);
  assert.equal(pickBookableOffering([inquireOnly]), null);

  const bookable = fakeOffering({ id: "cut", durationMinutes: 45 });
  const picked = pickBookableOffering([inquireOnly, bookable]);
  assert.equal(picked?.offeringId, "cut");
  assert.equal(picked?.durationMinutes, 45);
});

test("b1: products are never slot-eligible", () => {
  const product = fakeOffering({ id: "oil", kind: "product", durationMinutes: 30 });
  assert.equal(isSlotEligibleOffering(product), false);
  assert.equal(pickBookableOffering([product]), null);
});
