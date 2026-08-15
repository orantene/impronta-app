import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LEGACY_THEME_PASSTHROUGH_KEYS,
  splitLegacyThemeKeys,
} from "./legacy-passthrough";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";

test("splitLegacyThemeKeys: separates legacy keys, preserves values verbatim", () => {
  const watermark = { enabled: false, opacity: 0.6 };
  const { registryCandidate, legacy } = splitLegacyThemeKeys({
    "card.surface": "#000000",
    logo_url: "https://x/logo.png",
    favicon_url: "https://x/fav.png",
    watermark_preset: watermark,
  });
  assert.deepEqual(registryCandidate, { "card.surface": "#000000" });
  assert.deepEqual(legacy, {
    logo_url: "https://x/logo.png",
    favicon_url: "https://x/fav.png",
    watermark_preset: watermark,
  });
  // Object values pass through by reference — never re-serialized.
  assert.equal(legacy.watermark_preset, watermark);
});

test("legacy keys are NOT registry tokens (the premise of the passthrough)", () => {
  for (const key of LEGACY_THEME_PASSTHROUGH_KEYS) {
    const result = validateThemePatch({ [key]: "anything" });
    assert.equal(result.ok, false, `${key} unexpectedly became a registry token — drop it from LEGACY_THEME_PASSTHROUGH_KEYS`);
  }
});

test("regression: a draft carrying legacy keys validates once split (the 'card kit could not be applied' bug)", () => {
  const storedDraft = {
    "card.surface": "#0f0f0f",
    logo_url: "https://x/logo.png",
    watermark_preset: { enabled: false },
  };
  // Unsplit: the gate rejects the whole save.
  assert.equal(validateThemePatch(storedDraft).ok, false);
  // Split: the registry slice passes and the legacy slice rides along.
  const { registryCandidate, legacy } = splitLegacyThemeKeys(storedDraft);
  assert.equal(validateThemePatch(registryCandidate).ok, true);
  assert.equal(Object.keys(legacy).length, 2);
});
