/* eslint-disable max-lines -- hand-authored BuilderNode type + schema definitions (discriminated union + the full style-value model); inherently large, like the other builder-node data files. */
import type { BackgroundMediaProps } from "./background-media";
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
  borderStyle?: "solid" | "dashed" | "dotted";
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
  position?: "relative" | "absolute" | "sticky";
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
  // Compositing — how this node's pixels blend with whatever sits behind it
  // (multiply/darken for overlays, screen/lighten to brighten, overlay for
  // contrast). Immediately visible; great for image overlays + duotone.
  mixBlendMode?: "multiply" | "screen" | "overlay" | "darken" | "lighten";
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
  animationPreset?:
    | "none"
    | "fade-in"
    | "rise"
    | "fall"
    | "zoom-in"
    | "slide-left"
    | "slide-right"
    | "blur-in"
    | "flip-in"
    | "bounce-in";
  animationDuration?: string;
  animationDelay?: string;
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
  animationTrigger?: "load" | "scroll";
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
// while the node is hovered (or keyboard-focused). A single layer (NOT
// per-viewport: hover is a desktop/pointer interaction). Paired with the
// `transition` escape to ease the change. Colors accept tokens/hex/rgb; scale
// is a unitless factor ("1.04"); translate is 1-2 lengths ("0 -4px"); opacity
// is 0–1.
export interface BuilderNodeHoverStyle {
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  boxShadow?: string;
  scale?: string;
  translate?: string;
  opacity?: number;
}

export interface BuilderNodeStyle extends BuilderNodeStyleValue {
  responsive?: {
    tablet?: BuilderNodeStyleValue;
    mobile?: BuilderNodeStyleValue;
  };
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

export interface BuilderImageNode extends BuilderNodeBase {
  kind: "image";
  props: {
    src: string;
    mediaId?: string;
    alt?: string;
    /**
     * Above-the-fold hint. When `true` the image is emitted with
     * `loading="eager"` + `fetchpriority="high"` so it is not deferred by the
     * lazy loader (used for the LCP hero image). Defaults to lazy when unset.
     */
    priority?: boolean;
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
  /** Optional one-level submenu. Absent ⇒ a plain flat link (pre-A3 behavior). */
  children?: BuilderNavLink[];
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
  | BuilderSectionEmbedNode;

export type BuilderNodeTree = BuilderNode[];
