/**
 * G1-P0-03: Maison nails seed projects to Lía Studio tokens, not the viewer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveMaisonSeedPreviewBundle } from "./seed-preview-tokens";

test("maison seed preview hydrates Lía Studio pack", () => {
  const { hydration, dataSources } = resolveMaisonSeedPreviewBundle();
  assert.equal(hydration.isReal, false);
  assert.equal(hydration.tokens.displayName, "Lía Studio");
  assert.match(hydration.tokens.tagline || "", /Manicura|cita/i);
  assert.ok((dataSources.talentOfferings?.length ?? 0) >= 4);
  assert.ok((dataSources.talentFaqItems?.length ?? 0) >= 1);
  assert.notEqual(hydration.profile.profileCode, "TAL-93900");
  assert.notEqual(hydration.profile.displayName.toLowerCase(), "valeria");
});
