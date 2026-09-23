import type { BuiltinLookEntry } from "../types";
import { buildBuiltinLookPayload, swatchFromLookTokens } from "./_shared";

const PRESET_SLUG = "neutral";
const TOKENS = buildBuiltinLookPayload(PRESET_SLUG).tokens;

/** SOFT — seeded from the `neutral` preset: zero-brand-hue monochrome, gentle and unopinionated. */
export const softLook: BuiltinLookEntry = {
  kind: "look",
  slug: "soft",
  title: "Soft",
  summary: "Zero brand colour: white canvas, near-black type, monochrome accent.",
  category: null,
  tags: ["monochrome", "sans", "neutral"],
  required_talent_tier: "talent_basic",
  sort_order: 20,
  is_new_until: null,
  preview: { swatch: swatchFromLookTokens(TOKENS) },
  buildPayload: () => buildBuiltinLookPayload(PRESET_SLUG),
};
