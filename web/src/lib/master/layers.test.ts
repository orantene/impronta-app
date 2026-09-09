import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEPARATION_LAYERS,
  effectiveAvailability,
  previewSettingsReset,
  resolveSettingsValue,
  activitiesForCapabilities,
} from "./layers";

test("five layers stay enumerated and distinct", () => {
  assert.equal(SEPARATION_LAYERS.length, 5);
  assert.deepEqual([...SEPARATION_LAYERS], [
    "activities",
    "capabilities",
    "role_relationship",
    "vocabulary_preset",
    "visual_theme",
  ]);
});

test("effective availability names every blocking layer", () => {
  const r = effectiveAvailability({
    capability: true,
    permission: false,
    ownership: false,
    recordAllows: true,
  });
  assert.equal(r.available, false);
  if (!r.available) {
    assert.deepEqual(r.blockedBy, ["permission", "ownership"]);
  }
});

test("settings inheritance prefers user preference then override", () => {
  assert.deepEqual(
    resolveSettingsValue({
      platform: "A",
      workspacePreset: "B",
      override: "C",
      userPreference: "D",
    }),
    { value: "D", source: "user_preference" },
  );
  assert.deepEqual(
    resolveSettingsValue({ platform: "A", workspacePreset: "B", override: null }),
    { value: "B", source: "workspace_preset" },
  );
});

test("reset preview lists only keys that would change", () => {
  const preview = previewSettingsReset({
    current: { locale: "es", density: "compact", accent: "coral" },
    platform: { locale: "en", density: "comfortable", accent: "coral" },
    workspacePreset: { locale: "en", density: "comfortable", accent: "ink" },
  });
  assert.deepEqual(preview.changingKeys.sort(), ["accent", "density", "locale"]);
  assert.equal(preview.after.accent, "ink");
});

test("capabilities project to activities without inventing extras", () => {
  assert.deepEqual(activitiesForCapabilities(["pos", "menu", "events"]), [
    "pos",
    "catalog",
    "events",
  ]);
});
