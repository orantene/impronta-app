import type { BuiltinLookEntry } from "../types";
import { buildBuiltinLookPayload, swatchFromLookTokens } from "./_shared";

const PRESET_SLUG = "editorial-noir";
const TOKENS = buildBuiltinLookPayload(PRESET_SLUG).tokens;

/** NOIR — seeded from the `editorial-noir` preset: black canvas, ivory type, gold accents, serif display. */
export const noirLook: BuiltinLookEntry = {
  kind: "look",
  slug: "noir",
  title: "Noir",
  summary: "Black canvas, bright-gold accents, serif headlines. The cinematic register.",
  category: null,
  tags: ["dark", "gold", "serif"],
  required_talent_tier: "talent_basic",
  sort_order: 60,
  is_new_until: null,
  preview: { swatch: swatchFromLookTokens(TOKENS) },
  buildPayload: () => buildBuiltinLookPayload(PRESET_SLUG),
};
