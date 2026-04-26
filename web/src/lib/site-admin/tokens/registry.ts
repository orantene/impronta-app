/**
 * Phase 5 — governed design token registry.
 *
 * Locked: only tokens flagged `agencyConfigurable: true` are editable by
 * tenant staff via the M6 design UI. Non-allow-listed token keys in an
 * incoming payload must be rejected server-side with TOKEN_NOT_OVERRIDABLE
 * (concurrency.ts error code).
 *
 * Token values are stored in agency_branding.theme_json. This module is the
 * source of truth for the token schema + defaults + safe-value validators.
 *
 * ── M7 — site-builder design surface ──────────────────────────────────
 * Added (all agency-configurable, all default to legacy behaviour so
 * existing tenants don't visually shift on deploy):
 *   colors       : blush, sage, ink, muted, line, surface-raised
 *   typography   : label-preset, scale-preset, tracking-preset
 *   radius       : scale-preset
 *   shadow       : preset
 *   motion       : preset
 *   density      : section-padding-preset
 *   icon         : family
 *   shell        : header-variant, footer-variant, mobile-nav-variant,
 *                  header-sticky, header-transparent-on-hero
 *   background   : mode
 *
 * Each new token either maps to a CSS custom property (colors) or a
 * data-attribute (enums) via `./resolve.ts`. Adding a token here without a
 * projection rule is a no-op at render time — `listProjectedTokens()`
 * catches that in tests.
 */

import { z } from "zod";

/**
 * Hex color in the form "#rgb" or "#rrggbb". Accessibility contrast checks
 * are enforced on M6 UI, not at DB level.
 */
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color");

export type TokenScope =
  | "color"
  | "typography"
  | "spacing"
  | "radius"
  | "shadow"
  | "motion"
  | "density"
  | "icon"
  | "shell"
  | "background"
  | "template";

export interface TokenSpec {
  key: string;
  label: string;
  scope: TokenScope;
  /** Gate: true = tenant can override via M6 UI. false = platform-only. */
  agencyConfigurable: boolean;
  /** Zod validator for accepted values. */
  validator: z.ZodType<string>;
  /** Platform default; used when theme_json lacks this key. */
  defaultValue: string;
  /**
   * Optional admin-UI hint. Not read at render time — purely metadata so
   * the design editor can group related tokens, render a color picker vs a
   * select, label a sub-group, etc.
   */
  group?: string;
  description?: string;
}

export const TOKEN_REGISTRY: Record<string, TokenSpec> = {
  // ── Colors — core brand ──────────────────────────────────────────────
  "color.primary": {
    key: "color.primary",
    label: "Primary",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#111111",
    group: "Brand colors",
  },
  "color.secondary": {
    key: "color.secondary",
    label: "Secondary",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#6b7280",
    group: "Brand colors",
  },
  "color.accent": {
    key: "color.accent",
    label: "Accent",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#0ea5e9",
    group: "Brand colors",
  },
  "color.neutral": {
    key: "color.neutral",
    label: "Neutral",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#737373",
    group: "Brand colors",
  },
  "color.background": {
    key: "color.background",
    label: "Background",
    scope: "color",
    // Platform-governed: changing this risks storefront legibility.
    agencyConfigurable: false,
    validator: hexColor,
    defaultValue: "#ffffff",
    group: "Brand colors",
  },

  // ── Colors — editorial extensions (M7) ──────────────────────────────
  "color.blush": {
    key: "color.blush",
    label: "Blush / italic accent",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#d8b7b0",
    group: "Editorial colors",
    description:
      "Italic-accent tone used for serif emphasis, soft dividers, and editorial badges.",
  },
  "color.sage": {
    key: "color.sage",
    label: "Sage / soft accent",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#a8b1a0",
    group: "Editorial colors",
  },
  "color.ink": {
    key: "color.ink",
    label: "Ink (strong text)",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#111111",
    group: "Editorial colors",
    description: "Deepest text color on light surfaces.",
  },
  "color.muted": {
    key: "color.muted",
    label: "Muted text",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#8c7f75",
    group: "Editorial colors",
  },
  "color.line": {
    key: "color.line",
    label: "Divider / line",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#e5dcce",
    group: "Editorial colors",
  },
  "color.surface-raised": {
    key: "color.surface-raised",
    label: "Raised surface (cards)",
    scope: "color",
    agencyConfigurable: true,
    validator: hexColor,
    defaultValue: "#ffffff",
    group: "Editorial colors",
  },

  // ── Typography ──────────────────────────────────────────────────────
  "typography.heading-preset": {
    key: "typography.heading-preset",
    label: "Heading font preset",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["sans", "serif", "display", "editorial-serif"]),
    defaultValue: "sans",
    group: "Typography",
    description:
      "`editorial-serif` pairs Fraunces-style variable serif with Inter body, optimised for bridal / editorial brands.",
  },
  "typography.body-preset": {
    key: "typography.body-preset",
    label: "Body font preset",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["sans", "serif", "refined-sans"]),
    defaultValue: "sans",
    group: "Typography",
  },
  "typography.label-preset": {
    key: "typography.label-preset",
    label: "Label / eyebrow style",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["uppercase-tracked", "italic-serif", "sans-bold"]),
    defaultValue: "uppercase-tracked",
    group: "Typography",
    description: "Eyebrow text above headlines. Tracked uppercase for most brands; italic serif for editorial ones.",
  },
  "typography.scale-preset": {
    key: "typography.scale-preset",
    label: "Type scale",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["compact", "standard", "editorial"]),
    defaultValue: "standard",
    group: "Typography",
    description: "`editorial` ships a larger display-to-body ratio for serif-led layouts.",
  },
  "typography.tracking-preset": {
    key: "typography.tracking-preset",
    label: "Heading letter-spacing",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.enum(["tight", "normal", "editorial"]),
    defaultValue: "normal",
    group: "Typography",
  },
  /**
   * Phase 13 — free-string font-family overrides. When set, these win over
   * the heading-/body-preset (the storefront stylesheet uses
   * `--token-typography-heading-font-family` if present, else falls back
   * to the preset's `--site-heading-font` chain). The validator accepts
   * any reasonable CSS font-family value (quoted family + comma-separated
   * fallbacks); empty string is allowed and means "use the preset".
   */
  "typography.heading-font-family": {
    key: "typography.heading-font-family",
    label: "Heading font family (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(200).regex(
      /^$|^[\w\s",\-+()]+$/,
      "Invalid font-family value",
    ),
    defaultValue: "",
    group: "Typography",
    description:
      "Free CSS font-family value. Wins over heading preset when non-empty.",
  },
  "typography.body-font-family": {
    key: "typography.body-font-family",
    label: "Body font family (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(200).regex(
      /^$|^[\w\s",\-+()]+$/,
      "Invalid font-family value",
    ),
    defaultValue: "",
    group: "Typography",
    description:
      "Free CSS font-family value. Wins over body preset when non-empty.",
  },

  /**
   * Phase 13 — per-heading-level type-scale overrides. Each level is a
   * free CSS font-size value (`clamp(...)`, `48px`, `2.5rem`, etc.) or
   * empty to inherit from the scale-preset. Stored as strings; projected
   * as `--token-typography-h{N}-size` CSS vars consumed by typography
   * rules in token-presets.css.
   */
  "typography.h1-size": {
    key: "typography.h1-size",
    label: "H1 size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },
  "typography.h2-size": {
    key: "typography.h2-size",
    label: "H2 size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },
  "typography.h3-size": {
    key: "typography.h3-size",
    label: "H3 size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },
  "typography.h4-size": {
    key: "typography.h4-size",
    label: "H4 size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },
  "typography.h5-size": {
    key: "typography.h5-size",
    label: "H5 size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },
  "typography.h6-size": {
    key: "typography.h6-size",
    label: "H6 size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },
  "typography.body-size": {
    key: "typography.body-size",
    label: "Body size (custom)",
    scope: "typography",
    agencyConfigurable: true,
    validator: z.string().max(80).regex(/^$|^[a-zA-Z0-9.,()\s%-]+$/, "Invalid CSS length"),
    defaultValue: "",
    group: "Type scale",
  },

  // ── Shape & feel ────────────────────────────────────────────────────
  "radius.base": {
    key: "radius.base",
    label: "Radius base",
    scope: "radius",
    agencyConfigurable: true,
    validator: z.enum(["none", "sm", "md", "lg"]),
    defaultValue: "md",
    group: "Shape",
  },
  "radius.scale-preset": {
    key: "radius.scale-preset",
    label: "Radius scale",
    scope: "radius",
    agencyConfigurable: true,
    validator: z.enum(["sharp", "soft", "pillowy", "pill"]),
    defaultValue: "soft",
    group: "Shape",
    description:
      "Whole-scale radius feel. `pill` rounds buttons and chips fully; `pillowy` is the editorial bridal feel.",
  },
  "shadow.preset": {
    key: "shadow.preset",
    label: "Shadow preset",
    scope: "shadow",
    agencyConfigurable: true,
    validator: z.enum(["none", "crisp", "soft", "ambient"]),
    defaultValue: "crisp",
    group: "Shape",
    description: "`soft` and `ambient` produce the low, warm editorial lift used on Muse Bridal cards.",
  },

  // ── Motion ──────────────────────────────────────────────────────────
  "motion.preset": {
    key: "motion.preset",
    label: "Motion feel",
    scope: "motion",
    agencyConfigurable: true,
    validator: z.enum(["none", "snappy", "refined", "editorial"]),
    defaultValue: "snappy",
    group: "Motion",
    description:
      "`refined` = slow, eased reveals for premium brands. `editorial` adds parallax + image zoom on hover. All presets respect `prefers-reduced-motion`.",
  },

  // ── Density ─────────────────────────────────────────────────────────
  "spacing.scale": {
    key: "spacing.scale",
    label: "Spacing scale",
    scope: "spacing",
    agencyConfigurable: true,
    validator: z.enum(["compact", "cozy", "comfortable", "editorial"]),
    defaultValue: "cozy",
    group: "Density",
    description: "`editorial` ships the generous whitespace rhythm used on Muse Bridal.",
  },
  "density.section-padding": {
    key: "density.section-padding",
    label: "Section padding",
    scope: "density",
    agencyConfigurable: true,
    validator: z.enum(["tight", "standard", "airy", "editorial"]),
    defaultValue: "standard",
    group: "Density",
  },
  "density.container-width": {
    key: "density.container-width",
    label: "Container width",
    scope: "density",
    agencyConfigurable: true,
    validator: z.enum(["narrow", "standard", "wide", "editorial"]),
    defaultValue: "standard",
    group: "Density",
  },

  // ── Icons ───────────────────────────────────────────────────────────
  "icon.family": {
    key: "icon.family",
    label: "Icon family",
    scope: "icon",
    agencyConfigurable: true,
    validator: z.enum(["lucide", "editorial-line", "geometric"]),
    defaultValue: "lucide",
    group: "Icons",
    description:
      "`editorial-line` = thin-stroke bouquet / brush / ring icon set used on Muse Bridal. `geometric` = Bauhaus-style flat shapes.",
  },

  // ── Site shell ──────────────────────────────────────────────────────
  "shell.header-variant": {
    key: "shell.header-variant",
    label: "Header style",
    scope: "shell",
    agencyConfigurable: true,
    validator: z.enum([
      "classic-solid",
      "editorial-sticky",
      "espresso-column",
      "centered-editorial",
      "minimal",
    ]),
    defaultValue: "classic-solid",
    group: "Site shell",
    description:
      "`editorial-sticky` = transparent over hero, solid on scroll. `espresso-column` = always-solid dark. `centered-editorial` = logo center, nav split.",
  },
  "shell.header-sticky": {
    key: "shell.header-sticky",
    label: "Sticky header",
    scope: "shell",
    agencyConfigurable: true,
    validator: z.enum(["on", "off"]),
    defaultValue: "on",
    group: "Site shell",
  },
  "shell.header-transparent-on-hero": {
    key: "shell.header-transparent-on-hero",
    label: "Transparent header over hero",
    scope: "shell",
    agencyConfigurable: true,
    validator: z.enum(["on", "off"]),
    defaultValue: "off",
    group: "Site shell",
  },
  "shell.footer-variant": {
    key: "shell.footer-variant",
    label: "Footer style",
    scope: "shell",
    agencyConfigurable: true,
    validator: z.enum([
      "classic-minimal",
      "espresso-column",
      "ivory-minimal",
      "serif-editorial",
    ]),
    defaultValue: "classic-minimal",
    group: "Site shell",
  },
  "shell.mobile-nav-variant": {
    key: "shell.mobile-nav-variant",
    label: "Mobile menu style",
    scope: "shell",
    agencyConfigurable: true,
    validator: z.enum([
      "drawer-right",
      "full-screen-fade",
      "sheet-bottom",
    ]),
    defaultValue: "drawer-right",
    group: "Site shell",
  },
  "shell.logo-variant": {
    key: "shell.logo-variant",
    label: "Logo style",
    scope: "shell",
    agencyConfigurable: true,
    validator: z.enum(["wordmark", "muse-split", "monogram", "custom-svg"]),
    defaultValue: "wordmark",
    group: "Site shell",
    description:
      "`muse-split` is the Muse Bridal lockup (name + kicker). `wordmark` = single brand line. `monogram` = compact symbol-first.",
  },
  "motion.stagger-preset": {
    key: "motion.stagger-preset",
    label: "Reveal stagger",
    scope: "motion",
    agencyConfigurable: true,
    validator: z.enum(["none", "subtle", "editorial", "dramatic"]),
    defaultValue: "subtle",
    group: "Motion",
    description:
      "Cascade timing of reveal-on-scroll animations inside multi-item sections. `editorial` = 90ms per item; `dramatic` = 180ms.",
  },
  "directory.card.show-destination-ready-ribbon": {
    key: "directory.card.show-destination-ready-ribbon",
    label: "Show “Destination-ready” ribbon",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum(["on", "off"]),
    defaultValue: "off",
    group: "Template families",
    description:
      "When on, talent who travel globally get an editorial ribbon on the directory card + profile hero.",
  },
  "directory.card.show-starting-from-price": {
    key: "directory.card.show-starting-from-price",
    label: "Show “Starting from” price",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum(["on", "off"]),
    defaultValue: "off",
    group: "Template families",
  },
  "directory.card.specialty-chips-max": {
    key: "directory.card.specialty-chips-max",
    label: "Specialty chips per card",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum(["0", "1", "2", "3", "4", "5"]),
    defaultValue: "3",
    group: "Template families",
  },
  "profile.sticky-inquiry-bar": {
    key: "profile.sticky-inquiry-bar",
    label: "Sticky inquiry bar on profile",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum(["on", "off"]),
    defaultValue: "off",
    group: "Template families",
    description:
      "Fixed bottom-of-screen inquiry bar on profile pages (editorial-bridal default).",
  },
  "profile.blocks-visibility": {
    key: "profile.blocks-visibility",
    label: "Profile block visibility preset",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum([
      "all-visible",
      "editorial-bridal",
      "service-professional",
      "portfolio-first",
      "minimal",
    ]),
    defaultValue: "all-visible",
    group: "Template families",
    description:
      "Which profile blocks show. `editorial-bridal` = hero+about+specialties+event_styles+portfolio+travel+packages+testimonials+related+sticky_cta. `minimal` = hero+about+inquiry.",
  },

  // ── Template families (M7.1) ─────────────────────────────────────────
  // Directory card + profile-page "families" — drive which layout variant
  // the rendered card / profile uses. Adding a family is a registry
  // extension + a new Component + a new CSS block, no schema migration.
  "template.directory-card-family": {
    key: "template.directory-card-family",
    label: "Directory card family",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum([
      "classic",
      "service-professional",
      "editorial-bridal",
    ]),
    defaultValue: "classic",
    group: "Template families",
    description:
      "`classic` = the platform default (name+city+fit chips). `service-professional` = service-first with tags. `editorial-bridal` = portrait-first with specialty chips + destination-ready ribbon.",
  },
  "template.profile-layout-family": {
    key: "template.profile-layout-family",
    label: "Profile page family",
    scope: "template",
    agencyConfigurable: true,
    validator: z.enum([
      "classic",
      "service-professional",
      "editorial-bridal",
    ]),
    defaultValue: "classic",
    group: "Template families",
    description:
      "Controls the profile hero/layout/section-order. `editorial-bridal` = portrait hero + specialties + event styles + travel + packages + testimonials + related.",
  },

  // ── Page background ─────────────────────────────────────────────────
  "background.mode": {
    key: "background.mode",
    label: "Page background",
    scope: "background",
    agencyConfigurable: true,
    validator: z.enum([
      "plain",
      "aurora",
      "editorial-ivory",
      "editorial-noir",
      "champagne-gradient",
      "noise-texture",
      // Phase 5 — mesh-gradient presets (CSS conic + multiple radial
      // gradients layered; performant, no JS, no images).
      "mesh-blush",
      "mesh-sage",
      "mesh-noir",
      "mesh-aurora",
      "noise-animated",
    ]),
    defaultValue: "plain",
    group: "Site shell",
    description:
      "`editorial-ivory` is the warm Muse Bridal canvas. `editorial-noir` is the black-canvas gold-serif register (original Impronta). `aurora` is the existing default radial glow. `plain` = neutral solid background.",
  },
};

export function getToken(key: string): TokenSpec | null {
  return TOKEN_REGISTRY[key] ?? null;
}

export function listAgencyConfigurableTokens(): ReadonlyArray<TokenSpec> {
  return Object.values(TOKEN_REGISTRY).filter((t) => t.agencyConfigurable);
}

/** Grouped view for admin UI — stable order matches registry declaration. */
export function listAgencyConfigurableTokensByGroup(): Array<{
  group: string;
  tokens: ReadonlyArray<TokenSpec>;
}> {
  const groups = new Map<string, TokenSpec[]>();
  const order: string[] = [];
  for (const spec of Object.values(TOKEN_REGISTRY)) {
    if (!spec.agencyConfigurable) continue;
    const g = spec.group ?? "Other";
    if (!groups.has(g)) {
      groups.set(g, []);
      order.push(g);
    }
    groups.get(g)!.push(spec);
  }
  return order.map((g) => ({ group: g, tokens: groups.get(g)! }));
}

export function isTokenOverridable(key: string): boolean {
  return Boolean(TOKEN_REGISTRY[key]?.agencyConfigurable);
}

/**
 * Validate an incoming theme_json patch against the registry. Rejects any
 * keys that are not registered or not agency-configurable.
 *
 * Returns { ok: true, normalized } on success or
 * { ok: false, rejected: [...] } listing the keys that failed.
 */
export function validateThemePatch(
  patch: Record<string, unknown>,
):
  | { ok: true; normalized: Record<string, string> }
  | { ok: false; rejected: string[]; reasons: Record<string, string> } {
  const rejected: string[] = [];
  const reasons: Record<string, string> = {};
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(patch)) {
    const spec = TOKEN_REGISTRY[key];
    if (!spec) {
      rejected.push(key);
      reasons[key] = "Unknown token";
      continue;
    }
    if (!spec.agencyConfigurable) {
      rejected.push(key);
      reasons[key] = "Not agency-configurable";
      continue;
    }
    const parsed = spec.validator.safeParse(value);
    if (!parsed.success) {
      rejected.push(key);
      reasons[key] = parsed.error.issues[0]?.message ?? "Invalid value";
      continue;
    }
    normalized[key] = parsed.data;
  }

  if (rejected.length > 0) return { ok: false, rejected, reasons };
  return { ok: true, normalized };
}

export function tokenDefaults(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const spec of Object.values(TOKEN_REGISTRY)) {
    out[spec.key] = spec.defaultValue;
  }
  return out;
}
