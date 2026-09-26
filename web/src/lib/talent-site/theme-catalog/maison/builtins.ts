/**
 * Maison catalog built-ins (Design + scoped Looks + Demo).
 *
 * Kept OUT of the classic `BUILTIN_DESIGNS` / `BUILTIN_LOOKS` 5×6 lists so
 * flag-off production and the 5×6 cross-product tests stay unchanged.
 * `loadTalentThemeCatalog` and `syncBuiltinTalentThemes` pull these in only
 * when the Maison flag is considered (load filters; sync always upserts so
 * rows are ready the moment the flag flips).
 */
import type { BuiltinDesignEntry, BuiltinLookEntry } from "../builtins/types";
import { buildBuiltinDesignPayload } from "../builtins/designs/_shared";
import type { DemoPayload, LookPayload } from "../types";
import { buildMaisonDesignPayload } from "./design-payload";
import { MAISON_PALETTE_ORDER, MAISON_PALETTES, MAISON_SEED, type MaisonPaletteKey } from "./seed";

export const MAISON_BUILTIN_DESIGN: BuiltinDesignEntry = {
  kind: "design",
  slug: "maison",
  title: "Maison",
  summary:
    MAISON_SEED.theme.description.en,
  category: "editorial",
  tags: MAISON_SEED.theme.tags.map((t) => t.key),
  required_talent_tier: "talent_basic",
  sort_order: 5,
  is_new_until: null,
  preview: {
    swatch: {
      primary: MAISON_PALETTES.pink.accent,
      secondary: MAISON_PALETTES.pink.section,
      accent: MAISON_PALETTES.pink.accent,
      background: MAISON_PALETTES.pink.page,
      ink: MAISON_PALETTES.pink.text,
    },
    fontPreview: { heading: "Fraunces", body: "Inter" },
  },
  buildPayload: buildMaisonDesignPayload,
};

function lookTokensFor(key: MaisonPaletteKey): LookPayload {
  const p = MAISON_PALETTES[key];
  return {
    tokens: {
      "color.background": p.page,
      "color.surface-raised": p.section,
      "color.line": p.rule,
      "color.ink": p.text,
      "color.muted": p.text,
      "color.primary": p.accent,
      "color.accent": p.accent,
      "typography.heading-font-family": "Fraunces, Georgia, serif",
      "typography.body-font-family": "Inter, system-ui, sans-serif",
      "background.mode": "plain",
    },
  };
}

export type MaisonBuiltinLookEntry = BuiltinLookEntry & { for_design: "maison" };

export const MAISON_BUILTIN_LOOKS: readonly MaisonBuiltinLookEntry[] = MAISON_PALETTE_ORDER.map(
  (key, index) => {
    const p = MAISON_PALETTES[key];
    const payload = lookTokensFor(key);
    return {
      kind: "look" as const,
      slug: `maison-${key}`,
      title: p.name.en,
      summary: p.name.es,
      category: null,
      tags: ["maison", key],
      required_talent_tier: "talent_basic" as const,
      sort_order: 100 + index,
      is_new_until: null,
      for_design: "maison" as const,
      preview: {
        swatch: {
          primary: p.accent,
          secondary: p.section,
          accent: p.accent,
          background: p.page,
          ink: p.text,
        },
        fontPreview: { heading: "Fraunces", body: "Inter" },
      },
      buildPayload: () => lookTokensFor(key),
    };
  },
);

export type MaisonBuiltinDemoEntry = {
  kind: "demo";
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  for_design: "maison";
  required_talent_tier: "talent_basic";
  sort_order: number;
  is_new_until: string | null;
  preview: { swatch?: MaisonBuiltinLookEntry["preview"]["swatch"] };
  buildPayload: () => DemoPayload;
};

export const MAISON_BUILTIN_DEMO: MaisonBuiltinDemoEntry = {
  kind: "demo",
  slug: "maison-nails",
  title: "Nails & Lashes Artist",
  summary: "Uñas y pestañas",
  category: "nails",
  tags: ["bookings", "menu"],
  for_design: "maison",
  required_talent_tier: "talent_basic",
  sort_order: 10,
  is_new_until: null,
  preview: {
    swatch: {
      primary: MAISON_PALETTES.pink.accent,
      secondary: MAISON_PALETTES.pink.section,
      accent: MAISON_PALETTES.pink.accent,
      background: MAISON_PALETTES.pink.page,
      ink: MAISON_PALETTES.pink.text,
    },
  },
  buildPayload: (): DemoPayload => ({
    offering_mode: "bookings",
    default_look: "maison-pink",
    section_arrangement: [...MAISON_SEED.theme.sections_default_order],
    menu_style: "tabs",
    hydration: {
      site_content: MAISON_SEED.demo_nails.site_content,
    },
    starter_content: {
      services: MAISON_SEED.demo_nails.starter_content.services,
      faq_prompts: [...MAISON_SEED.demo_nails.starter_content.faq_prompts],
      section_text: MAISON_SEED.demo_nails.starter_content.section_text,
    },
    image_licence: {
      reusable: MAISON_SEED.demo_nails.starter_content.images_licensed_for_reuse,
    },
  }),
};

/**
 * W8 — hidden foundation probe Design. Not synced as published; unit tests
 * prove a second theme validates as data without schema/UI rewrite.
 */
export const W8_FOUNDATION_PROBE_DESIGN: BuiltinDesignEntry = {
  kind: "design",
  slug: "w8-foundation-probe",
  title: "W8 Foundation Probe",
  summary: "Hidden test theme proving the next Design lands as data only.",
  category: "minimal",
  tags: ["internal", "w8"],
  required_talent_tier: "talent_basic",
  sort_order: 9999,
  is_new_until: null,
  preview: {},
  buildPayload: () => buildBuiltinDesignPayload("minimal"),
};
