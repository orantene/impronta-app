import test from "node:test";
import assert from "node:assert/strict";

import { canManageBilling, deriveHats, derivePreset, deriveWorkRole } from "./nav-context";
import { destinationLabel, DESTINATIONS } from "./destinations";

// Real preset ids, not invented ones. `restaurant` sells a menu and books
// nobody; `salon_barber` books appointments; `agency` turns nothing on.
const CAFE = "restaurant";
const APPOINTMENTS = "salon_barber";

test("a menu with no appointments is a cafe, whatever the team size", () => {
  assert.equal(derivePreset({ industryPreset: CAFE }), "cafe");
  assert.equal(derivePreset({ industryPreset: CAFE, teamMemberCount: 1 }), "cafe");
  assert.equal(derivePreset({ industryPreset: CAFE, teamMemberCount: 40 }), "cafe");
  assert.equal(derivePreset({ industryPreset: "bar_club", teamMemberCount: 12 }), "cafe");
});

test("appointments and at most one person is solo", () => {
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 1 }), "solo");
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 0 }), "solo");
  assert.equal(derivePreset({ industryPreset: "studio_gym", teamMemberCount: 1 }), "solo");
});

test("appointments with a team is hybrid", () => {
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 2 }), "hybrid");
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 9 }), "hybrid");
});

test("the preset derivation fails OPEN to hybrid", () => {
  // hybrid is the shape that hides nothing. An unreadable setting must never
  // relabel or thin out a live workspace's nav.
  assert.equal(derivePreset({ industryPreset: undefined }), "hybrid");
  assert.equal(derivePreset({ industryPreset: null }), "hybrid");
  assert.equal(derivePreset({ industryPreset: 17 }), "hybrid");
  assert.equal(derivePreset({ industryPreset: "not_a_preset" }), "hybrid");
  assert.equal(derivePreset({ industryPreset: "agency", teamMemberCount: 1 }), "hybrid");
  // An unknown team size is not "one person": it falls through, it does not guess.
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS }), "hybrid");
  assert.equal(
    derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: Number.NaN }),
    "hybrid",
  );
});

test("the five membership roles collapse onto three hats", () => {
  assert.equal(deriveWorkRole("owner"), "owner");
  assert.equal(deriveWorkRole("admin"), "manager");
  assert.equal(deriveWorkRole("manager"), "manager");
  assert.equal(deriveWorkRole("editor"), "assistant");
  assert.equal(deriveWorkRole("viewer"), "assistant");
  assert.equal(deriveWorkRole("  Owner  "), "owner");
});

test("an unknown role fails CLOSED to assistant", () => {
  // Opposite direction from the preset above, on purpose: this one decides
  // whether a person is shown a billing link.
  assert.equal(deriveWorkRole("cashier"), "assistant");
  assert.equal(deriveWorkRole(""), "assistant");
  assert.equal(deriveWorkRole(undefined), "assistant");
  assert.equal(deriveWorkRole({ role: "owner" }), "assistant");
});

test("professional is a fourth hat, not a rung", () => {
  assert.deepEqual(deriveHats({ membershipRole: "owner", hasTalentProfile: true }), {
    role: "owner",
    professional: true,
  });
  assert.deepEqual(deriveHats({ membershipRole: "viewer", hasTalentProfile: true }), {
    role: "assistant",
    professional: true,
  });
  assert.deepEqual(deriveHats({ membershipRole: "owner" }), {
    role: "owner",
    professional: false,
  });
});

test("only an owner manages billing, mirroring roles.ts", () => {
  assert.ok(canManageBilling("owner"));
  assert.ok(!canManageBilling("manager"));
  assert.ok(!canManageBilling("assistant"));
});

test("the derived preset is what the labels read", () => {
  const cafe = derivePreset({ industryPreset: CAFE, teamMemberCount: 6 });
  assert.equal(destinationLabel(DESTINATIONS.catalog, cafe), "Menu and catalog");
  assert.equal(destinationLabel(DESTINATIONS.people, cafe), "Team");

  const solo = derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 1 });
  assert.equal(destinationLabel(DESTINATIONS.catalog, solo), "Services");

  const hybrid = derivePreset({ industryPreset: "agency" });
  assert.equal(destinationLabel(DESTINATIONS.catalog, hybrid), "Catalog");
});
