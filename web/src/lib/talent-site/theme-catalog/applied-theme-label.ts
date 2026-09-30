/**
 * THE display names for an applied design + look (F23 / F33). Every label
 * that names "your design" (Today card, pill-adjacent cards, the review step)
 * must read talent_sites.theme_design_slug + theme_look_slug through this,
 * never setup_choices or a default palette: a null look means "the design's
 * own colours", not the first palette's name.
 */

import { getGalleryDesign } from "./gallery-meta";
import { MAISON_THEME_KEY } from "./maison/seed";

export type AppliedThemeLabel = {
  design: string;
  /** null when no look was chosen (theme_look_slug null) or it is unknown. */
  look: string | null;
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function appliedThemeLabel(
  designSlug: string | null | undefined,
  lookSlug: string | null | undefined,
  locale: "en" | "es" = "en",
): AppliedThemeLabel | null {
  const slug = designSlug?.trim().toLowerCase();
  if (!slug) return null;
  const design = getGalleryDesign(slug);
  const designName = design?.name ?? titleCase(slug);
  const lookRaw = lookSlug?.trim().toLowerCase() ?? "";
  if (!lookRaw || !design) return { design: designName, look: null };
  const key = slug === MAISON_THEME_KEY && lookRaw.startsWith("maison-") ? lookRaw.slice(7) : lookRaw;
  const palette = design.palettes.find((p) => p.key === key);
  return { design: designName, look: palette ? palette.name[locale] ?? palette.name.en : null };
}

/** "Maison v2" or "Maison · Pink & Lipstick". */
export function appliedThemeLine(label: AppliedThemeLabel | null): string {
  if (!label) return "";
  return label.look ? `${label.design} · ${label.look}` : label.design;
}
