import { test } from "node:test";
import assert from "node:assert/strict";

import { canUsePitchFeature } from "./pitch-plan-gate";

// Pitch tools are a REPRESENTATION feature — they exist to shop a roster of
// people at a client. The `website` tier has no roster at all (seat cap 0), so
// it must never qualify, and nothing about adding the tier should silently
// grant it. The gate excludes website by omission from PITCH_ELIGIBLE_PLANS,
// which is exactly the kind of implicit pass that a later refactor can undo
// without anyone noticing — so pin it.
test("the website tier can never use pitch tools", () => {
  assert.equal(canUsePitchFeature("website"), false);
});

test("free stays excluded and the paid representation tiers stay included", () => {
  assert.equal(canUsePitchFeature("free"), false);

  for (const plan of ["studio", "agency", "network", "legacy"] as const) {
    assert.equal(canUsePitchFeature(plan), true, `${plan} must keep pitch access`);
  }
});
