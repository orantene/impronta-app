import type { BuiltinLookEntry } from "../types";
import { buildBuiltinLookPayload, swatchFromLookTokens } from "./_shared";

const PRESET_SLUG = "studio-minimal";
const TOKENS = buildBuiltinLookPayload(PRESET_SLUG).tokens;

/** STUDIO — seeded from the `studio-minimal` preset: monochrome, sharp-edged, gallery-quiet. */
export const studioLook: BuiltinLookEntry = {
  kind: "look",
  slug: "studio",
  title: "Studio",
  summary: "Monochrome and sharp-edged, larger type scale. For work that should speak for itself.",
  category: null,
  tags: ["monochrome", "sharp", "editorial-scale"],
  required_talent_tier: "talent_basic",
  sort_order: 50,
  is_new_until: null,
  preview: { swatch: swatchFromLookTokens(TOKENS) },
  buildPayload: () => buildBuiltinLookPayload(PRESET_SLUG),
};
