/**
 * New sign-ups get the released Maison v2 design (v1's header renders white on
 * white on new sites, DS-59 / E-09). The 1D pick only chooses the v2 palette;
 * no pick means "rose". Pure, so the default is testable without the server.
 */
import { MAISON_DEFAULT_PALETTE_KEY } from "@/lib/talent-site/theme-catalog/maison/seed";

import { DESIGN_LOOK_KEYS, type DesignLookKey } from "./finish-url";

export const ONBOARDING_DESIGN_SLUG = "maison-v2";
export const ONBOARDING_DEFAULT_PALETTE: DesignLookKey = DESIGN_LOOK_KEYS[0];

export function onboardingDesignApplyInput(choice: DesignLookKey | string | null | undefined): {
  paletteKey: typeof MAISON_DEFAULT_PALETTE_KEY;
  designSlug: string;
  galleryPaletteKey: DesignLookKey;
} {
  const known = (DESIGN_LOOK_KEYS as readonly string[]).includes(choice ?? "");
  return {
    paletteKey: MAISON_DEFAULT_PALETTE_KEY,
    designSlug: ONBOARDING_DESIGN_SLUG,
    galleryPaletteKey: known ? (choice as DesignLookKey) : ONBOARDING_DEFAULT_PALETTE,
  };
}
