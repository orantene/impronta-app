/**
 * "Review your website" / resume summary line (F33, 2026-09-30).
 *
 * The line names the APPLIED design and look, read from the saved site row:
 * the gallery design's own name (never a hardcoded "Maison"), then custom
 * colours, a Maison palette (Maison only), the design's palette for the saved
 * look slug, or the design default when the saved look is null.
 *
 * Pure.
 */
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { MAISON_PALETTES, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";

type Named = { name: { en: string; es: string } };

export function designSummaryLine(input: {
  designSlug: string | null | undefined;
  lookSlug: string | null | undefined;
  paletteKey: MaisonPaletteKey | null | undefined;
  customPalette: Named | null | undefined;
  /** Third segment ("Your content", a status label, ...). */
  tail: string;
  locale: "en" | "es";
}): string {
  const design = getGalleryDesign(input.designSlug || "maison") ?? getGalleryDesign("maison");
  const isMaison = !design || design.slug === "maison";
  const designPalette = isMaison
    ? null
    : (design!.palettes.find((p) => p.key === input.lookSlug) ?? design!.palettes[0] ?? null);
  const paletteName = input.customPalette
    ? input.customPalette.name[input.locale]
    : isMaison && input.paletteKey && MAISON_PALETTES[input.paletteKey]
      ? MAISON_PALETTES[input.paletteKey].name[input.locale]
      : designPalette
        ? designPalette.name[input.locale]
        : input.locale === "es"
          ? "Colores"
          : "Colors";
  return [design?.name ?? "Maison", paletteName, input.tail].join(" · ");
}
