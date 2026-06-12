/**
 * M7 — theme preset registry.
 *
 * A theme preset is a named bundle of design-token defaults + shell variant
 * defaults that an agency admin can apply in one click. Applying a preset
 * copies every bundled value into `theme_json_draft`; the operator can then
 * override individual tokens, or `publishDesign` to promote to live.
 *
 * **Invariants**
 *   - Every key in a preset's `tokens` map MUST exist in `TOKEN_REGISTRY`
 *     (verified by `validateAllPresets`). An unknown key would be dropped
 *     silently by the renderer, which hides bugs.
 *   - Preset values MUST pass the token's own validator. This is checked in
 *     `validateAllPresets` so a typo ships a hard failure at import time,
 *     not a soft default at render time.
 *   - Presets are additive: selecting a preset does NOT wipe token keys
 *     that are outside the preset's bundle. That keeps operator overrides
 *     on orthogonal dimensions (e.g. a custom primary color) intact.
 *   - A preset NEVER overrides non-`agencyConfigurable` tokens.
 *
 * **Extensibility**
 *   - Add a new preset: append to `THEME_PRESETS` with a unique slug.
 *   - Add a new token dimension: extend `TOKEN_REGISTRY`, then add the
 *     bundle entry to the presets that should surface it.
 *   - This registry is platform-owned (not tenant-specific). A tenant could
 *     later extend with "tenant-local presets" — shape would live in a new
 *     `agency_theme_presets` table but the shape below stays.
 */

import {
  TOKEN_REGISTRY,
  type TokenSpec,
} from "../tokens/registry";
import type { ComponentStyleDefaults } from "../builder-node/component-style-defaults";

export interface ThemePreset {
  /** URL-safe identifier. Stored in `agency_branding.theme_preset_slug`. */
  slug: string;
  label: string;
  /** One-line description shown in the admin preset picker. */
  summary: string;
  /** What kinds of brands the preset is tuned for. Shown as chips. */
  idealFor: string[];
  /**
   * Token bundle applied when the operator picks this preset. Keys must be
   * members of `TOKEN_REGISTRY`; values must pass each token's validator.
   */
  tokens: Record<string, string>;
  /**
   * Optional preview swatch for the picker card. Not used at render time —
   * purely UX.
   */
  previewSwatch?: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  /** Stable display order in the picker. Lower = earlier. */
  order: number;
  /**
   * Optional per-component default styles bundled with the preset. When an
   * operator applies the preset these seed `component_styles_json[_draft]` so a
   * freshly-ADDED element (heading, button, card…) is themed immediately rather
   * than rendering raw browser defaults. Values use the same vocabulary as a
   * node's own style: raw CSS strings OR `token:<key>` bindings that resolve to
   * `var(--token-…)` so a live theme change cascades.
   */
  componentStyles?: ComponentStyleDefaults;
}

/**
 * MODERN 2026 — the platform's default register. A clean light canvas
 * (white background, near-black ink), a sky-blue accent (#0ea5e9) for CTAs and
 * links, soft radii + soft shadows, cozy spacing, and a system-sans pairing.
 * This is what EVERY new tenant + new talent page inherits unless an operator
 * picks another preset or the super-admin edits the Site Default in Builder Lab.
 *
 * Ships with a `componentStyles` slice so a freshly-ADDED element looks themed
 * the instant it's dropped: headings render in Ink, paragraphs in Muted, the
 * button paints the sky-blue accent with white text + a soft radius, and a card
 * gets the raised surface + hairline border. All color values are `token:`
 * bindings so a live theme change (or the Site-Default editor) cascades.
 */
const modernPreset: ThemePreset = {
  slug: "modern-2026",
  label: "Modern 2026",
  summary:
    "Clean white canvas, near-black type, sky-blue accent, soft radii — the modern default every new site starts on.",
  idealFor: ["New tenants", "New talent pages", "SaaS", "Any modern brand"],
  order: 1,
  previewSwatch: {
    primary: "#111111",
    secondary: "#6b7280",
    accent: "#0ea5e9",
    background: "#ffffff",
  },
  tokens: {
    // colors — clean light + sky-blue accent
    "color.background": "#ffffff",
    "color.ink": "#111111",
    "color.primary": "#111111",
    "color.secondary": "#6b7280",
    "color.accent": "#0ea5e9",
    "color.neutral": "#737373",
    "color.line": "#e5e7eb",
    "color.surface-raised": "#ffffff",
    "color.muted": "#6b7280",
    // surface
    "background.mode": "plain",
    // shape & feel
    "radius.scale-preset": "soft",
    "shadow.preset": "soft",
    "spacing.scale": "cozy",
    // typography — system sans, standard scale
    "typography.heading-preset": "sans",
    "typography.body-preset": "sans",
    "typography.scale-preset": "standard",
    // motion
    "motion.preset": "snappy",
  },
  componentStyles: {
    heading: { textColor: "token:color.ink" },
    paragraph: { textColor: "token:color.muted" },
    button: {
      backgroundColor: "token:color.accent",
      textColor: "#ffffff",
      borderRadius: "10px",
    },
    card: {
      backgroundColor: "token:color.surface-raised",
      borderColor: "token:color.line",
    },
  },
};

/**
 * NEUTRAL — the clean white default foundation. Zero brand color: white
 * canvas, near-black ink, monochrome accent, system sans, crisp shadows,
 * plain background. This is what a brand-new tenant should render as before
 * they pick a vertical preset (editorial-noir, editorial-bridal, …) — so the
 * builder canvas is neutral and a tenant's look comes ONLY from choosing a
 * preset / setting tokens, never from a baked-in Impronta default.
 *
 * Every token value here is reused verbatim from an existing validated
 * preset's allowed enum/hex set, so `validateAllPresets()` cannot regress.
 */
const neutralPreset: ThemePreset = {
  slug: "neutral",
  label: "Neutral",
  summary:
    "Clean white canvas, near-black type, monochrome accent. The default starting point for any tenant.",
  idealFor: ["New tenants", "Corporate", "Minimal", "Any vertical (start here)"],
  order: 5,
  previewSwatch: {
    primary: "#171717",
    secondary: "#525252",
    accent: "#171717",
    background: "#ffffff",
  },
  tokens: {
    // colors — true neutral, no brand hue
    "color.primary": "#171717",
    "color.secondary": "#525252",
    "color.accent": "#171717",
    "color.neutral": "#737373",
    "color.blush": "#e5e5e5",
    "color.sage": "#d4d4d4",
    "color.ink": "#171717",
    "color.muted": "#6b7280",
    "color.line": "#e5e7eb",
    "color.surface-raised": "#ffffff",
    // typography — system sans, standard scale
    "typography.heading-preset": "sans",
    "typography.body-preset": "sans",
    "typography.label-preset": "uppercase-tracked",
    "typography.scale-preset": "standard",
    "typography.tracking-preset": "normal",
    // shape & feel
    "radius.base": "md",
    "radius.scale-preset": "soft",
    "shadow.preset": "crisp",
    // motion & density
    "motion.preset": "snappy",
    "spacing.scale": "cozy",
    "density.section-padding": "standard",
    "density.container-width": "standard",
    // icons
    "icon.family": "lucide",
    // shell
    "shell.header-variant": "classic-solid",
    "shell.header-sticky": "on",
    "shell.header-transparent-on-hero": "off",
    "shell.footer-variant": "classic-minimal",
    "shell.mobile-nav-variant": "drawer-right",
    "background.mode": "plain",
    // template families
    "template.directory-card-family": "classic",
    "template.profile-layout-family": "classic",
    // polish
    "shell.logo-variant": "wordmark",
    "motion.stagger-preset": "subtle",
    "directory.card.show-destination-ready-ribbon": "off",
    "directory.card.show-starting-from-price": "off",
    "directory.card.specialty-chips-max": "3",
    "profile.sticky-inquiry-bar": "off",
    "profile.blocks-visibility": "all-visible",
  },
};

/**
 * CLASSIC — the Impronta / Nova / legacy look. This preset's bundle matches
 * the pre-M7 platform defaults so existing tenants rendering under the
 * classic shell can round-trip `apply Classic → publish` without any
 * visible change.
 */
const classicPreset: ThemePreset = {
  slug: "classic",
  label: "Classic",
  summary: "Sans-first, snappy motion, crisp shadows. The platform default.",
  idealFor: ["Agencies", "Rosters", "General SaaS", "Legacy tenants"],
  order: 10,
  previewSwatch: {
    primary: "#111111",
    secondary: "#6b7280",
    accent: "#0ea5e9",
    background: "#ffffff",
  },
  tokens: {
    // colors
    "color.primary": "#111111",
    "color.secondary": "#6b7280",
    "color.accent": "#0ea5e9",
    "color.neutral": "#737373",
    "color.blush": "#d8b7b0",
    "color.sage": "#a8b1a0",
    "color.ink": "#111111",
    "color.muted": "#737373",
    "color.line": "#e5e5e5",
    "color.surface-raised": "#ffffff",
    // typography
    "typography.heading-preset": "sans",
    "typography.body-preset": "sans",
    "typography.label-preset": "uppercase-tracked",
    "typography.scale-preset": "standard",
    "typography.tracking-preset": "normal",
    // shape & feel
    "radius.base": "md",
    "radius.scale-preset": "soft",
    "shadow.preset": "crisp",
    // motion & density
    "motion.preset": "snappy",
    "spacing.scale": "cozy",
    "density.section-padding": "standard",
    "density.container-width": "standard",
    // icons
    "icon.family": "lucide",
    // shell
    "shell.header-variant": "classic-solid",
    "shell.header-sticky": "on",
    "shell.header-transparent-on-hero": "off",
    "shell.footer-variant": "classic-minimal",
    "shell.mobile-nav-variant": "drawer-right",
    "background.mode": "plain",
    // template families
    "template.directory-card-family": "classic",
    "template.profile-layout-family": "classic",
    // M8 classic defaults
    "shell.logo-variant": "wordmark",
    "motion.stagger-preset": "subtle",
    "directory.card.show-destination-ready-ribbon": "off",
    "directory.card.show-starting-from-price": "off",
    "directory.card.specialty-chips-max": "3",
    "profile.sticky-inquiry-bar": "off",
    "profile.blocks-visibility": "all-visible",
  },
};

/**
 * EDITORIAL BRIDAL — Muse Bridal Collective feel. Warm ivory canvas,
 * Fraunces-style serif headings with italic accents, pillowy radii, soft
 * shadows, refined motion with hover image zoom, generous section padding,
 * thin-stroke editorial icons, transparent-on-hero sticky header.
 *
 * Designed to be the first of several "vertical" presets. Adding a new one
 * (e.g. EDITORIAL_CREATOR, WELLNESS_CALM, STAFFING_OPERATIONAL) means adding
 * another ThemePreset here and wiring any new storefront CSS rules that its
 * enum values reference.
 */
const editorialBridalPreset: ThemePreset = {
  slug: "editorial-bridal",
  label: "Editorial Bridal",
  summary:
    "Ivory canvas, serif italic accents, refined motion, pillowy radii — the Muse Bridal Collective register.",
  idealFor: [
    "Wedding collectives",
    "Editorial agencies",
    "Destination event brands",
    "Boutique talent rosters",
  ],
  order: 20,
  previewSwatch: {
    primary: "#4a403a",
    secondary: "#e8d8c3",
    accent: "#d8b7b0",
    background: "#f6f1ea",
  },
  tokens: {
    // colors — Muse Bridal palette
    "color.primary": "#4a403a", // Espresso
    "color.secondary": "#e8d8c3", // Champagne
    "color.accent": "#d8b7b0", // Soft Blush
    "color.neutral": "#8c7f75",
    "color.blush": "#d8b7b0",
    "color.sage": "#a8b1a0",
    "color.ink": "#2a221e",
    "color.muted": "#8c7f75",
    "color.line": "#e5dcce",
    "color.surface-raised": "#ffffff",
    // typography
    "typography.heading-preset": "editorial-serif",
    "typography.body-preset": "refined-sans",
    "typography.label-preset": "uppercase-tracked",
    "typography.scale-preset": "editorial",
    "typography.tracking-preset": "editorial",
    // shape & feel
    "radius.base": "lg",
    "radius.scale-preset": "pillowy",
    "shadow.preset": "soft",
    // motion & density
    "motion.preset": "refined",
    "spacing.scale": "editorial",
    "density.section-padding": "editorial",
    "density.container-width": "editorial",
    // icons
    "icon.family": "editorial-line",
    // shell
    "shell.header-variant": "editorial-sticky",
    "shell.header-sticky": "on",
    "shell.header-transparent-on-hero": "on",
    "shell.footer-variant": "espresso-column",
    "shell.mobile-nav-variant": "full-screen-fade",
    "background.mode": "editorial-ivory",
    // template families
    "template.directory-card-family": "editorial-bridal",
    "template.profile-layout-family": "editorial-bridal",
    // M8 editorial polish
    "shell.logo-variant": "muse-split",
    "motion.stagger-preset": "editorial",
    "directory.card.show-destination-ready-ribbon": "on",
    "directory.card.show-starting-from-price": "on",
    "directory.card.specialty-chips-max": "3",
    "profile.sticky-inquiry-bar": "on",
    "profile.blocks-visibility": "editorial-bridal",
  },
};

/**
 * STUDIO MINIMAL — monochrome, sharp-edged, gallery-like. Designed for
 * high-end photography studios, architectural brands, and boutique fashion
 * houses where the work speaks and chrome stays out of the way.
 *
 * Ships as preset #3 to prove a third vertical plugs into the registry
 * without engine changes. Same 33 token keys as Classic / Editorial Bridal;
 * different values.
 */
const studioMinimalPreset: ThemePreset = {
  slug: "studio-minimal",
  label: "Studio Minimal",
  summary:
    "Monochrome, sharp-edged, gallery-quiet. For brands where the work should speak.",
  idealFor: [
    "Photography studios",
    "Architecture practices",
    "Boutique fashion houses",
    "High-end portfolios",
  ],
  order: 30,
  previewSwatch: {
    primary: "#0f0f0f",
    secondary: "#666666",
    accent: "#111111",
    background: "#ffffff",
  },
  tokens: {
    // colors — monochrome with a single hairline grey
    "color.primary": "#0f0f0f",
    "color.secondary": "#666666",
    "color.accent": "#111111",
    "color.neutral": "#8a8a8a",
    "color.blush": "#e5e5e5",
    "color.sage": "#cfcfcf",
    "color.ink": "#0f0f0f",
    "color.muted": "#808080",
    "color.line": "#e0e0e0",
    "color.surface-raised": "#ffffff",
    // typography — sans display, larger ratio, tight tracking
    "typography.heading-preset": "sans",
    "typography.body-preset": "sans",
    "typography.label-preset": "uppercase-tracked",
    "typography.scale-preset": "editorial",
    "typography.tracking-preset": "tight",
    // shape & feel — sharp edges, no shadows
    "radius.base": "none",
    "radius.scale-preset": "sharp",
    "shadow.preset": "none",
    // motion & density — tight, snappy
    "motion.preset": "snappy",
    "spacing.scale": "cozy",
    "density.section-padding": "standard",
    "density.container-width": "wide",
    // icons — lucide matches the modern-sans register
    "icon.family": "lucide",
    // shell — solid classic nav, non-transparent
    "shell.header-variant": "classic-solid",
    "shell.header-sticky": "on",
    "shell.header-transparent-on-hero": "off",
    "shell.footer-variant": "classic-minimal",
    "shell.mobile-nav-variant": "drawer-right",
    "background.mode": "plain",
    // template families — classic card + profile layouts (most neutral)
    "template.directory-card-family": "classic",
    "template.profile-layout-family": "classic",
    // polish
    "shell.logo-variant": "wordmark",
    "motion.stagger-preset": "subtle",
    "directory.card.show-destination-ready-ribbon": "off",
    "directory.card.show-starting-from-price": "off",
    "directory.card.specialty-chips-max": "2",
    "profile.sticky-inquiry-bar": "off",
    "profile.blocks-visibility": "all-visible",
  },
};

/**
 * EDITORIAL NOIR — the original Impronta register. Black canvas, ivory type,
 * bright-gold accents, serif display headlines. Designed for premium talent,
 * modelling, and image agencies whose brand equity is built on cinematic
 * darkness + metal-leaf wordmarks.
 *
 * Ships as the fourth preset so an operator can pick it from the design
 * picker, or carry it via `theme_json` on tenants that have always looked
 * this way (e.g. Impronta Models Tulum).
 */
const editorialNoirPreset: ThemePreset = {
  slug: "editorial-noir",
  label: "Editorial Noir",
  summary:
    "Black canvas, bright-gold accents, serif headlines — the cinematic Impronta register.",
  idealFor: [
    "Talent agencies",
    "Modelling rosters",
    "Image + brand agencies",
    "Luxury editorial brands",
  ],
  order: 40,
  previewSwatch: {
    primary: "#c9a227",
    secondary: "#9a7b2c",
    accent: "#d4af37",
    background: "#0a0a0a",
  },
  tokens: {
    // colors — noir with gold accents
    "color.primary": "#c9a227",
    "color.secondary": "#9a7b2c",
    "color.accent": "#d4af37",
    "color.neutral": "#a1a1aa",
    "color.blush": "#d8b7b0",
    "color.sage": "#a8b1a0",
    "color.ink": "#f4f4f5",
    "color.muted": "#a1a1aa",
    "color.line": "#1f1f22",
    "color.surface-raised": "#0f0f0f",
    // typography — Cinzel display titles (v11 register) + tracked
    // uppercase eyebrows. Cinzel weight 400, airy +0.03em, mixed-case.
    "typography.heading-preset": "cinzel-editorial",
    "typography.body-preset": "refined-sans",
    "typography.label-preset": "uppercase-tracked",
    "typography.scale-preset": "editorial",
    // Airy Cinzel titles (v11 register) — pairs with cinzel-editorial.
    "typography.tracking-preset": "wide",
    // shape & feel — soft radii, ambient shadow against black
    "radius.base": "md",
    "radius.scale-preset": "soft",
    "shadow.preset": "ambient",
    // motion & density
    "motion.preset": "refined",
    "spacing.scale": "comfortable",
    "density.section-padding": "editorial",
    "density.container-width": "standard",
    // icons
    "icon.family": "editorial-line",
    // shell — transparent-on-hero over cinematic imagery, espresso footer
    "shell.header-variant": "editorial-sticky",
    "shell.header-sticky": "on",
    "shell.header-transparent-on-hero": "on",
    "shell.footer-variant": "espresso-column",
    "shell.mobile-nav-variant": "full-screen-fade",
    "background.mode": "editorial-noir",
    // template families — stay on classic (most neutral) so the noir palette
    // is what does the heavy lifting, not a bridal-specific card layout.
    "template.directory-card-family": "classic",
    "template.profile-layout-family": "classic",
    // polish
    "shell.logo-variant": "wordmark",
    "motion.stagger-preset": "editorial",
    "directory.card.show-destination-ready-ribbon": "off",
    "directory.card.show-starting-from-price": "off",
    "directory.card.specialty-chips-max": "3",
    "profile.sticky-inquiry-bar": "on",
    "profile.blocks-visibility": "all-visible",
  },
};

export const THEME_PRESETS: ThemePreset[] = [
  modernPreset,
  neutralPreset,
  classicPreset,
  editorialBridalPreset,
  studioMinimalPreset,
  editorialNoirPreset,
].sort((a, b) => a.order - b.order);

/**
 * Slug of the preset a brand-new tenant / talent page starts on. Modern 2026
 * by design: a clean light canvas with a sky-blue accent, never an
 * Impronta-flavored default. Onboarding / tenant-creation seeds this, and the
 * super-admin can edit the live Site Default (which overrides this constant) in
 * Builder Lab → Site Defaults.
 */
export const DEFAULT_THEME_PRESET_SLUG = "modern-2026" as const;

export function getThemePreset(slug: string | null | undefined): ThemePreset | null {
  if (!slug) return null;
  return THEME_PRESETS.find((p) => p.slug === slug) ?? null;
}

export function listThemePresets(): ReadonlyArray<ThemePreset> {
  return THEME_PRESETS;
}

/**
 * Shape-check every preset against the registry at module load. Any preset
 * referencing an unknown token or carrying an invalid enum value will throw
 * here — caught by Next.js during dev and by CI typecheck in builds.
 * We deliberately throw (not warn) so a typo is loud.
 */
export function validateAllPresets(): void {
  const issues: string[] = [];
  for (const preset of THEME_PRESETS) {
    for (const [key, value] of Object.entries(preset.tokens)) {
      const spec: TokenSpec | undefined = TOKEN_REGISTRY[key];
      if (!spec) {
        issues.push(`preset "${preset.slug}": unknown token "${key}"`);
        continue;
      }
      const parsed = spec.validator.safeParse(value);
      if (!parsed.success) {
        issues.push(
          `preset "${preset.slug}": invalid value for "${key}" — ${parsed.error.issues[0]?.message ?? "invalid"}`,
        );
      }
      if (!spec.agencyConfigurable) {
        issues.push(
          `preset "${preset.slug}": "${key}" is not agency-configurable and cannot be preset-driven`,
        );
      }
    }
  }
  if (issues.length > 0) {
    throw new Error(
      `[theme-presets] registry integrity failed:\n  - ${issues.join("\n  - ")}`,
    );
  }
}

// Run at module load so a typo explodes in dev without needing a test to fire.
validateAllPresets();
