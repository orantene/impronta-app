import assert from "node:assert/strict";
import test from "node:test";

import {
  POLAROIDS_FIELD_KEY,
  isModelLikeTalentTypeSlug,
  shouldShowPolaroidsSection,
} from "./profile-polaroids-policy";

test("model-like talent type slugs are detected across legacy and taxonomy slugs", () => {
  assert.equal(isModelLikeTalentTypeSlug("model"), true);
  assert.equal(isModelLikeTalentTypeSlug("fashion"), true);
  assert.equal(isModelLikeTalentTypeSlug("runway-model"), true);
  assert.equal(isModelLikeTalentTypeSlug("promotional"), true);
  assert.equal(isModelLikeTalentTypeSlug("dj"), false);
  assert.equal(isModelLikeTalentTypeSlug("performer"), false);
});

test("Polaroids are hidden without a selected model-like type", () => {
  assert.equal(
    shouldShowPolaroidsSection({
      selectedTypeSlugs: ["dj", "singer"],
      newEngineActive: true,
      resolvedFieldKeys: [POLAROIDS_FIELD_KEY],
    }),
    false,
  );
});

test("Polaroids are hidden until the resolver confirms the field is enabled", () => {
  assert.equal(
    shouldShowPolaroidsSection({
      selectedTypeSlugs: ["model"],
      newEngineActive: true,
      resolvedFieldKeys: null,
    }),
    false,
  );
});

test("Polaroids are hidden when the tenant field catalog disables media.polaroids", () => {
  assert.equal(
    shouldShowPolaroidsSection({
      selectedTypeSlugs: ["model"],
      newEngineActive: true,
      resolvedFieldKeys: ["model.height_cm", "media.gallery"],
    }),
    false,
  );
});

test("Polaroids are shown for model-like talent only when the resolved catalog includes the field", () => {
  assert.equal(
    shouldShowPolaroidsSection({
      selectedTypeSlugs: ["commercial-model"],
      newEngineActive: true,
      resolvedFieldKeys: ["model.height_cm", POLAROIDS_FIELD_KEY],
    }),
    true,
  );
});

test("legacy non-engine mode still gates Polaroids to model-like types", () => {
  assert.equal(
    shouldShowPolaroidsSection({
      selectedTypeSlugs: ["fashion"],
      newEngineActive: false,
      resolvedFieldKeys: null,
    }),
    true,
  );
  assert.equal(
    shouldShowPolaroidsSection({
      selectedTypeSlugs: ["chef"],
      newEngineActive: false,
      resolvedFieldKeys: null,
    }),
    false,
  );
});
