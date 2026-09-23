import type { BuiltinLookEntry } from "../types";
import { buildBuiltinLookPayload, swatchFromLookTokens } from "./_shared";

const PRESET_SLUG = "editorial-bridal";
const TOKENS = buildBuiltinLookPayload(PRESET_SLUG).tokens;

/** EDITORIAL — seeded from the `editorial-bridal` preset: warm ivory canvas, serif italic accents. */
export const editorialLook: BuiltinLookEntry = {
  kind: "look",
  slug: "editorial",
  title: "Editorial",
  summary: "Ivory canvas, espresso ink, soft blush accent, serif-editorial type pairing.",
  category: null,
  tags: ["serif", "ivory", "bridal"],
  required_talent_tier: "talent_basic",
  sort_order: 40,
  is_new_until: null,
  preview: { swatch: swatchFromLookTokens(TOKENS) },
  buildPayload: () => buildBuiltinLookPayload(PRESET_SLUG),
};
