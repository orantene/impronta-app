/**
 * Maison seed constants — sourced from `maison-seed-data.json` (approved
 * prototype 2026-09-25). Never retype palette hexes from screenshots.
 *
 * Phase A: typed read of the JSON for later catalog seeding / UI. Catalog DB
 * rows and Design payload land in later PRs (need program migration versions).
 */
import seedJson from "./maison-seed-data.json";

export type MaisonPaletteKey = "pink" | "pearl" | "lilac" | "sand" | "peach";

export type MaisonPalette = {
  name: { en: string; es: string };
  page: string;
  section: string;
  rule: string;
  text: string;
  accent: string;
  on_accent: string;
  contrast: { text_page: number; button: number };
};

export type MaisonSeed = typeof seedJson;

export const MAISON_SEED: MaisonSeed = seedJson;

export const MAISON_THEME_KEY = MAISON_SEED.theme.key;

export const MAISON_PALETTE_ORDER = MAISON_SEED.theme.palette_order as MaisonPaletteKey[];

export const MAISON_PALETTES = MAISON_SEED.palettes as Record<MaisonPaletteKey, MaisonPalette>;

/** Pink & Lipstick — default demo palette; matches live book-jorgelina rose. */
export const MAISON_DEFAULT_PALETTE_KEY: MaisonPaletteKey = "pink";

export const MAISON_NAILS_DEMO_KEY = MAISON_SEED.demo_nails.key;

export const MAISON_STARTER_COUNTS = MAISON_SEED.demo_nails.starter_content.counts_shown;

export function maisonPaletteLookTokens(key: MaisonPaletteKey): Record<string, string> {
  const p = MAISON_PALETTES[key];
  return {
    "color.background": p.page,
    "color.surface-raised": p.section,
    "color.line": p.rule,
    "color.ink": p.text,
    "color.primary": p.accent,
    "color.accent": p.accent,
  };
}
