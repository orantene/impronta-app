/**
 * "Review your website" / resume summary line (F33, 2026-09-30).
 *
 * Names the APPLIED design and look through the ONE shared resolver
 * (`appliedThemeLabel`), never a hardcoded "Maison": custom colours first,
 * else the saved look (a Maison palette key maps to its `maison-*` slug); a
 * null look is the design's own colours and names no palette.
 *
 * Pure.
 */
import { appliedThemeLabel } from "@/lib/talent-site/theme-catalog/applied-theme-label";
import { MAISON_THEME_KEY } from "@/lib/talent-site/theme-catalog/maison/seed";

type Named = { name: { en: string; es: string } };

export function designSummaryLine(input: {
  designSlug: string | null | undefined;
  lookSlug: string | null | undefined;
  /** Maison only: the palette key when no look slug is saved. */
  paletteKey: string | null | undefined;
  customPalette: Named | null | undefined;
  /** Last segment ("Your content", a status label, ...). */
  tail: string;
  locale: "en" | "es";
}): string {
  const designSlug = input.designSlug || MAISON_THEME_KEY;
  const lookSlug =
    input.lookSlug ||
    (designSlug === MAISON_THEME_KEY && input.paletteKey ? `maison-${input.paletteKey}` : null);
  const label = appliedThemeLabel(designSlug, lookSlug, input.locale);
  const look = input.customPalette ? input.customPalette.name[input.locale] : label?.look ?? null;
  return [label?.design ?? "Maison", look, input.tail].filter(Boolean).join(" · ");
}
