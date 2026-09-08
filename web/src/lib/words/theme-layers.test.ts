import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVocabulary, rosterVisible } from "./theme-layers";

test("vocabulary resolves override then type then family then canonical", () => {
  assert.equal(resolveVocabulary({ override: "menu", typePreset: "services", familyPreset: "packages", canonical: "tickets" }), "menu");
  assert.equal(resolveVocabulary({ typePreset: "services", familyPreset: "packages", canonical: "tickets" }), "services");
  assert.equal(resolveVocabulary({ familyPreset: "packages", canonical: "tickets" }), "packages");
  assert.equal(resolveVocabulary({ canonical: "tickets" }), "tickets");
});

test("solo does not hide roster when members exist", () => {
  assert.equal(rosterVisible({ capabilities: [], hasRosterMembers: true, isSolo: true }), true);
  assert.equal(rosterVisible({ capabilities: ["appointments"], hasRosterMembers: false, isSolo: true }), false);
});
