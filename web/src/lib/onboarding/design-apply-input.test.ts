import assert from "node:assert/strict";
import test from "node:test";

import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

import { onboardingDesignApplyInput } from "./design-apply-input";
import { DESIGN_LOOK_KEYS } from "./finish-url";

test("no pick applies Maison v2 with the rose palette", () => {
  const a = onboardingDesignApplyInput(null);
  assert.equal(a.designSlug, "maison-v2");
  assert.equal(a.galleryPaletteKey, "rose");
});

test("each offered key is passed through", () => {
  for (const k of DESIGN_LOOK_KEYS) assert.equal(onboardingDesignApplyInput(k).galleryPaletteKey, k);
});

test("an old v1 key falls back to rose", () => {
  for (const k of ["pink", "pearl", "sand", "lilac"]) assert.equal(onboardingDesignApplyInput(k).galleryPaletteKey, "rose");
});

test("every offered key is a real v2 gallery palette", () => {
  const keys = getGalleryDesign("maison-v2")?.palettes.map((p) => p.key) ?? [];
  for (const k of DESIGN_LOOK_KEYS) assert.ok(keys.includes(k), k);
});
