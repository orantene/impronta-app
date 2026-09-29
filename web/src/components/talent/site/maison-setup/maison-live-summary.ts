/** Live "My website" card summary helpers (pure; unit-tested). */
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { MAISON_PALETTES, MAISON_SEED, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

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

/**
 * Design name on the live card for ANY published design slug: Maison from its
 * seed, collection designs (maison-v2, solace, mono, frame, folio) from
 * COLLECTION_DESIGNS. Unknown slug → "Your design"; never "Maison" by default.
 */
export function liveDesignName(locale: MaisonSetupLocale, designSlug: string | null): string {
  const slug = designSlug?.trim().toLowerCase() ?? "";
  if (slug === "maison" || slug === MAISON_SEED.theme.key) return MAISON_SEED.theme.name;
  const hit = COLLECTION_DESIGNS.find((d) => d.slug === slug);
  if (hit) return hit.title;
  return locale === "es" ? "Tu diseño" : "Your design";
}

/**
 * Design label on the live card. A design slug names its design. A site with
 * no design slug was built by hand: when the talent's profile template is the
 * original Maison layout, say so ("Maison (original)"); otherwise the honest
 * name is "Custom design".
 */
export function liveCardDesignLabel(input: {
  locale: MaisonSetupLocale;
  designSlug: string | null;
  legacyProfileTemplate: string | null;
}): string {
  const { locale, designSlug, legacyProfileTemplate } = input;
  if (designSlug?.trim()) return liveDesignName(locale, designSlug);
  if (legacyProfileTemplate?.trim().toLowerCase() === "maison") {
    return maisonSetupT(locale, "Maison (original)");
  }
  return maisonSetupT(locale, "Custom design");
}

/**
 * Palette part of the live card summary for a site with no catalog design:
 * "Your colors" only when a custom palette is saved, otherwise omitted (null).
 */
export function legacyPaletteLabel(
  locale: MaisonSetupLocale,
  customPalette: MaisonCustomPaletteStored | null,
): string | null {
  if (!customPalette) return null;
  return maisonSetupT(locale, "Your colors");
}
