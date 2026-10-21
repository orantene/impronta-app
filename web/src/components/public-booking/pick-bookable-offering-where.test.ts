/**
 * TUL-841: /book's composer must know a service happens at the client's place,
 * otherwise the server asks for an address the page never shows and nobody can
 * finish a booking.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pickBookableOffering } from "./pick-bookable-offering";
import { serviceAddressRule } from "@/lib/scheduling/service-address";
import type { TalentOffering } from "@/lib/talent/offerings-types";

function offering(attributes: Record<string, unknown>): TalentOffering {
  return {
    id: "o1",
    kind: "service",
    durationMinutes: 60,
    bookingMode: "instant",
    talentProfileId: "t1",
    attributes,
  } as unknown as TalentOffering;
}

test("a home-visit service carries where=client so the composer asks for an address", () => {
  const picked = pickBookableOffering([offering({ where: ["client"] })]);
  assert.deepEqual(picked?.where, ["client"]);
  assert.equal(serviceAddressRule(picked?.where), "required");
});

test("a studio service stays address-free", () => {
  const picked = pickBookableOffering([offering({ where: ["studio"] })]);
  assert.equal(serviceAddressRule(picked?.where), "hidden");
});

test("an offering with no where at all is address-free", () => {
  const picked = pickBookableOffering([offering({})]);
  assert.equal(serviceAddressRule(picked?.where), "hidden");
});
