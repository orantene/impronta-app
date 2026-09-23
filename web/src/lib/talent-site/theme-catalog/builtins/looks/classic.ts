import type { BuiltinLookEntry } from "../types";
import { buildBuiltinLookPayload, swatchFromLookTokens } from "./_shared";

const PRESET_SLUG = "classic";
const TOKENS = buildBuiltinLookPayload(PRESET_SLUG).tokens;

/** CLASSIC — seeded from the `classic` preset: the Impronta / Nova legacy sans register. */
export const classicLook: BuiltinLookEntry = {
  kind: "look",
  slug: "classic",
  title: "Classic",
  summary: "Sans-first, crisp shadows, sky-blue accent. The platform's original register.",
  category: null,
  tags: ["sans", "crisp", "legacy"],
  required_talent_tier: "talent_basic",
  sort_order: 30,
  is_new_until: null,
  preview: { swatch: swatchFromLookTokens(TOKENS) },
  buildPayload: () => buildBuiltinLookPayload(PRESET_SLUG),
};
