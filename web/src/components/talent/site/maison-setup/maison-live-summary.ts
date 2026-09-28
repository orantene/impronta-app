/** Live "My website" card summary helpers (pure; unit-tested). */
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { MAISON_PALETTES, MAISON_SEED, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
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
