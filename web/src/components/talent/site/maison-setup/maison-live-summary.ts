/** Live "My website" card summary helpers (pure; unit-tested). */
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { MAISON_PALETTES, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import type { MaisonSetupLocale } from "./maison-setup-copy";

export function lookToPalette(lookSlug: string | null): MaisonPaletteKey | null {
  if (!lookSlug?.startsWith("maison-")) return null;
  const key = lookSlug.slice("maison-".length);
  return key in MAISON_PALETTES ? (key as MaisonPaletteKey) : null;
}

/**
 * Palette label on the live card. A named Maison palette wins; otherwise the
 * live site uses custom colors, so show the saved palette name
 * (default "My colors" / "Mis colores"), never the generic "Colors".
 */
export function liveCardPaletteName(
  locale: MaisonSetupLocale,
  themeLookSlug: string | null,
  customPalette: MaisonCustomPaletteStored | null,
): string {
  const key = lookToPalette(themeLookSlug);
  if (key) return MAISON_PALETTES[key].name[locale === "es" ? "es" : "en"];
  const saved = customPalette?.name[locale === "es" ? "es" : "en"]?.trim();
  if (saved) return saved;
  return locale === "es" ? "Mis colores" : "My colors";
}
