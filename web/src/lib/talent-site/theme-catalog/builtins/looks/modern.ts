import type { BuiltinLookEntry } from "../types";
import { buildBuiltinLookPayload, swatchFromLookTokens } from "./_shared";

const PRESET_SLUG = "modern-2026";
const TOKENS = buildBuiltinLookPayload(PRESET_SLUG).tokens;

/** MODERN — seeded from the `modern-2026` preset: clean white canvas, near-black type, sky-blue accent. */
export const modernLook: BuiltinLookEntry = {
  kind: "look",
  slug: "modern",
  title: "Modern",
  summary: "Clean white canvas, near-black type, sky-blue accent, system sans.",
  category: null,
  tags: ["light", "sans", "sky-blue"],
  required_talent_tier: "talent_basic",
  sort_order: 10,
  is_new_until: null,
  preview: { swatch: swatchFromLookTokens(TOKENS) },
  buildPayload: () => buildBuiltinLookPayload(PRESET_SLUG),
};
