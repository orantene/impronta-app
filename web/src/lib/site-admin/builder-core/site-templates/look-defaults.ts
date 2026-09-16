/**
 * look-defaults.ts — which Look a family gets when nobody chose one. Kept
 * apart from the composer so the page-less fallback can import it without
 * pulling the write side in.
 */

import type { BusinessFamilyId } from "@/lib/words/business-types";

export const DEFAULT_LOOK_BY_FAMILY: Readonly<Record<BusinessFamilyId, string>> = {
  dining: "ember",
  beauty: "editorial",
  wellness: "coastal",
  fitness: "bold",
  events: "night",
  agency: "editorial",
  professional: "classic",
  education: "playful",
  hospitality: "studio",
  craft: "warm",
  tours: "coastal",
  custom: "minimal",
};
