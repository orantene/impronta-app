/**
 * M8 — SectionPresentation: shared sub-schema inherited by every section.
 *
 * Base controls (Phase 1, all per-section):
 *   - background       neutral-to-espresso palette toggle
 *   - paddingTop       section vertical rhythm (top)
 *   - paddingBottom    section vertical rhythm (bottom)
 *   - containerWidth   narrow / standard / wide / editorial / full-bleed
 *   - align            left / center / right (applies to headings + copy)
 *   - dividerTop       none / thin-line / gradient-fade / decorative
 *   - mobileStack      default / single-column / horizontal-scroll
 *   - visibility       always / desktop-only / mobile-only / hidden
 *
 * Phase 6 extensions:
 *   - breakpoints      per-viewport overrides (tablet + mobile) over the
 *                      same 8-field shape. Desktop is the inherited base.
 *                      Override inheritance: an unset tablet/mobile field
 *                      falls through to the desktop value. Pure CSS cascade
 *                      via `data-section-tablet-*` / `data-section-mobile-*`
 *                      attrs + scoped @media rules in token-presets.css —
 *                      no JS at render time.
 *   - animation        entry / scroll / hover micro-interactions plus a
 *                      reducedMotion knob. CSS-driven keyframes; the
 *                      "respect" mode (default) is gated behind
 *                      `@media (prefers-reduced-motion: no-preference)`.
 *
 * Every field is optional so legacy section instances continue to parse.
 * The component reads the presentation object and sets data attributes;
 * `token-presets.css` maps the attrs onto CSS rules that work across all
 * section types without per-section CSS duplication.
 *
 * Why optional?
 *   - Backward compat: existing saved sections must keep rendering.
 *   - Theme presets control defaults — when a tenant picks Editorial Bridal,
 *     storefront CSS fills in "editorial" padding/container automatically.
 */

import { z } from "zod";

/**
 * ── Pixel-first companion fields ───────────────────────────────────────
 *
 * Phase 1 of the page-builder vision roadmap: every preset enum gets an
 * optional companion field carrying a raw `{ value, unit }`. When set, the
 * companion overrides the enum (the renderer skips the data-attr so the
 * inline style wins by specificity). The token-default + pixel-escape
 * pattern: tokens stay the default, pixels are one click away.
 */
const lengthUnitEnum = z.enum(["px", "rem", "em", "%", "vw", "vh"]);

export const customLengthSchema = z.object({
  value: z.number().finite(),
  unit: lengthUnitEnum,
});

export type CustomLength = z.infer<typeof customLengthSchema>;

const backgroundEnum = z.enum([
  "canvas",       // follows the tenant's background.mode (default)
  "ivory",
  "champagne",
  "espresso",
  "blush",
  "sage",
  "muted-surface",
]);

const paddingEnum = z.enum(["none", "tight", "standard", "airy", "editorial"]);

const containerEnum = z.enum([
  "narrow",
  "standard",
  "wide",
  "editorial",
  "full-bleed",
]);

const alignEnum = z.enum(["left", "center", "right"]);

const dividerEnum = z.enum(["none", "thin-line", "gradient-fade", "decorative"]);

const mobileStackEnum = z.enum([
  "default",
  "single-column",
  "horizontal-scroll",
]);

const visibilityEnum = z.enum([
  "always",
  "desktop-only",
  "mobile-only",
  "hidden",
]);

/**
 * One breakpoint's worth of overrides. Same shape as the base presentation
 * fields, all optional — an unset field inherits from the desktop base.
 *
 * `mobileStack` and `visibility` aren't repeated here: the base already
 * carries device-aware semantics, and re-overriding them per-breakpoint
 * would create surprising cascades.
 */
export const breakpointOverrideSchema = z
  .object({
    background: backgroundEnum.optional(),
    paddingTop: paddingEnum.optional(),
    paddingBottom: paddingEnum.optional(),
    containerWidth: containerEnum.optional(),
    align: alignEnum.optional(),
    dividerTop: dividerEnum.optional(),
  })
  .optional();

export type BreakpointOverride = z.infer<typeof breakpointOverrideSchema>;

/**
 * Section-level animation controls.
 *
 *   - entry        runs once when the section enters the viewport
 *   - scroll       continuous behavior bound to scroll position
 *   - hover        applied when the operator points at the section card
 *   - reducedMotion 'respect' (default) gates all animation behind
 *                  `prefers-reduced-motion: no-preference`. 'always'
 *                  forces animation regardless — the operator opts in
 *                  with full awareness of the accessibility tradeoff.
 */
export const sectionAnimationSchema = z
  .object({
    entry: z
      .enum([
        "none",
        "fade",
        "fade-up",
        "fade-down",
        "slide-left",
        "slide-right",
        "scale-in",
      ])
      .optional(),
    scroll: z.enum(["none", "parallax-soft", "reveal-stagger"]).optional(),
    hover: z.enum(["none", "lift", "glow", "tilt"]).optional(),
    reducedMotion: z.enum(["respect", "always"]).optional(),
  })
  .optional();

export type SectionAnimation = z.infer<typeof sectionAnimationSchema>;

export const sectionPresentationSchema = z
  .object({
    background: backgroundEnum.optional(),

    paddingTop: paddingEnum.optional(),
    paddingBottom: paddingEnum.optional(),

    containerWidth: containerEnum.optional(),

    align: alignEnum.optional(),

    dividerTop: dividerEnum.optional(),

    mobileStack: mobileStackEnum.optional(),

    visibility: visibilityEnum.optional(),

    /**
     * Per-viewport overrides. Desktop is the inherited base; tablet
     * overrides take effect at ≤ 1023px, mobile at ≤ 640px. CSS cascade
     * naturally handles the inheritance — unset fields fall through.
     */
    breakpoints: z
      .object({
        tablet: breakpointOverrideSchema,
        mobile: breakpointOverrideSchema,
      })
      .optional(),

    animation: sectionAnimationSchema,

    /**
     * ── Pixel-first companion fields ─────────────────────────────────
     * When set, these override the corresponding enum field. The
     * renderer omits the enum's data-attr so the inline style wins.
     * All optional — sections that don't set them keep using token
     * defaults via `data-section-*` attrs.
     */
    paddingTopCustom: customLengthSchema.optional(),
    paddingBottomCustom: customLengthSchema.optional(),
    paddingLeftCustom: customLengthSchema.optional(),
    paddingRightCustom: customLengthSchema.optional(),
    marginTopCustom: customLengthSchema.optional(),
    marginBottomCustom: customLengthSchema.optional(),
    containerWidthCustom: customLengthSchema.optional(),

    /** Free-color background (any hex/rgba). Overrides background enum. */
    backgroundColorCustom: z.string().optional(),

    /** Per-section custom CSS, scoped to the section root via `.cms-section[data-section-id="..."] { ... }`. */
    customCss: z.string().optional(),

    /**
     * ── Phase 4 (compositional freedom) ──────────────────────────────
     *
     * fullBleed: the section's content escapes its parent container width
     *   (max-width: none, padding: 0). Useful for hero strips that need to
     *   touch the viewport edge regardless of the page's container token.
     *
     * overlapTop / overlapBottom: pull the section UP (negative margin-top)
     *   or push the next section UP (negative margin-bottom). Pixel value
     *   in CustomLength so the operator picks units. Used to overlap a
     *   hero with the section below it, magazine-style.
     *
     * stickyTop: the section sticks to the top of the viewport while the
     *   user scrolls past it (within its parent stacking context). Number
     *   value in pixels = the offset from the top.
     */
    fullBleed: z.boolean().optional(),
    overlapTop: customLengthSchema.optional(),
    overlapBottom: customLengthSchema.optional(),
    stickyTop: z.number().int().nonnegative().optional(),

    /**
     * ── Phase 5 (motion + backgrounds) ───────────────────────────────
     *
     * videoBackground: render a muted, looped, autoplaying <video> behind
     *   the section content. The src is a full URL (operator picks via
     *   asset library or pastes a CDN URL). When set, the section gets
     *   a `position: relative` wrapper with the video absolutely
     *   positioned below the content layer.
     * videoPoster: optional poster image shown while video loads.
     * videoOverlay: optional dark overlay opacity (0-1) for legibility
     *   when text sits over a busy video.
     */
    videoBackground: z.string().url().optional(),
    videoPoster: z.string().url().optional(),
    videoOverlay: z.number().min(0).max(1).optional(),

    /**
     * Scroll-reveal entry animation. CSS-only via IntersectionObserver
     * + `[data-scroll-reveal]` attr the global `scroll-reveal.ts` script
     * toggles to `data-revealed`. The CSS for each preset lives in
     * token-presets.css. `none` disables the attr entirely.
     *
     * `parallaxIntensity`: 0..1, drives a CSS var the section uses to
     *   translateY relative to scroll position. 0 → no parallax,
     *   1 → strong (~80px range). Pure-CSS implementation via
     *   `animation-timeline: scroll()` where supported; falls back to
     *   no parallax in older browsers.
     */
    scrollReveal: z
      .enum(["none", "fade", "fade-up", "fade-down", "fade-left", "fade-right", "zoom"])
      .optional(),
    scrollRevealDelay: z.number().int().min(0).max(2000).optional(),
    parallaxIntensity: z.number().min(0).max(1).optional(),
    /**
     * Phase 5 — multi-layer parallax. When set, three CSS vars are
     * emitted (`--parallax-l1`, `--parallax-l2`, `--parallax-l3`) which
     * a section's renderer can attach to layered elements with
     * different translate magnitudes. Layer 1 = front, Layer 3 = back.
     */
    parallaxLayers: z
      .object({
        l1: z.number().min(0).max(1).optional(),
        l2: z.number().min(0).max(1).optional(),
        l3: z.number().min(0).max(1).optional(),
      })
      .optional(),

    /**
     * ── Phase 4 — composition lift (continued) ─────────────────────
     *
     * `gridArea`: when the page composer's slot supports CSS Grid
     *   placement, this is the CSS `grid-area` value applied to the
     *   section. Free string (e.g. "1 / 1 / 3 / 5" or "main").
     *   Today's slot model is flat-stack; this is reserved for the
     *   asymmetric-grid composer when it ships.
     * `zIndex`: stacking-order escape for sections that overlap. Use
     *   sparingly with overlapTop / overlapBottom.
     * `pinScrollSection`: when true, the section becomes a scroll-
     *   pinned region — children scroll while the section stays in
     *   the viewport. Pure-CSS via `position: sticky` on the section
     *   wrapper plus `min-height: 100vh` (set by the renderer).
     */
    gridArea: z.string().max(60).optional(),
    zIndex: z.number().int().min(-10).max(50).optional(),
    pinScrollSection: z.boolean().optional(),
  })
  .optional();

export type SectionPresentation = z.infer<typeof sectionPresentationSchema>;

/**
 * Flatten a SectionPresentation object into a Record of HTML data attributes.
 * Call this in every section Component and spread into the root element.
 *
 * Resulting attrs are consumed by `token-presets.css`:
 *   [data-section-background="champagne"] → champagne gradient
 *   [data-section-padding-top="editorial"] → clamp section_y
 *   [data-section-tablet-padding-top="tight"] → tablet override
 *   [data-section-mobile-container="narrow"] → mobile override
 *   [data-section-anim-entry="fade-up"] → fade-up entry animation
 *   [data-section-anim-reduced-motion="always"] → ignore prefers-reduced-motion
 *   ...etc.
 */
export function presentationDataAttrs(
  p?: SectionPresentation,
): Record<string, string> {
  if (!p) return {};
  const out: Record<string, string> = {};

  // Base (desktop) presentation. Custom companions OVERRIDE — when a custom
  // length is set we skip emitting the enum's data-attr so the inline style
  // (specificity 1,0,0,0 vs the !important class rules) wins.
  if (p.background && !p.backgroundColorCustom)
    out["data-section-background"] = p.background;
  if (p.paddingTop && !p.paddingTopCustom)
    out["data-section-padding-top"] = p.paddingTop;
  if (p.paddingBottom && !p.paddingBottomCustom)
    out["data-section-padding-bottom"] = p.paddingBottom;
  if (p.containerWidth && !p.containerWidthCustom)
    out["data-section-container"] = p.containerWidth;
  if (p.align) out["data-section-align"] = p.align;
  if (p.dividerTop) out["data-section-divider-top"] = p.dividerTop;
  if (p.mobileStack) out["data-section-mobile-stack"] = p.mobileStack;
  if (p.visibility) out["data-section-visibility"] = p.visibility;

  // Per-breakpoint overrides. CSS @media rules pick these up; missing
  // attrs simply fall through to the base via natural cascade.
  const tablet = p.breakpoints?.tablet;
  if (tablet) {
    if (tablet.background) out["data-section-tablet-background"] = tablet.background;
    if (tablet.paddingTop) out["data-section-tablet-padding-top"] = tablet.paddingTop;
    if (tablet.paddingBottom) out["data-section-tablet-padding-bottom"] = tablet.paddingBottom;
    if (tablet.containerWidth) out["data-section-tablet-container"] = tablet.containerWidth;
    if (tablet.align) out["data-section-tablet-align"] = tablet.align;
    if (tablet.dividerTop) out["data-section-tablet-divider-top"] = tablet.dividerTop;
  }
  const mobile = p.breakpoints?.mobile;
  if (mobile) {
    if (mobile.background) out["data-section-mobile-background"] = mobile.background;
    if (mobile.paddingTop) out["data-section-mobile-padding-top"] = mobile.paddingTop;
    if (mobile.paddingBottom) out["data-section-mobile-padding-bottom"] = mobile.paddingBottom;
    if (mobile.containerWidth) out["data-section-mobile-container"] = mobile.containerWidth;
    if (mobile.align) out["data-section-mobile-align"] = mobile.align;
    if (mobile.dividerTop) out["data-section-mobile-divider-top"] = mobile.dividerTop;
  }

  // Animation. Reduced-motion mode defaults to "respect" — runtime CSS
  // gates behind `@media (prefers-reduced-motion: no-preference)` unless
  // the operator opted into "always".
  const a = p.animation;
  if (a) {
    if (a.entry && a.entry !== "none") out["data-section-anim-entry"] = a.entry;
    if (a.scroll && a.scroll !== "none") out["data-section-anim-scroll"] = a.scroll;
    if (a.hover && a.hover !== "none") out["data-section-anim-hover"] = a.hover;
    if (a.reducedMotion === "always") {
      out["data-section-anim-reduced-motion"] = "always";
    }
  }

  // Phase 5 — scroll-reveal + parallax data-attrs. The scroll-reveal
  // attr is read by `scroll-reveal.ts` (mounted in root layout) which
  // toggles `data-revealed` when the section enters the viewport. The
  // parallax attr is consumed via CSS animation-timeline.
  if (p.scrollReveal && p.scrollReveal !== "none") {
    out["data-scroll-reveal"] = p.scrollReveal;
    if (p.scrollRevealDelay) {
      out["data-scroll-reveal-delay"] = String(p.scrollRevealDelay);
    }
  }
  if (typeof p.parallaxIntensity === "number" && p.parallaxIntensity > 0) {
    out["data-parallax"] = "1";
  }

  return out;
}

/**
 * Inline-style overrides for pixel-first companion fields. Spread into the
 * section root's `style` prop alongside `presentationDataAttrs`. Inline
 * styles beat class rules by specificity (without needing `!important` on
 * either side, which keeps things composable).
 *
 * Power-user fields (paddingLeft, paddingRight, marginTop, marginBottom)
 * are pixel-only — they have no enum equivalent. Only the four "core"
 * companions (paddingTop/Bottom, containerWidth, backgroundColor) shadow
 * existing enums.
 */
export function presentationInlineStyles(
  p?: SectionPresentation,
): Record<string, string> {
  if (!p) return {};
  const out: Record<string, string> = {};
  const fmt = (l: CustomLength) => `${l.value}${l.unit}`;
  if (p.paddingTopCustom) out.paddingTop = fmt(p.paddingTopCustom);
  if (p.paddingBottomCustom) out.paddingBottom = fmt(p.paddingBottomCustom);
  if (p.paddingLeftCustom) out.paddingLeft = fmt(p.paddingLeftCustom);
  if (p.paddingRightCustom) out.paddingRight = fmt(p.paddingRightCustom);
  if (p.marginTopCustom) out.marginTop = fmt(p.marginTopCustom);
  if (p.marginBottomCustom) out.marginBottom = fmt(p.marginBottomCustom);
  if (p.backgroundColorCustom) out.background = p.backgroundColorCustom;
  // containerWidthCustom is consumed differently — it sets a CSS variable
  // that the section's __inner consumes via max-width. The section root
  // still gets a marker attr so the renderer's wrapper can pick it up.
  if (p.containerWidthCustom) {
    out["--cms-section-container-width"] = fmt(p.containerWidthCustom);
  }
  // Phase 4 — composition.
  if (p.fullBleed) {
    out.maxWidth = "none";
    out.width = "100%";
  }
  if (p.overlapTop) out.marginTop = `-${fmt(p.overlapTop)}`;
  if (p.overlapBottom) out.marginBottom = `-${fmt(p.overlapBottom)}`;
  if (typeof p.stickyTop === "number") {
    out.position = "sticky";
    out.top = `${p.stickyTop}px`;
    out.zIndex = "1";
  }
  // Phase 4 — composition lift continued.
  if (p.gridArea) out.gridArea = p.gridArea;
  if (typeof p.zIndex === "number") out.zIndex = String(p.zIndex);
  if (p.pinScrollSection) {
    out.position = "sticky";
    out.top = "0";
    out.minHeight = "100vh";
  }
  // Phase 5 — video background marker. The actual <video> element is
  // emitted by the wrapper renderer; here we just ensure the section root
  // is a positioned ancestor so the video can absolutely-position itself
  // behind the content.
  if (p.videoBackground) {
    out.position = out.position ?? "relative";
    out.overflow = "hidden";
  }
  // Phase 5 — parallax intensity drives a CSS var consumed by the
  // [data-parallax] selector in token-presets.css. Clamped 0..1 by zod.
  if (typeof p.parallaxIntensity === "number" && p.parallaxIntensity > 0) {
    out["--parallax-intensity"] = String(p.parallaxIntensity);
  }
  // Multi-layer parallax — emit three vars when set. Sections that
  // support layered parallax (hero, hero_split, sticky_scroll) attach
  // each var to a child layer via `[data-parallax-layer="1|2|3"]`.
  if (p.parallaxLayers) {
    if (typeof p.parallaxLayers.l1 === "number") out["--parallax-l1"] = String(p.parallaxLayers.l1);
    if (typeof p.parallaxLayers.l2 === "number") out["--parallax-l2"] = String(p.parallaxLayers.l2);
    if (typeof p.parallaxLayers.l3 === "number") out["--parallax-l3"] = String(p.parallaxLayers.l3);
  }
  // Phase 5 — scroll-reveal delay drives a CSS var the reveal animation
  // keyframes consume.
  if (
    p.scrollReveal &&
    p.scrollReveal !== "none" &&
    typeof p.scrollRevealDelay === "number"
  ) {
    out["--scroll-reveal-delay"] = `${p.scrollRevealDelay}ms`;
  }
  return out;
}

/**
 * Phase 5 — render the optional video background, dark overlay, and poster
 * for a section. Returns the JSX to inject INSIDE the section wrapper,
 * before the content. The wrapper must be `position: relative` (set
 * automatically by `presentationInlineStyles` when videoBackground is set).
 *
 * The video is muted + autoplay + loop + playsInline so it works under
 * Safari's autoplay policy. We feature-detect prefers-reduced-motion at
 * runtime; when the user prefers reduced motion, we fall back to the
 * poster image and skip the <video> entirely.
 */
export interface VideoBackgroundProps {
  src: string;
  poster?: string;
  overlay?: number;
}

export function presentationVideoBackground(
  p?: SectionPresentation,
): VideoBackgroundProps | null {
  if (!p?.videoBackground) return null;
  return {
    src: p.videoBackground,
    poster: p.videoPoster,
    overlay: p.videoOverlay,
  };
}

/**
 * Render the `customCss` field as a scoped <style> tag. Returns null when
 * empty. The CSS is wrapped in a section-id attribute selector so it can't
 * leak out of the section.
 *
 *   [data-cms-section][data-section-id="<id>"] {
 *     <user CSS>
 *   }
 *
 * Sanitization is intentionally minimal — we strip </style> and <script>
 * substrings to prevent the obvious tag-break attacks, but otherwise trust
 * the operator (this is workspace-internal authoring, not public input).
 */
export function presentationScopedCss(
  sectionId: string,
  p?: SectionPresentation,
): string | null {
  const css = p?.customCss?.trim();
  if (!css) return null;
  // Defensive: strip any tag-break attempts.
  const safe = css
    .replace(/<\/style>/gi, "")
    .replace(/<script/gi, "")
    .replace(/<\/script>/gi, "");
  return `[data-cms-section][data-section-id="${sectionId}"] { ${safe} }`;
}

/**
 * Labels for the admin editor — single source of truth for copy across
 * every section's presentation panel.
 */
export const PRESENTATION_FIELD_LABELS = {
  background: "Background",
  paddingTop: "Padding (top)",
  paddingBottom: "Padding (bottom)",
  containerWidth: "Container width",
  align: "Alignment",
  dividerTop: "Top divider",
  mobileStack: "Mobile layout",
  visibility: "Visibility",
} as const;

export const PRESENTATION_OPTIONS = {
  background: [
    { value: "canvas", label: "Match canvas (default)" },
    { value: "ivory", label: "Ivory" },
    { value: "champagne", label: "Champagne" },
    { value: "espresso", label: "Espresso (dark)" },
    { value: "blush", label: "Blush" },
    { value: "sage", label: "Sage" },
    { value: "muted-surface", label: "Muted surface" },
  ],
  paddingTop: [
    { value: "none", label: "None" },
    { value: "tight", label: "Tight" },
    { value: "standard", label: "Standard" },
    { value: "airy", label: "Airy" },
    { value: "editorial", label: "Editorial" },
  ],
  paddingBottom: [
    { value: "none", label: "None" },
    { value: "tight", label: "Tight" },
    { value: "standard", label: "Standard" },
    { value: "airy", label: "Airy" },
    { value: "editorial", label: "Editorial" },
  ],
  containerWidth: [
    { value: "narrow", label: "Narrow (880px)" },
    { value: "standard", label: "Standard (1120px)" },
    { value: "wide", label: "Wide (1280px)" },
    { value: "editorial", label: "Editorial (1240px + 48px gutter)" },
    { value: "full-bleed", label: "Full-bleed (100%)" },
  ],
  align: [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
  ],
  dividerTop: [
    { value: "none", label: "None" },
    { value: "thin-line", label: "Thin line" },
    { value: "gradient-fade", label: "Gradient fade" },
    { value: "decorative", label: "Decorative" },
  ],
  mobileStack: [
    { value: "default", label: "Default (stack)" },
    { value: "single-column", label: "Single column" },
    { value: "horizontal-scroll", label: "Horizontal scroll" },
  ],
  visibility: [
    { value: "always", label: "Always visible" },
    { value: "desktop-only", label: "Desktop only" },
    { value: "mobile-only", label: "Mobile only" },
    { value: "hidden", label: "Hidden" },
  ],
} as const;

/**
 * Animation options shared with the Motion inspector panel.
 *
 * Entry animations run once when the section first scrolls into view
 * (CSS @starting-style / IntersectionObserver-driven class flip — see
 * token-presets.css). Scroll behaviors are continuous. Hover applies on
 * cursor-over the section.
 */
export const ANIMATION_OPTIONS = {
  entry: [
    { value: "none", label: "None" },
    { value: "fade", label: "Fade in" },
    { value: "fade-up", label: "Fade up" },
    { value: "fade-down", label: "Fade down" },
    { value: "slide-left", label: "Slide from right" },
    { value: "slide-right", label: "Slide from left" },
    { value: "scale-in", label: "Scale in" },
  ],
  scroll: [
    { value: "none", label: "None" },
    { value: "parallax-soft", label: "Soft parallax" },
    { value: "reveal-stagger", label: "Stagger reveal" },
  ],
  hover: [
    { value: "none", label: "None" },
    { value: "lift", label: "Lift" },
    { value: "glow", label: "Glow" },
    { value: "tilt", label: "Tilt" },
  ],
  reducedMotion: [
    {
      value: "respect",
      label: "Respect prefers-reduced-motion (recommended)",
    },
    { value: "always", label: "Always animate" },
  ],
} as const;

export const ANIMATION_FIELD_LABELS = {
  entry: "Entry animation",
  scroll: "Scroll behavior",
  hover: "Hover effect",
  reducedMotion: "Reduced motion",
} as const;

/**
 * Per-breakpoint label set, shared by the Responsive inspector. Keeps
 * the panel copy in lockstep with the topbar's device switcher.
 */
export const BREAKPOINT_LABELS = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
} as const;

export type BreakpointKey = keyof typeof BREAKPOINT_LABELS;
