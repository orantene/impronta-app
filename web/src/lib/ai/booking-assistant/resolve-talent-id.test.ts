import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBookingAssistantTalentId } from "./resolve-talent-id";

test("prefers inquiry_participants talent over selected_ids", () => {
  assert.equal(
    resolveBookingAssistantTalentId({
      fromParticipants: "tp-participant",
      selectedIds: ["tp-lineup"],
    }),
    "tp-participant",
  );
});

test("falls back to first selected_ids when participants empty (early draft)", () => {
  assert.equal(
    resolveBookingAssistantTalentId({
      fromParticipants: null,
      selectedIds: ["tp-a", "tp-b"],
    }),
    "tp-a",
  );
  assert.equal(
    resolveBookingAssistantTalentId({
      fromParticipants: "  ",
      selectedIds: ["", "tp-b"],
    }),
    "tp-b",
  );
});

test("returns null when neither source has a talent", () => {
  assert.equal(
    resolveBookingAssistantTalentId({ fromParticipants: null, selectedIds: [] }),
    null,
  );
  assert.equal(
    resolveBookingAssistantTalentId({ fromParticipants: undefined, selectedIds: null }),
    null,
  );
});
