/**
 * Profile-page template registry.
 *
 * The catalog of selectable talent-profile-page templates, mirroring the
 * `TALENT_SITE_TEMPLATES` registry used by Max sites. The agency-admin
 * "Profile Pages" chooser renders these as picker tiles; the public profile
 * route (`/t/[profileCode]`) dispatches on the persisted
 * `template.profile-layout-family` design token to the matching layout
 * component.
 *
 * Adding a template = a new entry here + a new layout component + a branch in
 * the page-route dispatcher + (if it should pass the design panel's validator)
 * a value in `tokens/registry.ts` for `template.profile-layout-family`.
 *
 * Pure data — no React, no server code. Safe to import from client and server.
 */

export type ProfilePageTemplateKey = "classic" | "noir" | "lumen" | "atelier";

export type ProfilePageTemplateDef = {
  key: ProfilePageTemplateKey;
  /** The exact value written to the `template.profile-layout-family` token. */
  tokenValue: string;
  label: string;
  tagline: string;
  description: string;
  /** Section names, in render order — shown in the picker tile. */
  sections: string[];
  /** Preview-tile swatch (no real screenshot needed — an honest mini-mock). */
  swatch: {
    bg: string;
    ink: string;
    accent: string;
    /** Short type-style label, e.g. "Geist · clean" / "Cormorant · editorial". */
    typeLabel: string;
  };
};

export const PROFILE_PAGE_TEMPLATES: Record<
  ProfilePageTemplateKey,
  ProfilePageTemplateDef
> = {
  classic: {
    key: "classic",
    tokenValue: "classic",
    label: "Classic",
    tagline: "The platform default",
    description:
      "Clean, light, conversion-first. Cover + header, 70/30 body with a sticky booking card, portfolio, services, skills, details and reviews. The safe, fast, neutral choice that fits any brand.",
    sections: [
      "Cover + header",
      "Portfolio",
      "About",
      "Services & pricing",
      "Skills",
      "Details",
      "Reviews",
      "Sticky booking card",
    ],
    swatch: {
      bg: "#f7f6f3",
      ink: "#16150f",
      accent: "#2e7d5b",
      typeLabel: "Geist · clean",
    },
  },
  noir: {
    key: "noir",
    tokenValue: "noir",
    label: "Noir & Or",
    tagline: "Black canvas, gold serif — editorial",
    description:
      "A dark, high-fashion editorial register. Split portrait hero, gold-hairline digitals grid, masonry portfolio, services, a clients band and a sticky book bar. Cormorant Garamond + Jost with gold accents. Built for agencies that want a premium magazine feel.",
    sections: [
      "Split portrait hero",
      "Digitals / measurements",
      "Skills & specialties",
      "Services & rates",
      "Portfolio",
      "Watch & listen",
      "Select clients",
      "Reviews",
      "More from this roster",
      "Sticky book bar",
    ],
    swatch: {
      bg: "#0b0a0d",
      ink: "#ece4d3",
      accent: "#c6a14e",
      typeLabel: "Cormorant · editorial",
    },
  },
  lumen: {
    key: "lumen",
    tokenValue: "lumen",
    label: "Lumen",
    tagline: "Modern, airy — adapts to your theme",
    description:
      "A bright, premium, modern layout with generous whitespace. Adaptive hero (cover, split, or compact — by the images you have), then a main column with a sticky availability + booking rail, full spec cards for every field, services, integrations and reviews. Follows your theme colors in settings — light theme renders light, dark renders dark, with your brand accent.",
    sections: [
      "Adaptive hero",
      "Sticky availability + booking rail",
      "All fields as spec cards",
      "Portfolio",
      "Services & pricing",
      "Integrations / featured media",
      "Reviews",
      "More from this roster",
    ],
    swatch: {
      bg: "#ffffff",
      ink: "#181715",
      accent: "#2f6f57",
      typeLabel: "Modern · airy",
    },
  },
  atelier: {
    key: "atelier",
    tokenValue: "atelier",
    label: "Atelier",
    tagline: "Minimal magazine — adapts to your theme",
    description:
      "A minimal high-fashion magazine layout: centered masthead hero, very large serif display, numbered sections, and a refined definition list that surfaces every profile field. Inline availability, wide editorial portfolio, integrations and reviews. Follows your theme colors in settings (light or dark) with your brand accent.",
    sections: [
      "Centered masthead hero",
      "Numbered sections",
      "All fields as definition list",
      "Inline availability",
      "Editorial portfolio",
      "Integrations / featured media",
      "Reviews",
      "More from this roster",
    ],
    swatch: {
      bg: "#faf8f4",
      ink: "#1a1a1a",
      accent: "#9a7b3f",
      typeLabel: "Fraunces · editorial",
    },
  },
};

export const PROFILE_PAGE_TEMPLATE_ORDER: ProfilePageTemplateKey[] = [
  "classic",
  "noir",
  "lumen",
  "atelier",
];

export const DEFAULT_PROFILE_PAGE_TEMPLATE: ProfilePageTemplateKey = "classic";

/** Coerce an arbitrary stored token value to a known template key. */
export function resolveProfilePageTemplateKey(
  raw: string | null | undefined,
): ProfilePageTemplateKey {
  return raw === "noir" || raw === "lumen" || raw === "atelier"
    ? raw
    : DEFAULT_PROFILE_PAGE_TEMPLATE;
}
