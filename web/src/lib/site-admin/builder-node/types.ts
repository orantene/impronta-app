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
  | "icon"
  | "pricing_table"
  | "rich_text"
  | "code"
  | "divider"
  | "spacer"
  | "card"
  | "cta_group"
  | "nav"
  | "section_embed";

export interface BuilderNodeBase {
  id: string;
  kind: BuilderNodeKind;
  /**
   * P3-LOCK — per-node editorial lock. When true the selection-layer skips
   * click/resize/move/nudge for this node, the inspector shows a locked banner
   * with an unlock affordance, and the layers-tree row shows a lock icon.
   * Persisted via the normal `patchBuilderNodeProps` path (patch: { locked: true/undefined }).
   */
  locked?: boolean;
}

export interface BuilderNodeStyleValue {
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "muted" | "strong";
  maxWidth?: "narrow" | "reading" | "wide" | "full";
  marginTop?: "none" | "s" | "m" | "l";
  marginBottom?: "none" | "s" | "m" | "l";
  paddingX?: "none" | "s" | "m" | "l";
  paddingY?: "none" | "s" | "m" | "l";
  background?: "none" | "surface" | "contrast";
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
  // Surface & depth escapes. backgroundImage takes a CSS url()/gradient. It is
  // painted cover/center/no-repeat by default, but backgroundSize /
  // backgroundPosition / backgroundRepeat each override one axis of that (free
  // CSS values, e.g. "contain", "top left", "repeat"). opacity is 0–1.
  // textShadow takes a free CSS text-shadow value (e.g. "0 2px 8px rgba(0,0,0,.4)").
  boxShadow?: string;
  textShadow?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  // Gradient/clipped text — clip the background paint to the text glyphs so a
  // gradient (or any background) shows *through* the letters. Only "text" is
  // meaningful; the renderer also emits the -webkit- prefix and a transparent
  // text fill. Ignored unless a backgroundImage or backgroundColor is set, so
  // it can never silently blank the text.
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
  // Trigger: "load" plays once on page load; "scroll" drives the animation by
  // scroll position via CSS scroll-driven animations (animation-timeline:view()).
  // Pure CSS — unsupported browsers fall back to playing it on load.
  animationTrigger?: "load" | "scroll";
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
    // "2018 bye-bye" — when true this curated section has been EJECTED to
    // freeform: its content was re-minted as roleless builder children, the
    // curated React component no longer renders for it, and the legacy
    // derivation no longer re-hydrates it. Reversible (un-eject clears the
    // flag + children → the section re-derives). Lives in the snapshot tree.
    ejected?: boolean;
  };
  children?: BuilderNode[];
}

export interface BuilderContainerNode extends BuilderNodeBase {
  kind: "container";
  props: {
    layout: "stack" | "row" | "grid";
    gap?: "s" | "m" | "l";
    columns?: 1 | 2 | 3 | 4;
    align?: "start" | "center" | "end" | "stretch";
    responsive?: {
      tablet?: {
        layout?: "stack" | "row" | "grid";
        gap?: "s" | "m" | "l";
        columns?: 1 | 2 | 3 | 4;
        align?: "start" | "center" | "end" | "stretch";
      };
      mobile?: {
        layout?: "stack" | "row" | "grid";
        gap?: "s" | "m" | "l";
        columns?: 1 | 2 | 3 | 4;
        align?: "start" | "center" | "end" | "stretch";
      };
    };
    dataBinding?: BuilderDataBindingProps;
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
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderAccordionNode extends BuilderNodeBase {
  kind: "accordion";
  props: {
    allowMultiple?: boolean;
    defaultOpenItemIds?: string[];
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
    slidesPerView?: 1 | 2 | 3 | 4;
    autoplayMs?: number;
    loop?: boolean;
    showArrows?: boolean;
    showDots?: boolean;
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderMasonryNode extends BuilderNodeBase {
  kind: "masonry";
  props: {
    columns?: 2 | 3 | 4 | 5;
    gap?: "s" | "m" | "l";
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

export interface BuilderHeadingNode extends BuilderNodeBase {
  kind: "heading";
  props: {
    text: string;
    level: 1 | 2 | 3 | 4;
    fieldBindings?: BuilderNodeFieldBindings;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderParagraphNode extends BuilderNodeBase {
  kind: "paragraph";
  props: {
    text: string;
    fieldBindings?: BuilderNodeFieldBindings;
    style?: BuilderNodeStyle;
  };
}

export interface BuilderButtonNode extends BuilderNodeBase {
  kind: "button";
  props: {
    label: string;
    href: string;
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

export interface BuilderIconNode extends BuilderNodeBase {
  kind: "icon";
  props: {
    icon: import("./icon-registry").BuilderIconName;
    label?: string;
    decorative?: boolean;
    size?: "sm" | "md" | "lg" | "xl";
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
    style?: BuilderNodeStyle;
  };
  children: BuilderNode[];
}

/** A single navigation link inside a `nav` node. Links are PROPS (not child
 *  nodes) so the responsive disclosure can render them in two places — the
 *  inline desktop row and the mobile menu — from one source of truth. */
export interface BuilderNavLink {
  id: string;
  label: string;
  href: string;
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
    config?: Record<string, unknown>;
  };
}

export interface BuilderNavNode extends BuilderNodeBase {
  kind: "nav";
  props: {
    /** Optional brand/wordmark shown at the start of the bar. */
    brand?: string;
    /** Where the brand links (default "/"). */
    brandHref?: string;
    /** Navigation links — rendered inline on desktop AND inside the mobile menu. */
    links: BuilderNavLink[];
    /** Viewport at/below which the inline row collapses to the hamburger menu.
     *  "mobile" = ≤640px (default), "tablet" = ≤900px. */
    collapseAt?: "tablet" | "mobile";
    /** Accessible label for the hamburger toggle (default "Menu"). */
    menuLabel?: string;
    /** Accessible label for the <nav> landmark (default "Primary"). */
    ariaLabel?: string;
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
  | BuilderIconNode
  | BuilderPricingTableNode
  | BuilderRichTextNode
  | BuilderCodeNode
  | BuilderDividerNode
  | BuilderSpacerNode
  | BuilderCardNode
  | BuilderCtaGroupNode
  | BuilderNavNode
  | BuilderSectionEmbedNode;

export type BuilderNodeTree = BuilderNode[];
