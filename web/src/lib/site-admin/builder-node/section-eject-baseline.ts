import type { BuilderNodeStyle } from "./types";
import type { BuilderNodeRole } from "./role-bindings";

/**
 * SECTION-EJECT BASELINE — the curated component's OWN look, baked onto the
 * ejected children so "Unlock design" is visually identity-preserving.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A curated section's design lives in its stylesheet (`token-presets.css` /
 * `globals.css`), not in its props. `nodePresentation` only carries the
 * operator's EXPLICIT per-role overrides, so a section the operator never
 * touched ejected to children rendered with builder DEFAULTS: the
 * rivieramayawork `cta_banner` headline dropped 48px → 25.5px, the eyebrow
 * jumped 12px → 17px, the CTA fell to the freeform button's 13.12px, and
 * everything went text-align start. This module gives the eject pathway a
 * per-role Engine-A (`BuilderNodeStyle`) baseline that mirrors the curated
 * CSS, merged UNDER the operator's explicit styling — their choice still wins.
 *
 * DRIFT-PROOFING (the honesty contract)
 * ─────────────────────────────────────
 * A hand-kept mirror of CSS silently diverges. Every mirrored value here is
 * therefore created through `css()` / `pin()` which enrol the exact
 * (file, selector, property, value) in `MIRRORED_CSS_DECLS`. The static test
 * (`section-eject-baseline.test.ts`) parses the real stylesheets in load
 * order (token-presets.css is @import-ed at the top of globals.css), computes
 * the LAST declaration for each pinned selector+property (the cascade winner
 * among equal-specificity rules), and fails if the CSS no longer says what
 * this module says. A value cannot enter a baseline without entering the
 * guard.
 *
 * Known containment (stated, not hidden):
 * - The guard pins the declarations this module mirrors. A brand-new,
 *   higher-specificity rule elsewhere in the sheet could still change the
 *   curated look without touching these declarations; the guard cannot see
 *   that. It does catch every edit/move/removal of the mirrored values, which
 *   is the drift mode that has actually bitten.
 * - `text-transform: var(--site-label-case)` on `.site-eyebrow` is not
 *   bakeable (Engine A stores an enum, not a var()) and is dropped.
 * - The hero split-left/right @media ramp is not expressible in Engine-A
 *   tablet/mobile buckets (it is min-width based); split layouts get the base
 *   typography + left alignment only.
 *
 * COVERAGE
 * ────────
 * `cta_banner` (all three variants + band tones + image/no-image) and `hero`
 * (centered/split layouts, editorial/clean/cinematic moods, clean/image/slider
 * variants). Every other section type resolves to `undefined` and ejects
 * exactly as before this module existed.
 */

export type EjectRoleBaseline = Readonly<
  Partial<Record<BuilderNodeRole, BuilderNodeStyle>>
>;

export interface MirroredCssDecl {
  file: "token-presets.css" | "globals.css";
  selector: string;
  property: string;
  /** null = the selector must NOT declare this property (absence pin). */
  value: string | null;
}

const decls: MirroredCssDecl[] = [];
export const MIRRORED_CSS_DECLS: ReadonlyArray<MirroredCssDecl> = decls;

/** Enrol a mirrored declaration and hand its value back to the baseline. */
function css(
  file: MirroredCssDecl["file"],
  selector: string,
  property: string,
  value: string,
): string {
  decls.push({ file, selector, property, value });
  return value;
}

/** Enrol a declaration the baseline depends on without embedding its value
 * directly (e.g. a custom-property definition a color decl resolves through,
 * or a text-align on a wrapper the children inherit). */
function pin(
  file: MirroredCssDecl["file"],
  selector: string,
  property: string,
  value: string,
): string {
  return css(file, selector, property, value);
}

/** Enrol an ABSENCE pin: the curated selector declares no such property, and
 * the baseline counteracts a freeform default on the strength of that. */
function pinAbsent(
  file: MirroredCssDecl["file"],
  selector: string,
  property: string,
): void {
  decls.push({ file, selector, property, value: null });
}

/** `padding: <block> <inline>` shorthand → Engine-A per-side escapes. */
function paddingSides(
  file: MirroredCssDecl["file"],
  selector: string,
  value: string,
): Pick<
  BuilderNodeStyle,
  "paddingTop" | "paddingBottom" | "paddingLeft" | "paddingRight"
> {
  css(file, selector, "padding", value);
  const [block, inline] = value.split(/\s+/);
  return {
    paddingTop: block,
    paddingBottom: block,
    paddingLeft: inline,
    paddingRight: inline,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// cta_banner — mirrors token-presets.css (.site-cta-banner__*, .site-eyebrow,
// .site-prim-cta). Effective cascade note: the H2-token group later in the
// sheet re-declares the headline's font-size/letter-spacing, so the LAST
// declaration is the one mirrored here.
// ────────────────────────────────────────────────────────────────────────────

const CTA_SHELL_ALIGN = pin(
  "token-presets.css",
  ".site-cta-banner__shell",
  "text-align",
  "center",
) as "center";
const CTA_SPLIT_ALIGN = pin(
  "token-presets.css",
  '.site-cta-banner[data-variant="split-image"] .site-cta-banner__inner',
  "text-align",
  "left",
) as "left";

const CTA_HEADLINE_BASE: BuilderNodeStyle = {
  align: CTA_SHELL_ALIGN,
  fontFamily: css(
    "token-presets.css",
    ".site-cta-banner__headline",
    "font-family",
    "var(--site-heading-font)",
  ),
  fontSize: css(
    "token-presets.css",
    ".site-cta-banner__headline",
    "font-size",
    "var(--token-typography-h2-size, clamp(28px, 4vw, 48px))",
  ),
  lineHeight: css(
    "token-presets.css",
    ".site-cta-banner__headline",
    "line-height",
    "1.05",
  ),
  letterSpacing: css(
    "token-presets.css",
    ".site-cta-banner__headline",
    "letter-spacing",
    "var(--site-heading-tracking, normal)",
  ),
  textColor: css(
    "token-presets.css",
    ".site-cta-banner__headline",
    "color",
    "var(--token-color-surface-raised)",
  ),
};

const CTA_EYEBROW_BASE: BuilderNodeStyle = {
  align: CTA_SHELL_ALIGN,
  fontSize: css("token-presets.css", ".site-eyebrow", "font-size", "12px"),
  fontWeight: Number(
    css("token-presets.css", ".site-eyebrow", "font-weight", "500"),
  ),
  letterSpacing: css(
    "token-presets.css",
    ".site-eyebrow",
    "letter-spacing",
    "var(--site-label-tracking)",
  ),
  textColor: css(
    "token-presets.css",
    ".site-cta-banner__inner .site-eyebrow",
    "color",
    "var(--token-color-surface-raised)",
  ),
};

const CTA_COPY_BASE: BuilderNodeStyle = {
  align: CTA_SHELL_ALIGN,
  fontSize: css(
    "token-presets.css",
    ".site-cta-banner__copy",
    "font-size",
    "17px",
  ),
  lineHeight: css(
    "token-presets.css",
    ".site-cta-banner__copy",
    "line-height",
    "1.55",
  ),
  textColor: css(
    "token-presets.css",
    ".site-cta-banner__copy",
    "color",
    "rgba(255, 255, 255, 0.88)",
  ),
  maxWidthFree: css(
    "token-presets.css",
    ".site-cta-banner__copy",
    "max-width",
    "540px",
  ),
};

// The freeform button default is 0.82rem/uppercase/0.08em tracking; the shared
// curated Cta primitive is 14px, weight 500, tracking 0.005em, NO transform.
pinAbsent("token-presets.css", ".site-prim-cta", "text-transform");
const CTA_BUTTON_SHARED: BuilderNodeStyle = {
  fontFamily: css(
    "token-presets.css",
    ".site-prim-cta",
    "font-family",
    "var(--site-body-font)",
  ),
  fontSize: css("token-presets.css", ".site-prim-cta", "font-size", "14px"),
  fontWeight: Number(
    css("token-presets.css", ".site-prim-cta", "font-weight", "500"),
  ),
  letterSpacing: css(
    "token-presets.css",
    ".site-prim-cta",
    "letter-spacing",
    "0.005em",
  ),
  textTransform: "none",
  borderRadius: css(
    "token-presets.css",
    ".site-prim-cta",
    "border-radius",
    "999px",
  ),
  borderWidth: "1px",
  borderStyle: "solid",
  ...paddingSides("token-presets.css", ".site-prim-cta", "12px 22px"),
};
pin("token-presets.css", ".site-prim-cta", "border", "1px solid transparent");

const CTA_BUTTON_PRIMARY: BuilderNodeStyle = {
  ...CTA_BUTTON_SHARED,
  backgroundColor: css(
    "token-presets.css",
    ".site-prim-cta--primary",
    "background",
    "var(--token-color-primary, #1a1a1a)",
  ),
  textColor: css(
    "token-presets.css",
    ".site-prim-cta--primary",
    "color",
    "var(--token-color-surface-raised, #ffffff)",
  ),
  borderColor: css(
    "token-presets.css",
    ".site-prim-cta--primary",
    "border-color",
    "var(--token-color-primary, #1a1a1a)",
  ),
};

const CTA_BUTTON_SECONDARY: BuilderNodeStyle = {
  ...CTA_BUTTON_SHARED,
  backgroundColor: css(
    "token-presets.css",
    ".site-prim-cta--secondary",
    "background",
    "transparent",
  ),
  textColor: css(
    "token-presets.css",
    ".site-prim-cta--secondary",
    "color",
    "var(--token-color-primary, #1a1a1a)",
  ),
  borderColor: css(
    "token-presets.css",
    ".site-prim-cta--secondary",
    "border-color",
    "color-mix(in srgb, var(--token-color-primary, #1a1a1a) 36%, transparent)",
  ),
};

// Variant color layers.
const CTA_NOIMG_HEADLINE_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="centered-overlay"]:not([data-has-image="true"]) .site-cta-banner__headline',
  "color",
  "#f6f1ea",
);
const CTA_NOIMG_COPY_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="centered-overlay"]:not([data-has-image="true"]) .site-cta-banner__copy',
  "color",
  "rgba(246, 241, 234, 0.88)",
);
const CTA_NOIMG_EYEBROW_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="centered-overlay"]:not([data-has-image="true"]) .site-cta-banner__inner .site-eyebrow',
  "color",
  "rgba(246, 241, 234, 0.72)",
);
const CTA_BAND_HEADLINE_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="minimal-band"] .site-cta-banner__headline',
  "color",
  "var(--token-color-ink)",
);
const CTA_BAND_COPY_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="minimal-band"] .site-cta-banner__copy',
  "color",
  "var(--token-color-muted)",
);
const CTA_BAND_EYEBROW_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="minimal-band"] .site-cta-banner__inner .site-eyebrow',
  "color",
  "var(--token-color-primary)",
);
const CTA_BAND_ESPRESSO_HEADLINE_COLOR = css(
  "token-presets.css",
  '.site-cta-banner[data-variant="minimal-band"][data-band-tone="espresso"] .site-cta-banner__headline',
  "color",
  "#f6f1ea",
);

function ctaBannerBaseline(
  rawProps: Record<string, unknown> | undefined,
): EjectRoleBaseline {
  const variant =
    typeof rawProps?.variant === "string" ? rawProps.variant : "centered-overlay";
  const bandTone =
    typeof rawProps?.bandTone === "string" ? rawProps.bandTone : "ivory";
  const hasImage =
    typeof rawProps?.backgroundImageUrl === "string" &&
    rawProps.backgroundImageUrl.trim().length > 0;

  let headline = CTA_HEADLINE_BASE;
  let eyebrow = CTA_EYEBROW_BASE;
  let copy = CTA_COPY_BASE;
  if (variant === "centered-overlay" && !hasImage) {
    headline = { ...headline, textColor: CTA_NOIMG_HEADLINE_COLOR };
    copy = { ...copy, textColor: CTA_NOIMG_COPY_COLOR };
    eyebrow = { ...eyebrow, textColor: CTA_NOIMG_EYEBROW_COLOR };
  } else if (variant === "minimal-band") {
    headline = {
      ...headline,
      textColor:
        bandTone === "espresso"
          ? CTA_BAND_ESPRESSO_HEADLINE_COLOR
          : CTA_BAND_HEADLINE_COLOR,
    };
    copy = { ...copy, textColor: CTA_BAND_COPY_COLOR };
    eyebrow = { ...eyebrow, textColor: CTA_BAND_EYEBROW_COLOR };
  } else if (variant === "split-image") {
    headline = { ...headline, align: CTA_SPLIT_ALIGN };
    copy = { ...copy, align: CTA_SPLIT_ALIGN };
    eyebrow = { ...eyebrow, align: CTA_SPLIT_ALIGN };
  }
  return {
    headline,
    subheadline: eyebrow,
    copy,
    primaryCta: CTA_BUTTON_PRIMARY,
    secondaryCta: CTA_BUTTON_SECONDARY,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// hero — base rules live in globals.css (loaded AFTER token-presets.css via
// @import order, so its equal-specificity declarations win the cascade).
// ────────────────────────────────────────────────────────────────────────────

const HERO_INNER_ALIGN = pin(
  "globals.css",
  ".site-hero__inner",
  "text-align",
  "center",
) as "center";

const HERO_HEADLINE_BASE: BuilderNodeStyle = {
  align: HERO_INNER_ALIGN,
  fontFamily: css(
    "globals.css",
    ".site-hero__headline",
    "font-family",
    "var(--font-cinzel), var(--font-playfair-display), ui-serif, Georgia, serif",
  ),
  fontWeight: Number(
    css("globals.css", ".site-hero__headline", "font-weight", "500"),
  ),
  fontSize: css(
    "globals.css",
    ".site-hero__headline",
    "font-size",
    "clamp(2rem, 5vw, 3.75rem)",
  ),
  lineHeight: css("globals.css", ".site-hero__headline", "line-height", "1.08"),
  letterSpacing: css(
    "globals.css",
    ".site-hero__headline",
    "letter-spacing",
    "-0.01em",
  ),
  textColor: css(
    "globals.css",
    ".site-hero__headline",
    "color",
    "color-mix(in oklab, var(--token-color-ink, var(--foreground)) 96%, white)",
  ),
};

const HERO_CINEMATIC_FONT_SIZE = css(
  "globals.css",
  '.site-hero[data-hero-mood="cinematic"] .site-hero__headline',
  "font-size",
  "clamp(2.5rem, 7vw, 5rem)",
);
const HERO_CINEMATIC_TRACKING = css(
  "globals.css",
  '.site-hero[data-hero-mood="cinematic"] .site-hero__headline',
  "letter-spacing",
  "0.01em",
);

const HERO_SUBHEADLINE_BASE: BuilderNodeStyle = {
  align: HERO_INNER_ALIGN,
  fontSize: css(
    "globals.css",
    ".site-hero__subheadline",
    "font-size",
    "clamp(1rem, 1.4vw, 1.25rem)",
  ),
  lineHeight: css(
    "globals.css",
    ".site-hero__subheadline",
    "line-height",
    "1.55",
  ),
  maxWidthFree: css(
    "globals.css",
    ".site-hero__subheadline",
    "max-width",
    "38rem",
  ),
  textColor: css(
    "globals.css",
    ".site-hero__subheadline",
    "color",
    "color-mix(in oklab, var(--token-color-ink, var(--foreground)) 88%, transparent)",
  ),
};

// Photographic hero (one slide = "image", 2+ = "slider"): copy flips to the
// literal on-scrim pair. The vars are DEFINED on the curated wrapper, which no
// longer renders after eject, so the resolved literals are baked instead —
// both the var reference and its definition are pinned.
pin(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__headline',
  "color",
  "var(--site-hero-on-scrim)",
);
const HERO_ON_SCRIM = pin(
  "globals.css",
  '.site-hero[data-hero-variant="image"]',
  "--site-hero-on-scrim",
  "#f8fafc",
);
pin(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__subheadline',
  "color",
  "var(--site-hero-on-scrim-muted)",
);
const HERO_ON_SCRIM_MUTED = pin(
  "globals.css",
  '.site-hero[data-hero-variant="image"]',
  "--site-hero-on-scrim-muted",
  "rgba(248, 250, 252, 0.92)",
);
const HERO_SCRIM_HEADLINE_SHADOW = css(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__headline',
  "text-shadow",
  "0 2px 24px rgba(0, 0, 0, 0.55)",
);
const HERO_SCRIM_SUB_SHADOW = css(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__subheadline',
  "text-shadow",
  "0 1px 12px rgba(0, 0, 0, 0.5)",
);

pinAbsent("globals.css", ".site-hero__cta", "text-transform");
const HERO_CTA_SHARED: BuilderNodeStyle = {
  fontSize: css("globals.css", ".site-hero__cta", "font-size", "0.95rem"),
  fontWeight: Number(
    css("globals.css", ".site-hero__cta", "font-weight", "600"),
  ),
  letterSpacing: css(
    "globals.css",
    ".site-hero__cta",
    "letter-spacing",
    "0.02em",
  ),
  textTransform: "none",
  borderRadius: css(
    "globals.css",
    ".site-hero__cta",
    "border-radius",
    "999px",
  ),
  ...paddingSides("globals.css", ".site-hero__cta", "0.85rem 1.6rem"),
};

const HERO_CTA_PRIMARY: BuilderNodeStyle = {
  ...HERO_CTA_SHARED,
  backgroundColor: css(
    "globals.css",
    ".site-hero__cta--primary",
    "background",
    "var(--token-color-primary, var(--primary))",
  ),
  textColor: css(
    "globals.css",
    ".site-hero__cta--primary",
    "color",
    "var(--token-color-surface-raised, #ffffff)",
  ),
};

const HERO_CTA_SECONDARY: BuilderNodeStyle = {
  ...HERO_CTA_SHARED,
  backgroundColor: css(
    "globals.css",
    ".site-hero__cta--secondary",
    "background",
    "color-mix(in oklab, var(--foreground) 8%, transparent)",
  ),
  textColor: css(
    "globals.css",
    ".site-hero__cta--secondary",
    "color",
    "var(--foreground)",
  ),
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "color-mix(in oklab, var(--foreground) 22%, transparent)",
};
pin(
  "globals.css",
  ".site-hero__cta--secondary",
  "border",
  "1px solid color-mix(in oklab, var(--foreground) 22%, transparent)",
);

const HERO_SCRIM_SECONDARY_BG = css(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__cta--secondary',
  "background",
  "rgba(248, 250, 252, 0.14)",
);
const HERO_SCRIM_SECONDARY_BORDER = css(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__cta--secondary',
  "border-color",
  "rgba(248, 250, 252, 0.44)",
);
pin(
  "globals.css",
  '.site-hero[data-hero-variant="image"] .site-hero__cta--secondary',
  "color",
  "var(--site-hero-on-scrim)",
);

const HERO_SPLIT_ALIGN = pin(
  "globals.css",
  '.site-hero[data-hero-layout="split-left"] .site-hero__headline',
  "text-align",
  "left",
) as "left";

function heroBaseline(
  rawProps: Record<string, unknown> | undefined,
): EjectRoleBaseline {
  const mood = typeof rawProps?.mood === "string" ? rawProps.mood : "editorial";
  const layout =
    typeof rawProps?.layout === "string" ? rawProps.layout : "centered";
  const slides = Array.isArray(rawProps?.slides) ? rawProps.slides : [];
  const hasSlides = slides.length > 0;
  const isSplit = layout === "split-left" || layout === "split-right";

  let headline = HERO_HEADLINE_BASE;
  let subheadline = HERO_SUBHEADLINE_BASE;
  let secondaryCta = HERO_CTA_SECONDARY;
  if (mood === "cinematic") {
    headline = {
      ...headline,
      fontSize: HERO_CINEMATIC_FONT_SIZE,
      letterSpacing: HERO_CINEMATIC_TRACKING,
    };
  }
  if (hasSlides) {
    headline = {
      ...headline,
      textColor: HERO_ON_SCRIM,
      textShadow: HERO_SCRIM_HEADLINE_SHADOW,
    };
    subheadline = {
      ...subheadline,
      textColor: HERO_ON_SCRIM_MUTED,
      textShadow: HERO_SCRIM_SUB_SHADOW,
    };
    secondaryCta = {
      ...secondaryCta,
      backgroundColor: HERO_SCRIM_SECONDARY_BG,
      borderColor: HERO_SCRIM_SECONDARY_BORDER,
      textColor: HERO_ON_SCRIM,
    };
  }
  if (isSplit) {
    // Split layouts left-align copy. Their tighter @media(min-width) type
    // ramp is not expressible in Engine-A buckets; base typography carries.
    headline = { ...headline, align: HERO_SPLIT_ALIGN };
    subheadline = { ...subheadline, align: HERO_SPLIT_ALIGN };
  }
  return {
    headline,
    subheadline,
    primaryCta: HERO_CTA_PRIMARY,
    secondaryCta,
  };
}

// ────────────────────────────────────────────────────────────────────────────

type SectionEjectBaselineResolver = (
  rawProps: Record<string, unknown> | undefined,
) => EjectRoleBaseline;

const SECTION_EJECT_BASELINES: Record<string, SectionEjectBaselineResolver> = {
  cta_banner: ctaBannerBaseline,
  hero: heroBaseline,
};

/** Section types whose eject carries a curated-CSS baseline. */
export const SECTION_EJECT_BASELINE_TYPE_KEYS: ReadonlyArray<string> =
  Object.freeze(Object.keys(SECTION_EJECT_BASELINES));

/**
 * Resolve the curated-CSS baseline for a section type, or `undefined` when the
 * type has no baseline (the eject then behaves exactly as before). Pure and
 * synchronous; `rawProps` (the section's saved curated config) selects the
 * variant/mood layer and may be omitted, which yields the schema-default look.
 */
export function resolveSectionEjectBaseline(
  sectionTypeKey: string,
  rawProps?: Record<string, unknown> | null,
): EjectRoleBaseline | undefined {
  const resolver = Object.prototype.hasOwnProperty.call(
    SECTION_EJECT_BASELINES,
    sectionTypeKey,
  )
    ? SECTION_EJECT_BASELINES[sectionTypeKey]
    : undefined;
  return resolver ? resolver(rawProps ?? undefined) : undefined;
}
