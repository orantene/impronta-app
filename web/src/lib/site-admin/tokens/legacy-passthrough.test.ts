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

// ── write-shape regressions ────────────────────────────────────────────────
// The design server ops compose their DB writes as
// `{ ...gate.normalized, ...legacy }`. These pin that composition so a future
// refactor that writes `gate.normalized` alone fails here instead of silently
// deleting a tenant's logo (2026-08-15 incident).

test("saveDesignDraft shape: stored draft's legacy keys survive a token-only patch", () => {
  const storedDraft = {
    "card.surface": "#0f0f0f",
    logo_url: "https://x/logo.png",
    watermark_preset: { enabled: true },
  };
  const patch = { "card.surface": "#101018" };
  const merged = { ...storedDraft, ...patch };
  const split = splitLegacyThemeKeys(merged);
  const gate = validateThemePatch(split.registryCandidate);
  assert.equal(gate.ok, true);
  const written = { ...(gate.ok ? gate.normalized : {}), ...split.legacy };
  assert.equal(written["card.surface"], "#101018");
  assert.equal(written.logo_url, "https://x/logo.png");
  assert.deepEqual(written.watermark_preset, { enabled: true });
});

test("publishDesign shape: LIVE legacy keys survive when the draft has none", () => {
  const live = { "card.surface": "#000", logo_url: "https://x/live-logo.png" };
  const draft = { "card.surface": "#101018" };
  const draftSplit = splitLegacyThemeKeys(draft);
  const gate = validateThemePatch(draftSplit.registryCandidate);
  const liveLegacy = {
    ...splitLegacyThemeKeys(live).legacy,
    ...draftSplit.legacy,
  };
  const written = { ...(gate.ok ? gate.normalized : {}), ...liveLegacy };
  assert.equal(written["card.surface"], "#101018", "token publishes");
  assert.equal(written.logo_url, "https://x/live-logo.png", "logo must NOT be dropped");
});

test("applyThemePreset shape: a site preset cannot delete the logo from the draft", () => {
  const storedDraft = {
    "card.surface": "#0f0f0f",
    logo_url: "https://x/logo.png",
    favicon_url: "https://x/fav.png",
  };
  const presetTokens = { "card.surface": "#ffffff", "typography.heading-preset": "sans" };
  const merged = { ...storedDraft, ...presetTokens };
  const split = splitLegacyThemeKeys(merged);
  const gate = validateThemePatch(split.registryCandidate);
  const written = { ...gate.normalized, ...split.legacy };
  assert.equal(written["card.surface"], "#ffffff", "preset wins on its tokens");
  assert.equal(written.logo_url, "https://x/logo.png");
  assert.equal(written.favicon_url, "https://x/fav.png");
});
