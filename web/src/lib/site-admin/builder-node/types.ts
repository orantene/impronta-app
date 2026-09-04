/* eslint-disable max-lines -- hand-authored BuilderNode type + schema definitions (discriminated union + the full style-value model); inherently large, like the other builder-node data files. */
import type {
  BuilderAnimationPreset,
  BuilderAnimationRepeat,
  BuilderAnimationTrigger,
} from "./animation-presets";
import type { BackgroundMediaProps } from "./background-media";
import type { BuilderIconName } from "./icon-registry";
import type { BuilderVisibilityCondition } from "./visibility";

export type BuilderNodeKind =
  | "section"
  | "container"
  | "split"
  | "accordion"
  | "accordion_item"
  | "tabs"
  | "tab_panel"
  | "carousel"
  | "masonry"
  | "heading"
  | "paragraph"
  | "button"
  | "image"
  | "video"
  | "embed"
  | "social_post"
  | "social_feed"
  | "icon"
  | "pricing_table"
  | "rich_text"
  | "code"
  | "divider"
  | "spacer"
  | "card"
  | "cta_group"
  | "nav"
  | "social_links"
  | "form"
  // WS7 Phase 0 — NATIVE data blocks. These replace the `section_embed`
  // round-trip to the frozen curated sections of the same name: they render
  // from `dataSources` the SERVER caller resolved (tenant-scoped), so the
  // legacy section registry can be deleted without losing the homepage's two
  // data-driven blocks. Structural leaves (`children: { type: "none" }`).
  | "hero_search"
  | "menu_board"
  | "reserve_table"
  | "talent_type_grid"
  // BUILDER 2027 · P2A — NATIVE kinds that replace the frozen legacy section
  // registry Impronta's live pages reach through `section_embed` bridges.
  // Group 1 (bridge-critical) renders the roster/marketing bands; the four
  // `header_*` widgets replace the frozen shell widgets embedded as children of
  // the `site_header` landmark. Group 2 are the anchor-design primitives.
  | "marquee"
  | "directory"
  | "featured_talent"
  | "location_map"
  | "header_search"
  | "header_account"
  | "header_inquiry"
  | "header_language"
  | "sticky_scroll"
  | "reveal"
  | "stats"
  | "before_after"
  | "section_embed";

export interface BuilderNodeBase {
  id: string;
  kind: BuilderNodeKind;
  /** P3-LOCK — per-node editorial lock (selection-layer + inspector + layers row honor it). Patched via props; carried by validate's base-field allow-list. */
  locked?: boolean;
  /** Builder Studio — per-PROP locks (dot-paths, e.g. "tone", "style.textColor"). Admin-set; read-only in the inspector + stripped from patches in patchBuilderNodeProps. Carried by validate's base-field allow-list (see prop-lock.ts). */
  lockedProps?: string[];
  /** Wave 5B (#38) — OPTIONAL conditional visibility (locale / auth / variant), evaluated at `shouldRenderNode`; node omitted when unmatched, undefined → always shown. See visibility.ts. */
  visibilityCondition?: BuilderVisibilityCondition;
  /**
   * WS5 — OPTIONAL per-element translation overlay: `{ es: { text: "Hola" }, fr: {…} }`.
   * Base-prop values stay in `props`; the overlay carries secondary-locale copy.
   * SOURCE OF TRUTH = `props.i18n` (patch landing zone); mirrored here by
   * validate's base-field allow-list so the renderer + i18n primitives read it
   * directly. Absent → today's single-language behavior. See i18n-overlay.ts.
   */
  i18n?: Record<string, Record<string, string>>;
  /**
   * ABTEST-1 — OPTIONAL minimal A/B experiment carried on an eligible CTA / form
   * node ({@link EXPERIMENT_ELIGIBLE_KINDS}: button / cta_group / form). Exactly
   * two variants ("a" control, "b"); the shared renderer deterministically
   * buckets the visitor and applies the served variant's `propOverrides`. Absent
   * → the node renders byte-identically (control). SOURCE OF TRUTH = `props.experiment`
   * (patch landing zone); mirrored here by validate's base-field allow-list so
   * the renderer reads `node.experiment` directly. See experiment.ts.
   */
  experiment?: import("./experiment").NodeExperimentConfig;
  /**
   * EJECT PROVENANCE — the curated role this node was minted from when its
   * section was unlocked ("Unlock design"). Ejecting re-mints the derived
   * children with fresh ROLELESS ids, which is the whole point (they become
   * ordinary freeform blocks), but it also destroys the only link back to the
   * curated `headline` / `primaryCta` / … the child used to be. Without that
   * link, "Restore original styling" on an already-unlocked section has to
   * GUESS which child is the headline. This stamp removes the guess for every
   * eject from #1178 onward; historical ejects fall back to the inference
   * ladder in `section-eject-repair.ts`. Absent → pre-stamp node, or a block
   * the operator added themselves. SOURCE OF TRUTH = `props.originRole`;
   * mirrored here by validate's base-field allow-list.
   */
  originRole?: import("./role-bindings").BuilderNodeRole;
}

export interface BuilderNodeStyleValue {
  align?: "left" | "center" | "right";
  /** STYLE-2 — 'display' is the tier above 'xl', yielding the storefront-grade display scale (clamp(3.5rem,6vw,6rem)). Existing sm/md/lg/xl tiers are unchanged. */
  size?: "sm" | "md" | "lg" | "xl" | "display";
  tone?: "default" | "muted" | "strong";
  maxWidth?: "narrow" | "reading" | "wide" | "full";
  marginTop?: "none" | "s" | "m" | "l";
  marginBottom?: "none" | "s" | "m" | "l";
  paddingX?: "none" | "s" | "m" | "l";
  paddingY?: "none" | "s" | "m" | "l" | "xl";
  background?: "none" | "surface" | "contrast" | "accent" | "muted";
  radius?: "none" | "sm" | "md" | "lg" | "pill";
  objectFit?: "cover" | "contain";
  // Focal point for cropped images (object-fit:cover). Free CSS object-position
  // value, e.g. "center", "left top", "50% 20%".
  objectPosition?: string;
  aspectRatio?: "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "21:9";
  // Free aspect-ratio override — any CSS aspect-ratio value ("1.85", "16 / 9",
  // "2 / 3"). Wins over the aspectRatio enum at every breakpoint when set.
  aspectRatioFree?: string;
  // Visibility — hide this node at the active viewport. On a breakpoint it hides
  // only there (desktop stays shown); on desktop it hides everywhere.
  visibility?: "visible" | "hidden";
  // Free-value escapes — override the token presets above with raw CSS so any
  // design can be matched. Stored as CSS strings (lengths keep their unit) and
  // layered after the tokens in the renderer, so a free value always wins.
  //
  // TOKEN BINDING (Wave 3 · 3A): the color fields (textColor, backgroundColor,
  // borderColor, accentColor, caretColor — plus the hover equivalents) AND
  // fontFamily additionally accept a `token:<key>` SENTINEL that BINDS the prop
  // to a Theme design token instead of freezing a raw value, e.g.
  // `"token:color.primary"` or `"token:typography.heading-font-family"`. The
  // renderer resolves the sentinel to `var(--token-…, fallback)` via
  // resolveStyleTokenRef (style-token-bindings.ts), so a live theme change
  // cascades. Any value WITHOUT the `token:` prefix is a raw value and renders
  // unchanged (back-compat; the flagship uses only raw values). See
  // style-token-bindings.ts for the full encoding + bindable-token catalog.
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  /** Modern text wrapping — `balance`/`pretty` give nicer multi-line headings. */
  textWrap?: "wrap" | "nowrap" | "balance" | "pretty";
  /** Whitespace handling — `nowrap` keeps a line on one row, `pre` preserves it. */
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
  /** Truncate to N lines with an ellipsis (CSS -webkit-line-clamp). 0/undefined = off. */
  lineClamp?: number;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  /**
   * CSS `border-style`: one {@link BuilderBorderStyleKeyword}, or a 1-4 value
   * TRBL shorthand (`dashed solid`). Existing `solid` / `dashed` / `dotted`
   * values are valid 1-value shorthands and keep working.
   */
  borderStyle?: string;
  // Free border-radius escape — raw CSS border-radius. Layers after the radius
  // token so an exact value wins, and the shorthand supports per-corner control
  // ("12px 12px 0 0", "50%", etc.).
  borderRadius?: string;
  // Free dimension escapes — exact width / height + min/max clamps as CSS length
  // strings. maxWidthFree is collision-safe (maxWidth above is a preset enum);
  // it layers after the token so an exact clamp wins. minWidth / maxHeight have
  // no token, so they take the plain CSS-property name.
  width?: string;
  height?: string;
  minHeight?: string;
  minWidth?: string;
  maxWidthFree?: string;
  maxHeight?: string;
  // Free per-side padding escapes (CSS length strings). Layer after the
  // paddingX/paddingY token block so an exact side wins over the preset.
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  // Free per-side margin escapes (CSS length strings). The marginTop/marginBottom
  // tokens above are preset enums, so the exact values use collision-safe *Free
  // keys and layer after every margin token in the renderer (free always wins).
  marginTopFree?: string;
  marginRightFree?: string;
  marginBottomFree?: string;
  marginLeftFree?: string;
  // Surface & depth escapes. backgroundImage is painted cover/center/no-repeat
  // by default; backgroundSize/Position/Repeat each override one paint axis.
  boxShadow?: string;
  textShadow?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  // Clips background paint to text glyphs (gradient-text effect). Gated on an
  // actual background paint so it can't silently blank text.
  backgroundClip?: "text";
  opacity?: number;
  // Free gap escape (layout nodes) — overrides the gap token on container /
  // split / card / cta_group / carousel / masonry by reassigning the --bn-gap
  // CSS variable, so every consumer (incl. child tracks) picks it up.
  gap?: string;
  // Container-query registration — applied to a wrapper node so descendants can
  // respond to that slot's width via BuilderNodeStyle.containerQueries.
  containerType?: "normal" | "inline-size" | "size";
  containerName?: string;
  // Positioning escapes — establish a positioning context and nudge the node
  // with inset offsets (CSS length strings; negatives allowed for overlaps).
  //
  // `fixed` pins the node to the BROWSER VIEWPORT (a floating CTA, a side rail,
  // a chat button, a full-viewport overlay) — it leaves the flow entirely and
  // does not scroll. Two caveats the inspector surfaces to the operator, both
  // real CSS, neither fixable in code:
  //   1. Any ANCESTOR with transform / filter / backdrop-filter / perspective /
  //      contain:paint becomes the containing block for a fixed descendant, so
  //      the node pins to THAT box instead of the viewport. `mobile-health.ts`
  //      warns and names the trapping block at authoring time (same failure the
  //      nav off-canvas drawer hit — see the CAVEAT in nav-css.ts).
  //   2. The editor canvas is honest at 100% zoom, where no transform exists in
  //      the ancestry; zooming applies `transform: scale()` to the canvas root,
  //      which re-anchors fixed nodes to the canvas. The Position inspector says
  //      so next to the control.
  position?: "relative" | "absolute" | "fixed" | "sticky";
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  // Wave 6B (#23) — STICKY PINNING convenience. This flow/flex/grid builder has
  // no absolute canvas, so "constraints/pinning" = position:sticky with a
  // self-anchor: `stickyAnchor` picks which edge of the scroll container the
  // node sticks to ("top" → it pins as you scroll DOWN past it; "bottom" → pins
  // to the bottom of the viewport), and `stickyOffset` is the gap from that edge
  // (CSS length, e.g. "16px", "1rem"; default 0 when only the anchor is set).
  // Setting stickyAnchor MAKES the node sticky: the renderer emits
  // `position:sticky` UNLESS an explicit `position` is already set, and emits the
  // inset on the anchored edge UNLESS an explicit `top`/`bottom` already exists
  // (so the raw escapes always win — back-compat). The headline use is a sticky
  // sub-nav / sidebar rail. Optional + back-compat: undefined → nothing emitted,
  // and existing `position:sticky`+`top` trees render byte-identical.
  stickyAnchor?: "top" | "bottom";
  stickyOffset?: string;
  // Stacking & clipping escapes — z-index orders overlapping/absolute nodes
  // (integer, negatives allowed to send behind); overflow controls whether
  // content is clipped or scrolls within the node's box.
  zIndex?: number;
  overflow?: "visible" | "hidden" | "auto" | "scroll";
  // Transform escapes — standalone CSS rotate/scale/translate properties
  // (compose independently of layout/position). rotate takes an angle ("-3deg");
  // scale takes a unitless factor ("1.05" = 105%); translate takes 1-2 lengths
  // ("10px -8px" = x y). Negatives / sub-1 allowed. transformOrigin sets the
  // pivot for rotate/scale ("top left", "50% 0").
  rotate?: string;
  scale?: string;
  translate?: string;
  transformOrigin?: string;
  // First-class CSS transitions — smooth animatable changes (hover, responsive,
  // state). The longhands are emitted through the renderer CSS var/data-attr
  // path, so breakpoint overrides work like the rest of the freeform escapes.
  transitionProperty?: string;
  transitionDuration?: string;
  transitionTimingFunction?: string;
  transitionDelay?: string;
  // Legacy shorthand escape. When present it wins over the longhands, matching
  // normal CSS cascade behavior for an inline transition declaration.
  transition?: string;
  // Flex/grid child placement — how this node sizes & aligns inside a row/grid
  // parent. alignSelf overrides the parent's cross-axis alignment for just this
  // child; flexGrow/Shrink tune flex sizing (0 is meaningful — don't grow/shrink);
  // flexBasis sets the main-axis base size (CSS length). No-ops outside flex/grid.
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: string;
  // Grid child placement — where/how far this node spans in a grid parent
  // (e.g. "span 2", "1 / 3"). No-op outside a grid container.
  gridColumn?: string;
  gridRow?: string;
  // Flex/grid child ORDER — repositions this node among its siblings WITHOUT
  // moving it in the tree/DOM (CSS `order`, lower paints first; negatives allowed
  // to pull ahead of order:0 siblings). The headline use is per-breakpoint reorder
  // — set it under responsive.{tablet,mobile} to e.g. float a CTA above the media
  // on mobile while the desktop DOM order is untouched. ONLY affects children of a
  // flex or grid parent (a `container` row/grid, `split`, `cta_group`, …); a no-op
  // in normal flow. Optional + back-compat: undefined leaves the natural order.
  order?: number;
  // Filter effects — free CSS filter strings. filter applies to the node itself
  // (blur/grayscale/brightness/…); backdropFilter frosts whatever sits behind it
  // (glassmorphism). e.g. "blur(8px)", "grayscale(1) contrast(1.2)".
  filter?: string;
  backdropFilter?: string;
  // Compositing — how this node's pixels blend with whatever sits behind it.
  // The union is the CSS mix-blend-mode keyword set (minus `normal`, which is
  // stored as unset). Great for image overlays + duotone.
  mixBlendMode?: BuilderMixBlendMode;
  // Flex/grid CONTAINER layout — how this node distributes & aligns its OWN
  // children: justifyContent on the main axis, alignItems on the cross axis,
  // flexWrap toggles row wrapping. Complements the container/split structured
  // layout+align props; a free value wins. No-op on non-flex/grid nodes.
  justifyContent?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
  // Grid CONTAINER tracks — free grid-template escapes so a grid node can express
  // asymmetric ("2fr 1fr"), fixed ("200px 1fr"), or auto-responsive
  // ("repeat(auto-fit, minmax(200px, 1fr))") column/row tracks the structured
  // columns:1|2|3|4 enum can't. gridAutoFlow steers implicit-item placement.
  // Stored as raw CSS strings; layer after the grid token. No-op outside a grid.
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridAutoFlow?: "row" | "column" | "row dense" | "column dense";
  // Premium-2026 effect & interaction escapes — all opt-in, applied last so they
  // layer over everything. clipPath/maskImage are raw CSS (shapes & reveal
  // masks); textStroke maps to -webkit-text-stroke (outlined/hollow glyphs);
  // cursor/userSelect/pointerEvents are interaction polish; scrollSnap* turn a
  // container into a snap track. All length/enum-capped — no injection surface.
  clipPath?: string;
  maskImage?: string;
  textStroke?: string;
  cursor?:
    | "auto"
    | "default"
    | "pointer"
    | "grab"
    | "grabbing"
    | "crosshair"
    | "zoom-in"
    | "zoom-out"
    | "not-allowed"
    | "text"
    | "wait"
    | "help"
    | "move"
    | "none";
  userSelect?: "auto" | "none" | "text" | "all";
  pointerEvents?: "auto" | "none";
  scrollSnapType?: string;
  scrollSnapAlign?: "none" | "start" | "center" | "end";
  // Wave 3 · 3C: Layered backgrounds — stacks gradient / image / color layers
  // into a comma-joined background-image. Index 0 = frontmost layer. Applied
  // after the scalar backgroundImage; existing nodes stay byte-identical.
  backgroundLayers?: Array<{ type: "gradient" | "image" | "color"; value: string }>;
  /** CSS background-blend-mode for backgroundLayers (single keyword or CSV list). */
  backgroundBlendMode?: string;
  // Focus / form theming — outline is layout-neutral (unlike border) so it's the
  // right tool for decorative rings; accentColor themes native checkbox/radio/
  // range; caretColor sets the text-input cursor colour.
  outline?: string;
  outlineOffset?: string;
  accentColor?: string;
  caretColor?: string;
  // Entrance animation — a named preset that maps to a CSS @keyframe baked into
  // the static renderer sheet. Fires once on the published page. duration/delay
  // are raw CSS time strings ("0.6s", "120ms").
  //
  // The vocabulary itself lives in `./animation-presets` — one list that the
  // zod enum, this type, the renderer keyframes and the inspector gallery all
  // derive from, so a preset can never exist at three of those four layers.
  animationPreset?: BuilderAnimationPreset;
  animationDuration?: string;
  animationDelay?: string;
  /**
   * Travel distance for the DIRECTIONAL presets (fade up/down/left/right,
   * slide up/down/left/right). A CSS length; published as
   * `--bn-anim-distance`. Ignored by presets that do not travel — each of those
   * keyframes has its own baked default (see `animation-presets.ts`).
   */
  animationDistance?: string;
  /**
   * How often a SCROLL-triggered animation runs. `once` reveals the node the
   * first time it scrolls into view and leaves it there;`every` ties playback
   * to scroll position so it replays on every pass. No effect on the `load` or
   * `hover` triggers, which are inherently one-shot / per-hover.
   */
  animationRepeat?: BuilderAnimationRepeat;
  animationEasing?:
    | "ease"
    | "linear"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "back"
    | "smooth";
  // Wave 6B (#27) — INTERACTION TIMELINE: a free CSS easing curve that WINS over
  // the `animationEasing` named enum when set, so an author can dial in an exact
  // cubic-bezier()/steps()/linear() curve for the entrance animation's timing.
  // Length-capped + validated by the CSSOM at render; undefined → the named
  // easing (or its default) is used, so existing trees are byte-identical.
  animationEasingCustom?: string;
  // Trigger: "load" plays once on page load; "scroll" drives the animation by
  // scroll position via CSS scroll-driven animations (animation-timeline:view()).
  // Pure CSS — unsupported browsers fall back to playing it on load.
  animationTrigger?: BuilderAnimationTrigger;
  // Wave 6B (#27) — SCROLL PARALLAX: a tasteful, opt-in scroll-driven vertical
  // parallax independent of the entrance `animationPreset` (a node can have both
  // — an entrance fade AND an ongoing parallax drift). Maps a named intensity to
  // a baked `bn-parallax-{subtle,medium,strong}` @keyframe driven by
  // `animation-timeline:view()` over the node's whole on-screen pass, so the node
  // glides ± a few percent of its height as the visitor scrolls. Pure CSS:
  // browsers without scroll-driven-animation support and visitors who prefer
  // reduced motion get no motion (the same `[style*="animation"]` reduced-motion
  // guard already in the sheet covers it). Optional + back-compat: "none"/
  // undefined emits nothing. When BOTH an entrance animation and parallax are
  // set, the parallax wins the single `animation` slot (entrance is the one-shot
  // intro; parallax is the persistent behaviour the visitor actually sees).
  parallax?: "none" | "subtle" | "medium" | "strong";
  // Reveal-on-view (#1 of the "motion beyond entrance" work, 2026-06-04) — an
  // IntersectionObserver-driven entry interaction, distinct from the CSS
  // `animationPreset` (which plays unconditionally on load) and from `parallax`
  // (ongoing scroll drift). The node starts hidden/offset and transitions to its
  // resting state the FIRST time it scrolls into view, then stays (no replay).
  //
  // Unlike the `animationPreset` "scroll" trigger — which leans on CSS
  // scroll-driven animations (`animation-timeline:view()`, still patchy browser
  // support) — this uses a tiny inline IntersectionObserver the published
  // renderer injects once, so it works everywhere IO is supported (effectively
  // universal) and degrades to "already visible" where it isn't.
  //
  // `revealOnView` picks the trajectory; `revealDistance` is the CSS travel
  // length for the directional variants (default 24px); `revealDuration` /
  // `revealDelay` are CSS time strings (defaults 0.6s / 0s); `revealEasing`
  // reuses the same friendly easing vocabulary as the entrance animation.
  // All optional + back-compat — undefined emits nothing and the node renders
  // byte-identical. Honours prefers-reduced-motion (the inline guard reveals the
  // node immediately, with no transition, for those visitors).
  revealOnView?:
    | "none"
    | "fade"
    | "fade-up"
    | "fade-down"
    | "fade-left"
    | "fade-right"
    | "zoom";
  revealDistance?: string;
  revealDuration?: string;
  revealDelay?: string;
  revealEasing?:
    | "ease"
    | "linear"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "back"
    | "smooth";
  // Per-breakpoint hover lives on the viewport bucket (`responsive.tablet.hover`).
  hover?: BuilderNodeHoverStyle;
  // Per-node custom CSS escape hatch (2026-06-09). Free author CSS, rendered as
  // a scope-confined `<style>` keyed to this node's `[data-builder-node-id]` via
  // the SAME hardened scoper sections use (`nodeScopedCss` → `scopeCustomCss`),
  // so it can target the node + its descendants but can NEVER emit a page-global
  // rule (a stray `}` is dropped, not an escape). Lives on the BASE style only —
  // it is not a per-viewport layer (a `<style>` block carries its own @media if
  // an author wants responsiveness). Optional + back-compat: when absent (the
  // universal case) the renderer emits NOTHING extra, so output is byte-identical.
  customCss?: string;
}

// Hover-state overrides — a curated subset of style props that re-apply only
// while the node is hovered (or keyboard-focused). Desktop writes `style.hover`;
// tablet/mobile write `style.responsive.{tier}.hover`. Paired with the
// `transition` escape to ease the change. Colors accept tokens/hex/rgb; scale
// is a unitless factor ("1.04"); translate is 1-2 lengths ("0 -4px"); opacity
// is 0-1. filter / backdropFilter / parentHover are the W3 hover-v2 extras.
export interface BuilderNodeHoverStyle {
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  boxShadow?: string;
  scale?: string;
  translate?: string;
  opacity?: number;
  filter?: string;
  backdropFilter?: string;
  /** Child responds when a direct parent builder node is hovered. */
  parentHover?: boolean;
}

/**
 * CSS `mix-blend-mode` keywords the schema, renderer, and inspector share.
 * `normal` is the CSS default and is stored as unset (empty control).
 * B9 remainder: `difference`, `color-dodge`, `luminosity`, `soft-light` are
 * in this union (and in the inspector options); do not shrink them out.
 */
export const BUILDER_MIX_BLEND_MODES = [
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export type BuilderMixBlendMode = (typeof BUILDER_MIX_BLEND_MODES)[number];

export {
  BUILDER_BORDER_STYLE_KEYWORDS,
  type BuilderBorderStyleKeyword,
} from "./border-shorthand";

export interface BuilderNodeStyle extends BuilderNodeStyleValue {
  /**
   * Per-breakpoint style overrides, keyed by tier id. `tablet` and `mobile`
   * are the built-in tiers (static sheet). Any other slug is an operator-defined
   * custom tier whose CSS is generated by `custom-breakpoint-css.ts`.
   */
  responsive?: Record<string, BuilderNodeStyleValue | undefined>;
  containerQueries?: {
    tablet?: BuilderNodeStyleValue;
    mobile?: BuilderNodeStyleValue;
  };
  hover?: BuilderNodeHoverStyle;
  // Wave 3 · 3D: focus-visible + active overrides (same subset as hover). Optional.
  stateStyles?: { focus?: BuilderNodeHoverStyle; active?: BuilderNodeHoverStyle };
  // Wave 3 · 3B: page-scoped linked style-class id. Optional + back-compat.
  // Node props win over the class base. See style-classes.ts.
  classRef?: string;
}

export interface BuilderDataBindingProps {
  sourceKey: string;
  mode?: "manual" | "bound" | "hybrid";
  filterQuery?: string;
  maxItems?: number;
  /**
   * Repeat model: when true on a container, the FIRST child is the template
   * cloned once per resolved collection item. Empty data falls back to that
   * template once so the published page never blanks.
   */
  repeat?: boolean;
}

export interface BuilderNodeFieldBindings {
  text?: string;
  label?: string;
  href?: string;
  src?: string;
  alt?: string;
}

export interface BuilderSectionNode extends BuilderNodeBase {
  kind: "section";
  props: {
    sectionId?: string | null;
    sectionTypeKey: string;
    label?: string | null;
    slotKey?: string | null;
    sortOrder?: number;
    dataBinding?: BuilderDataBindingProps;
    /**
     * Inline, self-contained section config (the section's own schema shape,
     * e.g. `SiteHeaderV1`). Used by SHELL landmarks that carry their config in
     * the tree rather than in a separate `cms_sections`/snapshot slot — the
     * talent Max-site header/footer are seeded this way and rendered via the
     * bespoke section Component (render-max-site.tsx). Opaque here to avoid a
     * cross-module type cycle; the render port validates it against the
     * section's registered schema before use.
     */
    sectionProps?: Record<string, unknown>;
    // "2018 bye-bye" — when true this curated section has been EJECTED to
    // freeform: its content was re-minted as roleless builder children, the
    // curated React component no longer renders for it, and the legacy
    // derivation no longer re-hydrates it. Reversible (un-eject clears the
    // flag + children → the section re-derives). Lives in the snapshot tree.
    ejected?: boolean;
  };
  children?: BuilderNode[];
}

/**
 * One breakpoint tier's container-layout override. Shared by the built-in
 * `tablet`/`mobile` tiers and any operator-defined custom tier id.
 */
export interface BuilderContainerResponsiveOverride {
  layout?: "stack" | "row" | "grid";
  gap?: "s" | "m" | "l";
  columns?: 1 | 2 | 3 | 4;
  align?: "start" | "center" | "end" | "stretch";
  /**
   * DISPLAY MODE — per-breakpoint override of the container's grid-vs-slider
   * presentation. Only meaningful when the effective layout is `grid`.
   * `"grid"` (default) keeps the static grid; `"slider"` turns the container
   * into a horizontal scroll-snap rail showing `itemsPerView` tiles at a time.
   * Optional + back-compat: undefined → inherit the desktop base (default grid).
   */
  display?: "grid" | "slider";
  /** Tiles visible per viewport when display is "slider". Default 3. */
  itemsPerView?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface BuilderContainerNode extends BuilderNodeBase {
  kind: "container";
  props: {
    layout: "stack" | "row" | "grid";
    gap?: "s" | "m" | "l";
    columns?: 1 | 2 | 3 | 4;
    align?: "start" | "center" | "end" | "stretch";
    /**
     * DISPLAY MODE (desktop base) — grid-vs-slider presentation. Only
     * meaningful when `layout` is `grid`. `"grid"` (default / undefined) is the
     * static grid; `"slider"` makes the container a horizontal scroll-snap rail
     * showing `itemsPerView` tiles at a time. Per-breakpoint overrides live in
     * `responsive[tier].display`. Optional + back-compat: undefined → grid, so
     * every existing container tree renders byte-identically.
     */
    display?: "grid" | "slider";
    /** Tiles visible per viewport when `display` is "slider" (default 3). */
    itemsPerView?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Operator-facing layer name in Page Structure (display-only). */
    layerLabel?: string;
    /**
     * Per-breakpoint layout overrides, keyed by tier id. `tablet` (≤900px) and
     * `mobile` (≤640px) are the two built-in tiers and render via the static
     * stylesheet; ANY other key is an operator-defined custom tier whose CSS is
     * generated at runtime by {@link generateContainerLayoutCss} and mounted via
     * {@link BreakpointStyleEngine}. Widened from a fixed `{tablet,mobile}` to a
     * `Record` (Builder 2026 "first-class responsive") — back-compat is exact:
     * `tablet`/`mobile` remain the same two keys with the same shape.
     */
    responsive?: Record<string, BuilderContainerResponsiveOverride>;
    dataBinding?: BuilderDataBindingProps;
    /**
     * MOVING BACKGROUND — an uploaded video or a YouTube URL painted behind
     * this container's children, plus the scrim that keeps the text on top of
     * it readable. `style.backgroundImage` is the still-image equivalent and
     * the two compose (the image shows while the video buffers).
     *
     * Optional + back-compat: undefined emits no wrapper element, no
     * `data-bn-bg-media` attribute and no extra CSS, so every container that
     * predates this field renders byte-identically. See `background-media.ts`
     * for the resolver and `background-media-layer.tsx` for the markup.
     */
    backgroundMedia?: BackgroundMediaProps;
    style?: BuilderNodeStyle;
    // Linked-component instance marker (Living Components Phase 2/3). When set,
    // this container is an instance of the saved component with this id.
    // Phase 2: "Sync instances" replaces its children with a fresh clone of the
    // master. Phase 3: at render time the master subtree is resolved LIVE (when
    // component definitions are provided) and per-instance overrides are layered
    // on. Its own stored children remain a graceful fallback — if the component
    // is missing or definitions aren't loaded, the stored children render, so it
    // can never break the published page.
    instanceOf?: string;
    // Phase 3 per-instance overrides — keyed by the MASTER child node id. Lets
    // an instance swap text / image / link on specific child nodes while staying
    // structurally linked to the master.
    instanceOverrides?: Record<string, BuilderNodeInstanceOverride>;
    // Phase 4 (T4.4) — the currently-applied named variant on this instance.
    // A variant is an author-time PRESET set of overrides (see
    // BuilderComponentVariant). Storing the id lets the editor show which preset
    // is active and re-apply it; the resolved overrides still live in
    // instanceOverrides, so the live render path is unchanged.
    instanceVariant?: string;
    /**
     * REND-1 — Semantic HTML landmark element for this container. When omitted
     * the container renders as `<div>` (default), preserving byte-stability for
     * all existing trees. Authors can promote a container to a semantic landmark
     * via the Layout inspector's "HTML tag" picker. The renderer uses the tag as
     * a drop-in replacement for `<div>` — all CSS classes, data-* attrs, and
     * inline styles are preserved regardless of the chosen tag.
     */
    htmlTag?: "div" | "section" | "article" | "aside" | "header" | "footer" | "nav" | "main";
  };
  children: BuilderNode[];
}

/**
 * A per-instance override on ONE master child node. Phase 3 shipped the four
 * scalar fields (text/imageSrc/imageAlt/href). Phase 4 (T4.4) adds:
 *
 *  - `style`  — a curated breakpoint-less {@link BuilderNodeStyleValue} layered
 *               OVER the master child's own base style (the override wins). Lets
 *               an instance restyle a slot — colour, spacing, radius, etc. —
 *               without forking the master.
 *  - `slots`  — NESTED overrides keyed by a DEEPER master descendant id, so an
 *               instance can swap content/style on grandchildren without the
 *               override map going flat. (The top-level map is keyed by direct
 *               override targets; `slots` lets one entry carry its own children.)
 *
 * All fields stay optional and additive — an empty override is still "not
 * overridden", so a blank value never wipes master content.
 */
export interface BuilderNodeInstanceOverride {
  text?: string;
  imageSrc?: string;
  imageAlt?: string;
  href?: string;
  /** Curated style layer applied over the master child's base style. */
  style?: BuilderNodeStyleValue;
  /** Nested overrides keyed by a deeper master descendant id. */
  slots?: Record<string, BuilderNodeInstanceOverride>;
}

/**
 * A named, reusable PRESET of per-instance overrides — the "variant" concept
 * (Webflow/Framer component variants). Authored against a master component, a
 * variant carries a set of overrides keyed by master child id; applying it to an
 * instance writes those overrides onto the instance's `instanceOverrides` map
 * and records the variant id in `instanceVariant`. This keeps the live render
 * path (resolveInstanceChildren) entirely unchanged — variants are an editor-time
 * convenience that compiles down to the same override map.
 */
export interface BuilderComponentVariant {
  id: string;
  name: string;
  overrides: Record<string, BuilderNodeInstanceOverride>;
}

export interface BuilderSplitNode extends BuilderNodeBase {
  kind: "split";
  props: {
    ratio?: "50-50" | "40-60" | "60-40" | "30-70" | "70-30";
    gap?: "s" | "m" | "l";
    collapseOnMobile?: boolean;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderAccordionNode extends BuilderNodeBase {
  kind: "accordion";
  props: {
    allowMultiple?: boolean;
    defaultOpenItemIds?: string[];
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderAccordionItemNode extends BuilderNodeBase {
  kind: "accordion_item";
  props: {
    title: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderTabsNode extends BuilderNodeBase {
  kind: "tabs";
  props: {
    defaultTabId?: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderTabPanelNode extends BuilderNodeBase {
  kind: "tab_panel";
  props: {
    title: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderCarouselNode extends BuilderNodeBase {
  kind: "carousel";
  props: {
    /**
     * Composition mode. `"rail"` (default) = the classic horizontal scroll-rail.
     * `"hero"` = a full-bleed, full-viewport image slider (crossfade / Ken Burns
     * / autoplay) — each child is a full-screen slide. Same node, two looks.
     */
    variant?: "rail" | "hero";
    /**
     * Rail-variant slide count on the DESKTOP base. Per-device overrides live
     * in `responsive` below; see `carousel-slides-per-view.ts` for how the two
     * resolve (and why an absent bucket renders byte-identically to the
     * pre-responsive behaviour).
     */
    slidesPerView?: 1 | 2 | 3 | 4;
    /**
     * Per-breakpoint overrides. Same bucket shape as `container.responsive`,
     * deliberately: one responsive convention for the whole node tree.
     * Absent → tablet falls back to `min(slidesPerView, 2)` and mobile
     * inherits tablet, which is exactly what shipped before this existed.
     */
    responsive?: {
      tablet?: { slidesPerView?: 1 | 2 | 3 | 4 };
      mobile?: { slidesPerView?: 1 | 2 | 3 | 4 };
    };
    autoplayMs?: number;
    loop?: boolean;
    showArrows?: boolean;
    showDots?: boolean;
    layerLabel?: string;
    // ── hero-variant levers (ignored by the rail variant) ─────────────────
    /** Hero height. viewport = 100svh, large = 78svh, medium = 60svh, fixed = minHeightPx. */
    heightMode?: "viewport" | "large" | "medium" | "fixed";
    minHeightPx?: number;
    /** Legibility scrim painted over the photo. */
    overlay?: {
      scrim?: boolean;
      tone?: "dark" | "light";
      vignette?: boolean;
      /** 0–1 multiplier on the scrim strength. */
      opacity?: number;
    };
    /** SVG film-grain texture overlay. */
    grain?: boolean;
    /** Slide transition. */
    transition?: "crossfade" | "slide";
    transitionMs?: number;
    /** Slow zoom on the active slide. */
    kenBurns?: boolean;
    /** Scale delta for Ken Burns, e.g. 0.1 → zooms 1.04 → 1.14. */
    kenBurnsAmount?: number;
    pauseOnHover?: boolean;
    /** Navigation chrome shown on the hero. */
    controls?: {
      dots?: boolean;
      arrows?: boolean;
      progress?: boolean;
      counter?: boolean;
      scrollCue?: boolean;
    };
    /** Default placement of the content overlay. First char = vertical (t/c/b), second = horizontal (l/c/r). */
    contentAlign?:
      | "tl" | "tc" | "tr"
      | "cl" | "cc" | "cr"
      | "bl" | "bc" | "br";
    /**
     * `"per-slide"` (default): each slide owns its freeform children.
     * `"shared"`: backgrounds rotate while one fixed content block stays put.
     */
    contentMode?: "per-slide" | "shared";
    /** The fixed content block rendered when contentMode === "shared". */
    sharedContent?: {
      eyebrow?: string;
      headingLead?: string;
      /** Italic / accent word appended to the heading (the gold word). */
      headingAccent?: string;
      sub?: string;
      primaryCta?: { label?: string; href?: string };
      secondaryCta?: { label?: string; href?: string };
    };
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderMasonryNode extends BuilderNodeBase {
  kind: "masonry";
  props: {
    columns?: 2 | 3 | 4 | 5;
    gap?: "s" | "m" | "l";
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderHeadingNode extends BuilderNodeBase {
  kind: "heading";
  props: {
    text: string;
    level: 1 | 2 | 3 | 4;
    /** Whole-block link. Optional; empty/absent = not linked. */
    href?: string;
    layerLabel?: string;
    fieldBindings?: BuilderNodeFieldBindings;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderParagraphNode extends BuilderNodeBase {
  kind: "paragraph";
  props: {
    text: string;
    /** Whole-block link. Optional; empty/absent = not linked. */
    href?: string;
    layerLabel?: string;
    fieldBindings?: BuilderNodeFieldBindings;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderButtonNode extends BuilderNodeBase {
  kind: "button";
  props: {
    label: string;
    href: string;
    layerLabel?: string;
    tone?: "primary" | "secondary";
    /** Icons on a button (the gallery's "Icon button" variant used to fake
     *  this with a literal "♥ Save" text label). */
    leadingIcon?: BuilderIconName;
    trailingIcon?: BuilderIconName;
    /** Hide the label visually; it stays as the accessible name. */
    iconOnly?: boolean;
    fieldBindings?: BuilderNodeFieldBindings;
    stateStyles?: {
      hover?: { tone?: "primary" | "secondary" };
      focus?: { tone?: "primary" | "secondary" };
      active?: { tone?: "primary" | "secondary" };
      disabled?: { tone?: "primary" | "secondary" };
    };
    style?: BuilderNodeStyle;
  };
}

/**
 * One art-direction rendition: a DIFFERENT file for a narrower device.
 *
 * Not a crop and not a style — `objectFit` / `objectPosition` already re-frame
 * one file per breakpoint. This is the case those cannot serve: a 21:9 desktop
 * banner is often the wrong PHOTO at 375px, not merely the wrong crop, and art
 * direction means swapping the file.
 */
export interface BuilderImageDeviceSource {
  src: string;
  mediaId?: string;
}

export interface BuilderImageNode extends BuilderNodeBase {
  kind: "image";
  props: {
    src: string;
    mediaId?: string;
    /**
     * Per-device image sources (art direction). Keyed by the render-backed
     * override tiers — the same `tablet` / `mobile` ids `style.responsive`
     * uses, at the same width boundaries. Absent (the overwhelming default)
     * means the node emits exactly the `<img>` it always has.
     *
     * There is deliberately no per-tier `alt`: `<picture>` carries ONE
     * accessible name on its inner `<img>`, and the tiers are renditions of
     * the same subject. See the "image" case in `render.tsx`.
     */
    sources?: {
      tablet?: BuilderImageDeviceSource;
      mobile?: BuilderImageDeviceSource;
    };
    alt?: string;
    /**
     * Above-the-fold hint. When `true` the image is emitted with
     * `loading="eager"` + `fetchpriority="high"` so it is not deferred by the
     * lazy loader (used for the LCP hero image). Defaults to lazy when unset.
     */
    priority?: boolean;
    /**
     * Whole-image link (mirrors rich_text's whole-block `href`). Rendered as a
     * wrapping `<a>`; empty/absent = plain image. Prefixed + scheme-guarded by
     * `prefixPublicHrefsDeep` like every other builder href. Owner report
     * (2026-08-20): the shell logo could not link to the homepage — image
     * nodes had no link support at all.
     */
    href?: string;
    layerLabel?: string;
    fieldBindings?: BuilderNodeFieldBindings;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderVideoNode extends BuilderNodeBase {
  kind: "video";
  props: {
    src: string;
    poster?: string;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    controls?: boolean;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderEmbedNode extends BuilderNodeBase {
  kind: "embed";
  props: {
    src: string;
    title?: string;
    provider?: "youtube" | "vimeo" | "maps" | "calendly" | "url";
    allowFullScreen?: boolean;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderSocialPostNode extends BuilderNodeBase {
  kind: "social_post";
  props: {
    provider: "instagram" | "tiktok";
    /** CANONICAL post url (rebuilt by parseSocialPostUrl), never a raw paste. */
    url: string;
    caption?: string;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

export type BuilderSocialFeedItem = {
  id: string;
  /** Direct media URL (media library or any https image/video). */
  mediaUrl: string;
  mediaType?: "image" | "video";
  /** Poster frame for video items. */
  posterUrl?: string;
  /** Where a click leads (the post on Instagram/TikTok). */
  permalink?: string;
  caption?: string;
};

export interface BuilderSocialFeedNode extends BuilderNodeBase {
  kind: "social_feed";
  props: {
    /**
     * Where posts come from. "connected" pulls the tenant's linked account via
     * the feed cache (auto-updating); "manual" uses the curated `items`.
     * Defaults to manual so an existing block never silently changes source.
     */
    source?: "manual" | "connected";
    /** Presentation preset. */
    layout?: "grid" | "masonry" | "slider" | "stories";
    provider?: "instagram" | "tiktok" | "mixed";
    /** Account handle shown in the header, without the @. */
    handle?: string;
    columns?: number;
    /** Items shown before Load more / auto-load reveals the rest. */
    initialCount?: number;
    gap?: "none" | "sm" | "md" | "lg";
    aspect?: "square" | "portrait" | "video" | "auto";
    hover?: "none" | "zoom" | "caption" | "zoom-caption";
    lightbox?: boolean;
    loadMore?: "button" | "auto" | "none";
    autoplayVideos?: boolean;
    items: BuilderSocialFeedItem[];
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * WS7 Phase 0 — NATIVE search-first hero.
 *
 * Behavioural spec = the frozen `hero_search` curated section: eyebrow /
 * headline (+ highlight) / subheadline, an optional real GET search form
 * pointed at the tenant's directory route, manual quick-filter chips, and a
 * stat line that is either manual items or ONE tenant-derived talent count.
 *
 * The derived count is NOT fetched here. The renderer reads
 * `dataSources.tenantTalentCount`, which the server caller resolves via
 * `listTalentIdsOnTenantRoster(tenantId)` — the same visible-roster gate the
 * curated section honoured. No dataSources ⇒ no stat line, and never another
 * tenant's numbers.
 */
export interface BuilderHeroSearchNode extends BuilderNodeBase {
  kind: "hero_search";
  props: {
    eyebrow?: string;
    headline?: string;
    /** Emphasised phrase appended to the headline. */
    highlight?: string;
    subheadline?: string;
    /** Show the search form. */
    searchEnabled?: boolean;
    searchPlaceholder?: string;
    /** Form action; defaults to the tenant-prefixed `/directory`. */
    searchActionHref?: string;
    searchSubmitLabel?: string;
    primaryCtaLabel?: string;
    primaryCtaHref?: string;
    secondaryCtaLabel?: string;
    secondaryCtaHref?: string;
    /** Manual quick-filter chips. */
    chips?: Array<{ label: string; href?: string }>;
    /** `manual` renders `statItems`; `tenant_talent_count` renders the derived count. */
    statSource?: "manual" | "tenant_talent_count";
    statItems?: Array<{ value: string; label: string }>;
    /** Label paired with the derived count. */
    statCountLabel?: string;
    layout?: "centered" | "split" | "minimal" | "editorial";
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * RESERVATIONS — the public block a guest books a table from. Party, date,
 * service window, time, name, email. NO floor plan and no table picking: a
 * guest books "a table for four at eight", and which table that becomes is the
 * host's job at the door.
 *
 * `tenantId` is NOT here: the renderer injects it from
 * `options.dataSources.tenantId`, exactly as `menu_board` does. An operator
 * cannot type a tenant id and must never be asked to.
 *
 * `partyMin` / `partyMax` are DISPLAY BOUNDS ONLY. The server re-derives them
 * from `venue_service_rules` and refuses anything outside, so a block edited to
 * `partyMax: 500` would offer times and then refuse the booking with a reason.
 * They exist so the stepper does not offer obvious nonsense, not as a gate.
 */
export interface BuilderReserveTableNode extends BuilderNodeBase {
  kind: "reserve_table";
  props: {
    venueName?: string;
    ctaVerb?: string;
    partyMin?: number;
    partyMax?: number;
    cardNotice?: string | null;
    notesEnabled?: boolean;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderMenuBoardNode extends BuilderNodeBase {
  kind: "menu_board";
  props: {
    title?: string;
    subtitle?: string;
    emptyMessage?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * WS7 Phase 0 — NATIVE "Talent, by discipline" taxonomy grid.
 *
 * Behavioural spec = the frozen `talent_type_grid` curated section. Two modes:
 *   - `manual`  : operator-authored cards.
 *   - `dynamic` : categories derived from THIS tenant's visible roster ∩
 *                 `talent_profile_taxonomy` ∩ `taxonomy_terms`, resolved by the
 *                 SERVER caller and handed over on
 *                 `dataSources.talentDisciplines`. The renderer itself never
 *                 queries, so it cannot reach another tenant's roster.
 */
export interface BuilderTalentTypeGridNode extends BuilderNodeBase {
  kind: "talent_type_grid";
  props: {
    eyebrow?: string;
    headline?: string;
    subheadline?: string;
    mode?: "manual" | "dynamic";
    items?: Array<{
      label: string;
      description?: string;
      imageUrl?: string;
      imageAlt?: string;
      imagePosition?: string;
      taxonomyTermId?: string;
      href?: string;
      featured?: boolean;
    }>;
    /** dynamic mode — restrict to these taxonomy_term ids (empty = whole roster). */
    selectedTermIds?: string[];
    /** dynamic mode — roll child talent types up to their parent_category. */
    parentCategoryMode?: boolean;
    maxItems?: number;
    columns?: number;
    showCount?: boolean;
    showImages?: boolean;
    showDescriptions?: boolean;
    cardRatio?: "1/1" | "3/4" | "4/3" | "16/9";
    textPosition?: "overlay-bottom" | "below";
    seeAllLabel?: string;
    seeAllHref?: string;
    emptyStateText?: string;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderIconNode extends BuilderNodeBase {
  kind: "icon";
  props: {
    icon: import("./icon-registry").BuilderIconName;
    label?: string;
    layerLabel?: string;
    decorative?: boolean;
    size?: "sm" | "md" | "lg" | "xl";
    /** Inspector Reset P3 (D9 item 2) — exact typed/dragged size override.
     * See `sizeFree` on `BuilderSpacerNode` for the shared "Free" convention. */
    sizeFree?: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderPricingTableNode extends BuilderNodeBase {
  kind: "pricing_table";
  props: {
    tiers: Array<{
      id: string;
      name: string;
      description?: string;
      price: string;
      period?: string;
      ctaLabel?: string;
      ctaHref?: string;
      highlighted?: boolean;
      features?: Array<{
        label: string;
        included?: boolean;
      }>;
    }>;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderRichTextNode extends BuilderNodeBase {
  kind: "rich_text";
  props: {
    text: string;
    /** Whole-block link. Optional; empty/absent = not linked. */
    href?: string;
    fieldBindings?: BuilderNodeFieldBindings;
    style?: BuilderNodeStyle;
  };
}

/**
 * Raw author HTML/CSS. SECURITY: the author HTML is never inlined into the
 * page DOM — `render.tsx` mounts it inside a fully sandboxed iframe via
 * `srcdoc` with `sandbox="allow-scripts"` ONLY (no `allow-same-origin`), so it
 * runs on a unique opaque origin and cannot read the parent-scoped
 * `.tulala.digital` cookies or touch the parent DOM. Insertion/editing is
 * gated to platform owners (super_admin) in the editor chrome — see
 * `OWNER_ONLY_ELEMENT_INSERT_KINDS`. `minHeight` is the documented fallback
 * floor for the postMessage height handshake.
 */
export interface BuilderCodeNode extends BuilderNodeBase {
  kind: "code";
  props: {
    html: string;
    minHeight?: number;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderSpacerNode extends BuilderNodeBase {
  kind: "spacer";
  props: {
    size: "s" | "m" | "l";
    /** Inspector Reset P3 (D9 item 2, "preset = shortcut, never a ceiling") —
     * an exact typed/dragged height, taking precedence over `size` in the
     * renderer when present. Same "Free" companion-field convention as
     * `BuilderNodeStyle`'s `marginTopFree` etc. */
    sizeFree?: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderDividerNode extends BuilderNodeBase {
  kind: "divider";
  props: {
    tone?: "default" | "muted";
    style?: BuilderNodeStyle;
  };
}

/** Bounded editorial surface (stacked children, variant presets). */
export interface BuilderCardNode extends BuilderNodeBase {
  kind: "card";
  props: {
    variant?: "elevated" | "outline" | "ghost";
    layerLabel?: string;
    style?: BuilderNodeStyle;
    // Phase 4 (T4.4) — a `card` may ALSO be a linked-component instance, not
    // just a `container`. A card has children, so resolveInstanceChildren works
    // on it unchanged; the live render path treats it the same way. This is the
    // "non-container component root where sensible" widening: cards are the most
    // common reusable editorial unit (pricing card, feature card, testimonial).
    instanceOf?: string;
    instanceOverrides?: Record<string, BuilderNodeInstanceOverride>;
    instanceVariant?: string;
  };
  children: BuilderNode[];
}

/** Primary actions row: heading, copy, and button children with row/stack layout. */
export interface BuilderCtaGroupNode extends BuilderNodeBase {
  kind: "cta_group";
  props: {
    layout?: "row" | "stack";
    gap?: "s" | "m" | "l";
    align?: "start" | "center" | "end" | "stretch";
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

/** A single navigation link inside a `nav` node. Links are PROPS (not child
 *  nodes) so the responsive disclosure can render them in two places — the
 *  inline desktop row and the mobile menu — from one source of truth.
 *
 *  A3 (WS-A) — a link MAY carry a `children[]` submenu (one level deep). When
 *  present, the desktop renderer wraps the link in a CSS-driven disclosure
 *  (hover/focus dropdown, or a multi-column "mega" panel when the nav's
 *  `submenuVariant` is "mega") and the mobile menu nests the children inline.
 *  A link with NO `children` renders byte-identically to the pre-A3 flat link,
 *  so existing nav trees are unchanged. The schema caps nesting at one level
 *  (children's own `children` are stripped on validate) — deep trees are a
 *  documented non-goal for the header bar. */
export interface BuilderNavLink {
  id: string;
  label: string;
  href: string;
  /** Optional submenu. Absent ⇒ a plain flat link (pre-A3 behavior). */
  children?: BuilderNavLink[];
  /** Leading glyph from the operator icon library. */
  icon?: BuilderIconName;
  /** Second line inside a dropdown / mega panel and the drawer. Never in the bar. */
  description?: string;
  /** Small pill after the label ("New", "2026"). */
  badge?: string;
  /** Opens in a new tab and gets an outbound mark. */
  external?: boolean;
  /**
   * Which SURFACE renders this link — not which viewport.
   *
   * The bar and the collapsed menu are two mutually exclusive surfaces, and
   * `collapseAt` already decides which tier shows which. So placement and
   * viewport are separate questions, and each gets a one-word answer:
   * `placement: "menu"` is a drawer-only link (Account, Terms); `hideOn:
   * ["mobile"]` removes a link from phones entirely. Folding them into one
   * per-tier enum would re-encode `collapseAt` and invent impossible states
   * ("menu" on desktop, where there is no burger).
   */
  placement?: "both" | "bar" | "menu";
  /** Viewport tiers where the link is dropped from BOTH surfaces. */
  hideOn?: ReadonlyArray<"desktop" | "tablet" | "mobile">;
  /**
   * Promo card in this link's MEGA panel — the one place a menu carries an
   * image. Top-level links only; ignored elsewhere.
   */
  featured?: {
    title: string;
    description?: string;
    href: string;
    imageMediaId?: string;
    /** Resolved at render time, same duality as the image node. */
    imageSrc?: string;
  };
}

/**
 * Header navigation bar. Renders the links inline on desktop and collapses them
 * into a CSS-only hamburger→menu disclosure (native `<details>`/`<summary>`,
 * no client JS) below `collapseAt`. Solves the Responsive-axis gap where a
 * desktop link row simply vanished on mobile. The links remain reachable on
 * mobile via the disclosure menu; the toggle is keyboard-operable and exposes
 * its expanded/collapsed state natively (see render.tsx for the a11y notes).
 */
/**
 * Tulala component embed — drops a CURATED dynamic section (Directory,
 * Featured talent, Booking, CTA, …) into the freeform canvas, keyed by its
 * `sectionTypeKey` (a `SECTION_REGISTRY` key). The freeform renderer reuses the
 * SAME curated React component + server-fetch path the storefront uses for
 * CMS-composed sections (see `homepage-cms-sections.tsx`); it does NOT
 * reimplement the section.
 *
 * `config` carries the section's own props payload (the same shape the section
 * Editor writes for a CMS instance). At render time it is migrated + Zod-parsed
 * through the registry exactly like a CMS section; if it is empty / invalid /
 * the key is unknown, the renderer falls back to a labeled placeholder instead
 * of throwing, so a freeform page can never blank out.
 *
 * `sectionId` is an optional stable handle (form-submission routing,
 * section-scoped analytics). `dataBinding` is accepted for parity with other
 * data-aware nodes; curated sections fetch their own data from tenant context,
 * so it is currently advisory.
 */
/* ────────────────────────────────────────────────────────────────────────────
 * BUILDER 2027 · P2A — native kinds.
 *
 * Each of the twelve interfaces below is the native replacement for a FROZEN
 * curated section of the same name, so its props are that section's authoring
 * surface flattened into builder-node prop shape: no `presentation` /
 * `nodePresentation` envelopes (the builder's own style system owns those), no
 * LinkRef objects (builder nodes carry plain hrefs, prefixed at render), and
 * everything OPTIONAL so a freshly-inserted node is always schema-valid (a
 * required field at insert time silently breaks insertion — see the
 * `socialFeed` note in registry.ts).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * NATIVE `marquee` — the full-bleed scrolling ticker strip. Behavioural spec =
 * the frozen `marquee` curated section: a doubled item track translated
 * 0 → -50% so the loop is seamless, an optional separator glyph between items,
 * and a `tags` variant that renders each item as a pill instead of plain text.
 *
 * Beyond the legacy section: `pauseOnHover` and a real `prefers-reduced-motion`
 * stop (the legacy strip scrolled regardless).
 */
export interface BuilderMarqueeNode extends BuilderNodeBase {
  kind: "marquee";
  props: {
    items?: Array<{ text: string; href?: string }>;
    speed?: "slow" | "medium" | "fast";
    direction?: "left" | "right";
    separator?: "dot" | "slash" | "diamond" | "none";
    variant?: "text" | "tags";
    /** Freeze the loop while the pointer is over the strip. */
    pauseOnHover?: boolean;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * NATIVE `directory` — the tenant-scoped, filterable roster grid. Behavioural
 * spec = the frozen `directory` curated section, which renders on SEVEN Impronta
 * pages plus every tenant's `__directory__` system page.
 *
 * TENANT SCOPING: the renderer never queries. Cards come from
 * `dataSources.directoryProfiles`, which the SERVER caller resolves through the
 * same visible-roster gate the curated section honoured, and the filter chips
 * from `dataSources.directoryShortcuts`. Absent ⇒ the node renders its heading,
 * its real GET filter form and its empty state — never another tenant's roster.
 *
 * The reactive client engine (live re-query on keystroke, AI interpret, map
 * view, faceted sidebar) is NOT reimplemented here: when the server caller
 * injects `renderNativeLiveBlock`, this node delegates to it and gets the full
 * engine; without it the native GET-form grid is the fallback, so the node is
 * never dead on the canvas or in a tenant-less preview.
 */
export interface BuilderDirectoryNode extends BuilderNodeBase {
  kind: "directory";
  props: {
    eyebrow?: string;
    headline?: string;
    copy?: string;
    headerAlign?: "center" | "left" | "split";
    showHeading?: boolean;
    /** The noun this instance uses for its people ("Our Chefs" pages). */
    entityLabel?:
      | "talent"
      | "people"
      | "members"
      | "professionals"
      | "providers"
      | "team";
    scope?: "all" | "by_talent_type" | "by_tag" | "manual";
    talentTypeKeys?: string[];
    tagKeys?: string[];
    manualProfileCodes?: string[];
    /** Pinned to the front, in order. */
    pinnedProfileCodes?: string[];
    excludedProfileCodes?: string[];
    requirePhoto?: boolean;
    excludeUnavailable?: boolean;
    minTrustTier?: "any" | "basic" | "verified" | "silver" | "gold";
    defaultSort?: "recommended" | "newest" | "az" | "availability" | "curated";
    pagination?: "load_more" | "infinite" | "paged";
    pageSize?: number;
    columnsDesktop?: number;
    columnsTablet?: number;
    columnsMobile?: number;
    density?: "comfortable" | "compact";
    containerWidth?: "boxed" | "full";
    cardStyle?:
      | "portrait"
      | "editorial"
      | "portfolio"
      | "profile"
      | "stat"
      | "service"
      | "minimal";
    cardAspect?: "4:5" | "1:1" | "3:4" | "16:9";
    showName?: boolean;
    showTalentType?: boolean;
    showLocation?: boolean;
    showAvailability?: boolean;
    showBadges?: boolean;
    showSave?: boolean;
    showAddToInquiry?: boolean;
    showQuickView?: boolean;
    cardClickAction?: "modal" | "page";
    /** Render the search box above the grid (submits as a real GET). */
    filterSearchBox?: boolean;
    filterPlaceholder?: string;
    filterSubmitLabel?: string;
    /** Where the filter form posts; defaults to the tenant-prefixed `/directory`. */
    searchActionHref?: string;
    topBarMode?: "none" | "talent_type" | "field";
    sortControlShow?: boolean;
    showResultCount?: boolean;
    sidebarShow?: boolean;
    sidebarPosition?: "left" | "right";
    emptyStateTitle?: string;
    emptyStateText?: string;
    emptyStateCtaLabel?: string;
    emptyStateCtaHref?: string;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * NATIVE `featured_talent` — the curated talent showcase. Behavioural spec =
 * the frozen `featured_talent` curated section (and the `section_embed` inside
 * `featured-talent-freeform.ts`).
 *
 * Cards come from `dataSources.featuredTalentProfiles` — already resolved,
 * tenant-scoped, by the server caller — and render through the SAME
 * `FeaturedTalentCard` the bound-container path uses, so a native block and a
 * bound container are pixel-identical. Absent ⇒ the authored heading plus the
 * empty state; never a blank band.
 */
export interface BuilderFeaturedTalentNode extends BuilderNodeBase {
  kind: "featured_talent";
  props: {
    eyebrow?: string;
    headline?: string;
    copy?: string;
    sourceMode?:
      | "manual_pick"
      | "auto_featured_flag"
      | "auto_by_service"
      | "auto_by_destination"
      | "auto_recent";
    manualProfileCodes?: string[];
    filterServiceSlug?: string;
    filterDestinationSlug?: string;
    limit?: number;
    columnsDesktop?: number;
    variant?: "grid" | "carousel";
    headerAlign?: "split" | "left" | "center";
    cardVariant?: "editorial" | "compact" | "minimal" | "profile";
    showName?: boolean;
    showPrimaryType?: boolean;
    showSecondaryType?: boolean;
    showCity?: boolean;
    showLanguages?: boolean;
    showAvailability?: boolean;
    showBadge?: boolean;
    /** Show the parent category instead of the leaf talent type. */
    parentCategoryDisplay?: boolean;
    ctaLabel?: string;
    ctaHref?: string;
    footerCtaLabel?: string;
    footerCtaHref?: string;
    emptyStateText?: string;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * NATIVE `location_map` — a map with a content overlay card and city pins.
 * Behavioural spec = the frozen `location_discovery` section (city cards +
 * editorial pin map, sourced manually or from THIS tenant's roster cities)
 * UNIONED with `map_overlay`'s embedded map + copy card, which is the shape the
 * `section_embed` inside `location-discovery-freeform.ts` actually renders.
 *
 * Roster mode reads `dataSources.talentLocations` — server-resolved and
 * tenant-scoped, the same contract as `talentDisciplines`; absent ⇒ it falls
 * back to the authored `items` and never blanks out.
 */
export interface BuilderLocationMapNode extends BuilderNodeBase {
  kind: "location_map";
  props: {
    eyebrow?: string;
    headline?: string;
    subheadline?: string;
    /** `roster_cities` derives pins from the tenant roster; `manual` uses `items`. */
    source?: "manual" | "roster_cities";
    items?: Array<{
      label: string;
      region?: string;
      href?: string;
      count?: number;
      featured?: boolean;
      status?: "active" | "coming_soon";
    }>;
    maxItems?: number;
    showCount?: boolean;
    /** Draw the map panel at all. Off renders the plain city-card grid. */
    showMap?: boolean;
    /** `editorial` = the token-driven pin map (no external dep); `embed` = an iframe. */
    mapStyle?: "editorial" | "embed";
    /** Google Maps / OpenStreetMap embed URL, used when `mapStyle` is `embed`. */
    mapEmbedUrl?: string;
    /** The copy block laid over the map. */
    overlayTitle?: string;
    overlayBody?: string;
    overlayAddress?: string;
    overlayHours?: string;
    overlaySide?: "card-left" | "card-right" | "card-bottom";
    ratio?: "16/9" | "4/3" | "1/1" | "21/9";
    layout?: "grid" | "list" | "compact";
    ctaLabel?: string;
    ctaHref?: string;
    emptyStateText?: string;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * The four NATIVE shell widgets share one prop shape. Behavioural spec = the
 * frozen `header_search` / `header_account` / `header_inquiry` /
 * `header_language` curated sections, which today are embedded as children of
 * the `site_header` landmark through `section_embed`.
 *
 * WHY THE SHAPE IS SHARED: each legacy section carried the same all-optional
 * `headerWidgetSchemaV1` (an operator note plus an icon override) because the
 * widget owned its own markup. The native kinds keep that surface and ADD the
 * per-widget authoring the frozen sections never had — a visible label, an
 * href, a count toggle — so a tenant can finally rename or relabel a header
 * control.
 *
 * LIVE vs STATIC: `header_search` and `header_language` are fully native (a
 * link, and the locale row the shell already threads on
 * `options.availableLocales`). `header_account` and `header_inquiry` need the
 * visitor session, which the shared renderer must never read — so they render
 * their own real link markup by default and DELEGATE to
 * `options.renderNativeLiveBlock` when the server shell injects it. Neither
 * branch can ever be a dead chip.
 */
// A `type` alias, not an `interface`: an interface has no implicit index
// signature, so `interface & {…}` is not assignable to `Record<string, unknown>`
// and every generic prop-bag consumer in the editor chrome (multi-selection
// style panel, quick-style popover) rejects the node. Object-literal type
// aliases keep the implicit signature through the intersection.
export type BuilderHeaderWidgetPropsBase = {
  /** Visible label next to the glyph, and the control's accessible name. */
  label?: string;
  /** Show the label as text; off keeps the icon-only header affordance. */
  showLabel?: boolean;
  /** Operator glyph override; absent keeps the widget's own icon. */
  icon?: BuilderIconName;
  /** Where the control leads. Absent uses the widget's own default route. */
  href?: string;
  layerLabel?: string;
  style?: BuilderNodeStyle;
};

export interface BuilderHeaderSearchNode extends BuilderNodeBase {
  kind: "header_search";
  props: BuilderHeaderWidgetPropsBase & {
    /** Render an inline search input instead of a link to the directory. */
    inlineField?: boolean;
    placeholder?: string;
  };
}

export interface BuilderHeaderAccountNode extends BuilderNodeBase {
  kind: "header_account";
  props: BuilderHeaderWidgetPropsBase & {
    signedOutLabel?: string;
    signedInLabel?: string;
  };
}

export interface BuilderHeaderInquiryNode extends BuilderNodeBase {
  kind: "header_inquiry";
  props: BuilderHeaderWidgetPropsBase & {
    /** Show the saved-item badge on the trigger. */
    showCount?: boolean;
  };
}

export interface BuilderHeaderLanguageNode extends BuilderNodeBase {
  kind: "header_language";
  props: BuilderHeaderWidgetPropsBase & {
    /** `code` renders EN | ES; `name` renders English | Espanol. */
    display?: "code" | "name";
    /** Glyph drawn between locales. */
    separator?: string;
  };
}

/**
 * NATIVE `sticky_scroll` — a media column that stays pinned while the copy
 * blocks beside it scroll past. Behavioural spec = the frozen `sticky_scroll`
 * curated section, including its `\n\n` paragraph splitting inside each block.
 */
export interface BuilderStickyScrollNode extends BuilderNodeBase {
  kind: "sticky_scroll";
  props: {
    eyebrow?: string;
    headline?: string;
    imageUrl?: string;
    imageAlt?: string;
    blocks?: Array<{ title: string; body?: string }>;
    side?: "media-left" | "media-right";
    variant?: "bordered" | "minimal";
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * NATIVE `reveal` — a WRAPPER primitive (children: any) that animates whatever
 * is dropped inside it as it scrolls into view. New; there is no frozen section
 * counterpart.
 *
 * FAILURE MODE THIS DESIGN RULES OUT: the previous `revealOnView` shipped dead
 * on every published page because it hid its content in CSS and armed the
 * reveal from a runtime that a published page never injected. Here the content
 * is VISIBLE by default and the node emits its own arming script inline, next
 * to the markup it animates. With JavaScript off — or if the script never runs
 * for any reason — nothing is ever hidden.
 */
export interface BuilderRevealNode extends BuilderNodeBase {
  kind: "reveal";
  children: BuilderNode[];
  props: {
    effect?: "fade" | "rise" | "scale" | "blur" | "mask-up" | "none";
    direction?: "up" | "down" | "left" | "right";
    /** Travel distance in px for `rise` / directional effects. */
    distance?: number;
    durationMs?: number;
    delayMs?: number;
    /** Per-child delay in ms, so a grid reveals in sequence. */
    staggerMs?: number;
    /** Intersection ratio that triggers the reveal (0..1). */
    threshold?: number;
    /** Reveal once and stay revealed (default) vs re-run on every entry. */
    once?: boolean;
    easing?: "linear" | "ease" | "ease-out" | "ease-in-out";
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * NATIVE `stats` — the oversized-numeral credibility band. Behavioural spec =
 * the frozen `stats` curated section (value / label / caption rows in a row,
 * grid, or split layout).
 *
 * Beyond the legacy section: an ANIMATED COUNT-UP. The server renders the FINAL
 * value, so a no-JS visitor and every crawler see the real number; the inline
 * script only counts up to a value that is already in the DOM.
 */
export interface BuilderStatsNode extends BuilderNodeBase {
  kind: "stats";
  props: {
    eyebrow?: string;
    headline?: string;
    items?: Array<{
      value: string;
      label: string;
      caption?: string;
      prefix?: string;
      suffix?: string;
    }>;
    variant?: "row" | "grid" | "split";
    align?: "start" | "center";
    columns?: number;
    /** Count up from zero when the band scrolls into view. */
    animate?: boolean;
    durationMs?: number;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

/**
 * NATIVE `before_after` — the drag-to-compare slider. Behavioural spec = the
 * frozen `before_after` curated section: two stacked images, the top one
 * clip-pathed by a CSS custom property that a native `<input type="range">`
 * drives, so it is keyboard-operable and needs no hydration.
 *
 * Beyond the legacy section: a `vertical` orientation.
 */
export interface BuilderBeforeAfterNode extends BuilderNodeBase {
  kind: "before_after";
  props: {
    eyebrow?: string;
    headline?: string;
    beforeUrl?: string;
    afterUrl?: string;
    beforeAlt?: string;
    afterAlt?: string;
    beforeLabel?: string;
    afterLabel?: string;
    /** Initial divider position, percent from the left (or top). */
    initialPosition?: number;
    ratio?: "16/9" | "4/3" | "1/1" | "5/4";
    orientation?: "horizontal" | "vertical";
    /** Accessible name for the range control. */
    sliderLabel?: string;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderSectionEmbedNode extends BuilderNodeBase {
  kind: "section_embed";
  props: {
    sectionTypeKey: string;
    sectionId?: string | null;
    dataBinding?: BuilderDataBindingProps;
    layerLabel?: string;
    config?: Record<string, unknown>;
    /**
     * Wrapper-level style overrides applied to the section_embed's wrapper
     * <div> (background, padding, margin, border, radius, max-width, shadow…).
     * Lets a curated "Tulala component" be restyled at the OUTER box without
     * touching its internal `config` presentation. Optional — absent on every
     * historical embed, so they render unchanged.
     */
    style?: BuilderNodeStyle;
  };
}

/**
 * A single field inside a `form` node. Fields are PROPS (not child nodes) so the
 * renderer can emit them as one coherent `<form>` from a single source of truth —
 * the same modelling choice as `nav` links and `pricing_table` tiers.
 *
 * `type` maps to the rendered control: text/email/tel → `<input>`, textarea →
 * `<textarea>`. `name` is the submission key (becomes a property on the
 * `payload_jsonb` recorded by /api/cms/forms/submit — `email`/`name` are also
 * projected onto contact columns). `submit` is the action button (no `name`).
 */
export interface BuilderFormField {
  id: string;
  /** Submission key (form-data field name). Lowercase/no-spaces recommended. */
  name: string;
  type:
    | "text"
    | "email"
    | "tel"
    | "textarea"
    | "submit"
    | "select"
    | "radio"
    | "checkbox"
    | "date"
    | "file"
    | "consent";
  /** Options for select / radio groups (one label per option). */
  options?: string[];
  /** Visible label (also the submit button caption for type:"submit"). */
  label: string;
  placeholder?: string;
  /** Legal copy beside a consent checkbox. Only used when type is "consent". */
  consentText?: string;
  required?: boolean;
}

/**
 * MVP lead/contact form. Renders a native `<form>` of field controls plus a
 * submit button, with a honeypot + hidden `__tulala_section` so it can POST to
 * the existing internal submission endpoint (`/api/cms/forms/submit`) — that
 * route validates the section, drops honeypot trips, rate-limits, records the
 * row, and emails workspace admins. Set `action` to "internal" (default; uses
 * the endpoint above and requires `sectionId` to be a real `cms_sections` row
 * id) or to a full external URL (Formspree, your own handler, …).
 *
 * DEFERRED (clearly noted): multi-step flows and client-side validation beyond
 * native `required`/`type` constraints.
 */
export interface BuilderFormNode extends BuilderNodeBase {
  kind: "form";
  props: {
    /** Where the form POSTs. "internal" → /api/cms/forms/submit; or a full URL. */
    action?: string;
    /** HTTP method — defaults to post; use get for directory search bars. */
    method?: "get" | "post";
    /** Required when action is "internal": the cms_sections row id to record under. */
    sectionId?: string | null;
    layerLabel?: string;
    fields: BuilderFormField[];
    /**
     * Optional override for the submit button's label. When set, it wins over
     * the submit field's own `label` — so a top-level prop (which an A/B
     * experiment's `propOverrides` can target) drives the CTA text. Falls back
     * to the submit field label when unset, so existing trees are unchanged.
     */
    submitLabel?: string;
    /** Honeypot field name (a hidden input bots fill — submissions with it set are flagged spam). */
    honeypotName?: string;
    /**
     * Field-box styling — the INPUTS, not the form wrapper (`style` covers
     * that). These exist because the renderer's field defaults, however sound,
     * were the only option: an operator whose brand wanted filled fields, round
     * corners, or a specific border color had no control anywhere in the
     * builder. Any CSS color string; unset = the token-driven defaults.
     */
    fieldBorderColor?: string;
    fieldBackground?: string;
    /** CSS length for the field corner radius, e.g. "0px" | "3px" | "10px". */
    fieldCornerRadius?: string;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderNavNode extends BuilderNodeBase {
  kind: "nav";
  props: {
    /** Optional brand/wordmark shown at the start of the bar. */
    brand?: string;
    /** Where the brand links (default "/"). */
    brandHref?: string;
    /** Navigation links — rendered inline on desktop AND inside the mobile menu.
     *  A link with a `children[]` submenu renders as a disclosure (see
     *  `submenuVariant`); a link without children stays a plain flat link. */
    links: BuilderNavLink[];
    /** A3 — how a link's `children[]` submenu opens on desktop.
     *  "dropdown" (default) = a single-column hover/focus panel under the link;
     *  "mega" = a wider multi-column panel. Ignored for links with no children.
     *  Absent ⇒ "dropdown". */
    submenuVariant?: "dropdown" | "mega";
    /** Viewport at/below which the inline row collapses to the hamburger menu.
     *  "mobile" = ≤640px (default), "tablet" = ≤900px. */
    collapseAt?: "tablet" | "mobile";
    /** A6 (WS-A) — how the collapsed mobile menu opens. Mirrors the live header's
     *  `PublicHeaderMobileMenu` variants so the shell's mobile menu style is
     *  pickable. The CSS-only <details> disclosure positions + animates its panel
     *  per variant:
     *    "dropdown"        (default) — the pre-A6 panel under the toggle.
     *    "drawer-right"    — a right-side slide-in drawer (88vw, capped).
     *    "sheet-bottom"    — a bottom sheet (rounded top, ≤80vh).
     *    "full-screen-fade"— a full-viewport fade-in overlay.
     *  Absent ⇒ "dropdown" (byte-identical to the pre-A6 nav). */
    mobileMenuVariant?:
      | "dropdown"
      | "drawer-right"
      | "sheet-bottom"
      | "full-screen-fade";
    /** Accessible label for the hamburger toggle (default "Menu"). */
    menuLabel?: string;
    // Mobile-menu palette — the authoring path to the --bn-nav-menu-* custom
    // properties, so a dark site does not get a white drawer.
    menuBackground?: string;
    menuTextColor?: string;
    menuBorderColor?: string;
    /** Link interaction in the bar. Default "underline". */
    linkHover?: "underline" | "fade" | "none";
    /** Mega panel columns. Absent ⇒ auto-fill (pre-v2 behaviour). */
    megaColumns?: 2 | 3 | 4;
    /** Anchored under the trigger (default) or full-bleed across the nav. */
    megaWidth?: "anchored" | "full";
    /** Mobile drawer furniture — props, not child nodes (see the schema note). */
    menu?: {
      ctaLabel?: string;
      ctaHref?: string;
      showSocial?: boolean;
      showLanguageToggle?: boolean;
      groups?: "inline" | "collapsible";
      density?: "compact" | "comfortable" | "spacious";
    };
    /** Accent for the underline, badges and the drawer CTA (--bn-nav-accent). */
    accentColor?: string;
    /** Accessible label for the <nav> landmark (default "Primary"). */
    ariaLabel?: string;
    /**
     * A4 follow-up — OPTIONAL bind to a collection nav source (`cms_page` =
     * published site pages, `cms_posts` = published blog posts). When set AND
     * the SHELL/server caller supplies the resolved records, the nav AUTO-
     * POPULATES its top-level links from those records (label + href from the
     * record fields) instead of the static `links[]`. Absent binding ⇒ the
     * static authored `links[]` render exactly as before (byte-identical), so
     * existing navs are unchanged. A bound link is always flat (no submenu);
     * the static `links[]` are kept as the fallback when nothing resolves so a
     * nav never blanks out.
     */
    dataBinding?: BuilderDataBindingProps;
    style?: BuilderNodeStyle;
  };
}

/** A4 — supported social platforms for the `social_links` node. Mirrors the
 *  header cluster's `HeaderSocialPlatform` vocabulary so a node can bind to the
 *  same canonical `agency_business_identity` store the inspector edits. The
 *  renderer paints a brand-neutral glyph per platform in `currentColor`. */
export type BuilderSocialPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "x"
  | "whatsapp"
  | "email";

/** A single social/contact link inside a `social_links` node. `href` is the
 *  full destination (https URL, mailto:, tel:, or wa.me). Links are PROPS so
 *  the renderer emits one coherent icon row from a single source of truth —
 *  the same modelling choice as `nav` links and `form` fields. */
export interface BuilderSocialLink {
  id: string;
  platform: BuilderSocialPlatform;
  href: string;
  /** Optional accessible label override (defaults to the platform name). */
  label?: string;
  /**
   * Override the platform's glyph with one from the icon library.
   *
   * The platform enum decides the DEFAULT mark and the accessible name; this
   * only changes what is drawn. So a tenant whose network is not in the enum
   * can still show the right icon, and one who wants a plain "link" glyph for
   * a partner site is not forced into a brand mark.
   */
  icon?: BuilderIconName;
}

/**
 * A4 (WS-A) — a row of social/contact icon links. Renders each platform as a
 * brand-neutral SVG glyph (in `currentColor`) wrapped in an `<a>`. Designed for
 * the site shell header/footer but droppable in any layout shell.
 *
 * OPTIONALLY binds to the `workspace_social_links` data source: when
 * `dataBinding` is set the SHELL/server caller passes the tenant's resolved
 * social links (from `agency_business_identity` via `resolveShellSocialContact`)
 * and the renderer paints those instead of the static `links[]`. Absent binding
 * ⇒ the static authored `links[]` render (a node never blanks out). The icon
 * presentation (size, gap, shape) is shared with the existing header cluster.
 */
export interface BuilderSocialLinksNode extends BuilderNodeBase {
  kind: "social_links";
  props: {
    /** Static authored links — the fallback when no data binding resolves. */
    links: BuilderSocialLink[];
    /** Icon glyph size (default "md"). */
    size?: "sm" | "md" | "lg";
    /** Icon container shape: "bare" = glyph only, "circle"/"square" = chip. */
    shape?: "bare" | "circle" | "square";
    /** Accessible label for the list landmark (default "Social links"). */
    ariaLabel?: string;
    /** Optional bind to `workspace_social_links` (tenant identity store). */
    dataBinding?: BuilderDataBindingProps;
    layerLabel?: string;
    style?: BuilderNodeStyle;
  };
}

export type BuilderNode =
  | BuilderSectionNode
  | BuilderContainerNode
  | BuilderSplitNode
  | BuilderAccordionNode
  | BuilderAccordionItemNode
  | BuilderTabsNode
  | BuilderTabPanelNode
  | BuilderCarouselNode
  | BuilderMasonryNode
  | BuilderHeadingNode
  | BuilderParagraphNode
  | BuilderButtonNode
  | BuilderImageNode
  | BuilderVideoNode
  | BuilderEmbedNode
  | BuilderSocialPostNode
  | BuilderSocialFeedNode
  | BuilderHeroSearchNode
  | BuilderMenuBoardNode
  | BuilderReserveTableNode
  | BuilderTalentTypeGridNode
  | BuilderIconNode
  | BuilderPricingTableNode
  | BuilderRichTextNode
  | BuilderCodeNode
  | BuilderDividerNode
  | BuilderSpacerNode
  | BuilderCardNode
  | BuilderCtaGroupNode
  | BuilderNavNode
  | BuilderSocialLinksNode
  | BuilderFormNode
  // BUILDER 2027 · P2A
  | BuilderMarqueeNode
  | BuilderDirectoryNode
  | BuilderFeaturedTalentNode
  | BuilderLocationMapNode
  | BuilderHeaderSearchNode
  | BuilderHeaderAccountNode
  | BuilderHeaderInquiryNode
  | BuilderHeaderLanguageNode
  | BuilderStickyScrollNode
  | BuilderRevealNode
  | BuilderStatsNode
  | BuilderBeforeAfterNode
  | BuilderSectionEmbedNode;

export type BuilderNodeTree = BuilderNode[];
