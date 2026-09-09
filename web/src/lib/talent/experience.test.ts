import { test } from "node:test";
import assert from "node:assert/strict";
import { mayAcceptAssignment, classifyOfferingOwnership, TALENT_DESTINATIONS } from "./experience";

test("talent destinations cover Master §8", () => {
  assert.ok(TALENT_DESTINATIONS.includes("earnings"));
  assert.ok(TALENT_DESTINATIONS.includes("my_services"));
});

test("accept refuses when the talent is busy", () => {
  assert.deepEqual(mayAcceptAssignment({ talentFree: false, alreadyAccepted: false }), {
    ok: false,
    reason: "busy",
  });
});

test("my services distinguishes owned from represented", () => {
  assert.equal(
    classifyOfferingOwnership({
      talentProfileId: "t1",
      ownerTalentProfileId: "t1",
      representedByTenant: false,
    }),
    "owned",
  );
  assert.equal(
    classifyOfferingOwnership({
      talentProfileId: "t1",
      ownerTalentProfileId: "t2",
      representedByTenant: true,
    }),
    "represented",
  );
});
