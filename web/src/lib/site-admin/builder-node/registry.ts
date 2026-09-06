import { z } from "zod";
import { BUILDER_ICON_NAMES } from "./icon-registry";
import {
  isBindableTokenKey,
  isStyleTokenRef,
  STYLE_TOKEN_REF_PREFIX,
} from "./style-token-bindings";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import {
  SOCIAL_POST_PROVIDERS,
  parseSocialPostUrl,
} from "@/lib/social-embed/social-post-url";
import {
  BUILDER_ANIMATION_PRESETS,
  BUILDER_ANIMATION_REPEATS,
  BUILDER_ANIMATION_TRIGGERS,
} from "./animation-presets";
import { backgroundMediaSchema } from "./background-media";
import { BUILDER_MIX_BLEND_MODES, type BuilderNodeKind } from "./types";
import {
  BORDER_COLOR_MAX_CHARS,
  BORDER_STYLE_MAX_CHARS,
  isBuilderBorderStyleShorthand,
  isBuilderColorShorthand,
  splitCssSpaceList,
} from "./border-shorthand";

/** Kinds allowed inside composable shells (section body, container, card, CTA group, …). */
const COMPOSABLE_LAYOUT_CHILD_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "container",
  "card",
  "cta_group",
  "split",
  "nav",
  "social_links",
  "accordion",
  "tabs",
  "carousel",
  "masonry",
  "heading",
  "paragraph",
  "button",
  "image",
  "video",
  "embed",
  // Instagram / TikTok featured post. Renders the provider's own blockquote,
  // hydrated by their embed.js — no oEmbed API call, no token. See
  // lib/social-embed/social-post-url.ts for why.
  "social_post",
  // Social FEED — a curated gallery of posts/reels (grid/masonry/slider/
  // stories) with lazy-load + lightbox. Paid plans only (enforced at publish
  // preflight; the gallery card carries the same gate).
  "social_feed",
  "icon",
  "pricing_table",
  "rich_text",
  "code",
  "divider",
  "spacer",
  // Lead/contact form — droppable inside layout shells as well as at the root.
  "form",
  // WS7 Phase 0 — the NATIVE data blocks are ordinary leaves for drop purposes,
  // exactly like `section_embed`: droppable inside a layout shell or at the root.
  "hero_search",
  "talent_type_grid",
  // `menu_board` and `reserve_table` are page bands exactly like the two above,
  // and page designs legitimately nest them inside a layout container. They
  // were missing here while being allowed at the page ROOT by drop-policy —
  // an inconsistency nothing exercised until a design tree was validated, at
  // which point `restaurant-orderable` and `store-orderable` failed and
  // rendered NOTHING.
  "menu_board",
  "reserve_table",
  // BUILDER 2027 · P2A — the native kinds are ordinary leaves for drop purposes
  // too, except `reveal`, which is itself a wrapper (it accepts any child) and
  // is therefore droppable anywhere a layout shell is.
  "marquee",
  "directory",
  "featured_talent",
  "location_map",
  "header_search",
  "header_account",
  "header_inquiry",
  "header_language",
  "sticky_scroll",
  "reveal",
  "stats",
  "before_after",
  // Tulala components (curated dynamic sections) are droppable inside generic
  // layout shells as well as at the page root.
  "section_embed",
];

/** §7A parent/child governance — Card (typography + media + actions; no layout shells inside). */
const CARD_CHILD_KINDS: ReadonlyArray<BuilderNodeKind> = ["heading", "paragraph", "button", "image"];

/** §7A parent/child governance — CTA group is buttons only. */
const CTA_GROUP_CHILD_KINDS: ReadonlyArray<BuilderNodeKind> = ["button"];

export type BuilderNodeChildrenPolicy =
  | { type: "none" }
  | { type: "any" }
  | { type: "allow_list"; kinds: ReadonlyArray<BuilderNodeKind> };

export interface BuilderNodeRegistryEntry {
  kind: BuilderNodeKind;
  label: string;
  description: string;
  children: BuilderNodeChildrenPolicy;
  propsSchema: z.ZodTypeAny;
}

const dataBindingPropsSchema = z.object({
  sourceKey: z.string().min(1),
  mode: z.enum(["auto", "manual", "bound", "hybrid"]).optional(),
  filterQuery: z.string().max(500).optional(),
  maxItems: z.number().int().min(1).max(100).optional(),
  repeat: z.boolean().optional(),
});

const fieldBindingPropsSchema = z.object({ text: z.string().max(160).optional(), label: z.string().max(160).optional(), href: z.string().max(160).optional(), src: z.string().max(160).optional(), alt: z.string().max(160).optional() }).strict();

// Token-binding-aware string (Wave 3 · 3A). A color / font-family style value
// may be a raw CSS string OR a `token:<key>` reference that binds the prop to a
// Theme design token (see builder-node/style-token-bindings.ts). This validator
// accepts any raw string (back-compat — hex / rgb / keyword / literal var()) but
// REJECTS a malformed `token:` sentinel whose key is not a known bindable token,
// so a typo'd binding is caught at authoring time instead of silently rendering
// nothing. `undefined` stays optional → identical render when unset.
function tokenAwareStyleString(max: number) {
  return z
    .string()
    .max(max)
    .refine((v) => !isStyleTokenRef(v) || isBindableTokenKey(v.slice(STYLE_TOKEN_REF_PREFIX.length)), {
      message:
        "Unknown theme token reference. Use token:<color.* | typography.* | radius.* | shadow.* | space.*> for a bindable token, or a raw CSS value.",
    })
    .optional();
}

function isBindableTokenOrRaw(part: string): boolean {
  if (!isStyleTokenRef(part)) return true;
  return isBindableTokenKey(part.slice(STYLE_TOKEN_REF_PREFIX.length));
}

/**
 * `borderColor` accepts a single color OR a 1-4 value TRBL shorthand.
 * Each term is validated independently so `token:color.primary #111` is legal
 * and a typo'd sentinel is still rejected. Cap is named in border-shorthand.ts.
 */
function tokenAwareColorShorthand(max: number) {
  return z
    .string()
    .max(max)
    .refine((v) => isBuilderColorShorthand(v) && splitCssSpaceList(v).every(isBindableTokenOrRaw), {
      message:
        "Unknown theme token reference, or more than four border-color terms. Use token:<color.*> or a raw CSS color, up to four sides.",
    })
    .optional();
}

const sectionPropsSchema = z.object({
  sectionId: pgUuidSchema().nullable().optional(),
  sectionTypeKey: z.string().min(1),
  label: z.string().nullable().optional(),
  slotKey: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dataBinding: dataBindingPropsSchema.optional(),
  ejected: z.boolean().optional(),
  // Inline self-contained section config for shell landmarks (e.g. the talent
  // site_header). Opaque passthrough here; the render port validates it against
  // the section's own registered schema before use.
  sectionProps: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Exported so the per-component-type default-style cascade
 * (`component-style-defaults.ts`) validates stored defaults against the exact
 * same style-value contract a node's own style uses — no drift.
 */
export const builderNodeStyleValueSchema = z.object({
  align: z.enum(["left", "center", "right"]).optional(),
  /** STYLE-2 — 'display' is the tier above 'xl'. Existing tiers unchanged. */
  size: z.enum(["sm", "md", "lg", "xl", "display"]).optional(),
  tone: z.enum(["default", "muted", "strong"]).optional(),
  maxWidth: z.enum(["narrow", "reading", "wide", "full"]).optional(),
  marginTop: z.enum(["none", "s", "m", "l"]).optional(),
  marginBottom: z.enum(["none", "s", "m", "l"]).optional(),
  paddingX: z.enum(["none", "s", "m", "l"]).optional(),
  // paddingY gains an `xl` (6rem/96px) section-scale step for real vertical
  // rhythm (AIQ-7); paddingX/margins stay capped at `l`.
  paddingY: z.enum(["none", "s", "m", "l", "xl"]).optional(),
  background: z.enum(["none", "surface", "contrast", "accent", "muted"]).optional(),
  radius: z.enum(["none", "sm", "md", "lg", "pill"]).optional(),
  objectFit: z.enum(["cover", "contain"]).optional(),
  objectPosition: z.string().max(40).optional(),
  aspectRatioFree: z.string().max(24).optional(),
  aspectRatio: z.enum(["auto", "1:1", "4:3", "3:4", "16:9", "21:9"]).optional(),
  visibility: z.enum(["visible", "hidden"]).optional(),
  // Free-value escapes (mirror of BuilderNodeStyleValue). Length-capped so a
  // hand-crafted tree can't smuggle an oversized declaration; values land in
  // React inline styles, which the CSSOM validates (no injection surface).
  // fontFamily also accepts a `token:typography.*-font-family` binding.
  fontFamily: tokenAwareStyleString(160),
  // fontSize also accepts a `token:typography.*-size` type-scale binding.
  fontSize: tokenAwareStyleString(32),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.string().max(16).optional(),
  letterSpacing: z.string().max(16).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  // Advanced text controls — modern wrapping, whitespace, and line-clamp truncation.
  textWrap: z.enum(["wrap", "nowrap", "balance", "pretty"]).optional(),
  whiteSpace: z.enum(["normal", "nowrap", "pre", "pre-wrap", "pre-line"]).optional(),
  lineClamp: z.number().int().min(1).max(20).optional(),
  // max 64 (not 32) so a theme-token binding like
  // `var(--token-color-surface-raised, #ffffff)` (and rgba()/hsl() free values)
  // survives the schema instead of being silently stripped on save. These also
  // accept a `token:color.*` reference (Wave 3 · 3A) — bound to a Theme token.
  textColor: tokenAwareStyleString(64),
  backgroundColor: tokenAwareStyleString(64),
  borderColor: tokenAwareColorShorthand(BORDER_COLOR_MAX_CHARS),
  // 64, not 16: a per-side shorthand (`10px 8px 12px 4px`) is the normal way
  // to write an uneven border and the old cap rejected every realistic combo.
  borderWidth: z.string().max(64).optional(),
  // 1-4 CSS border-style keywords (TRBL). Existing solid/dashed/dotted keep
  // working as one-value shorthands; mixed sides store e.g. `dashed solid`.
  borderStyle: z
    .string()
    .max(BORDER_STYLE_MAX_CHARS)
    .refine(isBuilderBorderStyleShorthand, {
      message: "borderStyle must be 1-4 CSS border-style keywords (top right bottom left).",
    })
    .optional(),
  // Free border-radius escape — raw CSS (supports per-corner shorthand). Layers
  // after the radius token so an exact value wins. Also accepts a `token:radius.*`
  // binding → follows the theme's radius scale live.
  borderRadius: tokenAwareStyleString(64),
  // Free dimension escapes — exact width / height / min-height (length-capped).
  // Coexist with the maxWidth token above (max-width clamps the free width).
  width: z.string().max(16).optional(),
  height: z.string().max(16).optional(),
  minHeight: z.string().max(16).optional(),
  minWidth: z.string().max(16).optional(),
  maxWidthFree: z.string().max(16).optional(),
  maxHeight: z.string().max(16).optional(),
  // Free per-side padding escapes — layer after the paddingX/paddingY token.
  // Also accept a `token:space.*` binding → follow the theme's spacing rhythm.
  //
  // 64, not 16: a fluid value is the normal way to write section padding
  // (`clamp(48px, 6vw, 88px)` is 24 characters) and the old cap rejected every
  // one of them. Ten shipped presets route their section padding through
  // `customCss` for no reason except this cap. Raising a max is additive —
  // zod REJECTS an over-cap value rather than truncating it, so nothing that
  // ever persisted changes meaning.
  paddingTop: tokenAwareStyleString(64),
  paddingRight: tokenAwareStyleString(64),
  paddingBottom: tokenAwareStyleString(64),
  paddingLeft: tokenAwareStyleString(64),
  // Free per-side margin escapes (collision-safe *Free keys; the margin tokens
  // are enums). Layer after every margin token so the exact value wins. Also
  // accept a `token:space.*` binding.
  marginTopFree: tokenAwareStyleString(64),
  marginRightFree: tokenAwareStyleString(64),
  marginBottomFree: tokenAwareStyleString(64),
  marginLeftFree: tokenAwareStyleString(64),
  // Surface & depth escapes (length/string-capped; opacity normalized 0–1).
  // boxShadow also accepts a `token:shadow.*` binding → follows the theme shadow.
  boxShadow: tokenAwareStyleString(200),
  textShadow: z.string().max(200).optional(),
  backgroundImage: z.string().max(500).optional(),
  backgroundSize: z.string().max(40).optional(),
  backgroundPosition: z.string().max(40).optional(),
  backgroundRepeat: z
    .enum(["no-repeat", "repeat", "repeat-x", "repeat-y"])
    .optional(),
  // Gradient/clipped text — clip the background paint to the glyphs.
  backgroundClip: z.enum(["text"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  // Free gap escape — overrides the layout gap token via the --bn-gap variable.
  // Also accepts a `token:space.*` binding → follows the theme spacing rhythm.
  gap: tokenAwareStyleString(64),
  // Container-query registration — turns this node into a query container.
  containerType: z.enum(["normal", "inline-size", "size"]).optional(),
  containerName: z.string().max(80).optional(),
  // Positioning escapes — context + inset offsets (negatives allowed).
  position: z.enum(["relative", "absolute", "fixed", "sticky"]).optional(),
  top: z.string().max(16).optional(),
  right: z.string().max(16).optional(),
  bottom: z.string().max(16).optional(),
  left: z.string().max(16).optional(),
  // Wave 6B (#23) — sticky pinning convenience. stickyAnchor picks the edge to
  // pin to (top/bottom) and MAKES the node sticky; stickyOffset is the gap from
  // that edge (CSS length, short-capped). Back-compat: undefined → no emission;
  // an explicit position/top/bottom always wins over the convenience.
  stickyAnchor: z.enum(["top", "bottom"]).optional(),
  stickyOffset: z.string().max(16).optional(),
  // Stacking & clipping escapes — z-index (integer, negatives allowed) +
  // overflow control.
  zIndex: z.number().int().min(-999).max(999).optional(),
  overflow: z.enum(["visible", "hidden", "auto", "scroll"]).optional(),
  // Transform escapes — standalone rotate (angle) + scale (factor) +
  // translate (1-2 lengths) + transform-origin (pivot).
  rotate: z.string().max(16).optional(),
  scale: z.string().max(16).optional(),
  translate: z.string().max(24).optional(),
  transformOrigin: z.string().max(32).optional(),
  // First-class CSS transitions — longhands emit through renderer CSS vars so
  // breakpoint/hover changes ease instead of snapping. The legacy shorthand is
  // kept for existing snapshots and wins when present.
  transitionProperty: z.string().max(120).optional(),
  transitionDuration: z.string().max(24).optional(),
  transitionTimingFunction: z.string().max(80).optional(),
  transitionDelay: z.string().max(24).optional(),
  transition: z.string().max(120).optional(),
  // Flex/grid child placement — self-alignment + flex sizing inside a parent.
  alignSelf: z.enum(["auto", "start", "center", "end", "stretch"]).optional(),
  flexGrow: z.number().min(0).max(999).optional(),
  flexShrink: z.number().min(0).max(999).optional(),
  // 64 for the same reason as the padding escapes: a card basis is routinely
  // fluid (`clamp(260px,30vw,380px)` is 23 characters).
  flexBasis: z.string().max(64).optional(),
  // Grid child placement — grid-column / grid-row span/line specs.
  gridColumn: z.string().max(24).optional(),
  gridRow: z.string().max(24).optional(),
  // Flex/grid child order — CSS `order` (lower paints first; negatives pull a
  // child ahead of order:0 siblings). Capped to a sane integer band like zIndex.
  // Per-breakpoint reorder without touching the DOM. No-op outside flex/grid.
  order: z.number().int().min(-999).max(999).optional(),
  // Filter effects — CSS filter (self) + backdrop-filter (behind, glassmorphism).
  filter: z.string().max(120).optional(),
  backdropFilter: z.string().max(120).optional(),
  // Compositing — blend this node against the backdrop (overlays/duotone).
  mixBlendMode: z.enum(BUILDER_MIX_BLEND_MODES).optional(),
  // Flex/grid container layout — main-axis distribution + cross-axis alignment
  // of children, plus row-wrap control. Complements the structured layout/align.
  justifyContent: z
    .enum([
      "flex-start",
      "center",
      "flex-end",
      "space-between",
      "space-around",
      "space-evenly",
    ])
    .optional(),
  alignItems: z
    .enum(["flex-start", "center", "flex-end", "stretch", "baseline"])
    .optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  // Free grid-template tracks — raw CSS so asymmetric / auto-responsive grids work
  // ("2fr 1fr", "repeat(auto-fit, minmax(200px, 1fr))"). Capped at 120 to fit a
  // multi-track definition; gridAutoFlow is a small enum.
  gridTemplateColumns: z.string().max(120).optional(),
  gridTemplateRows: z.string().max(120).optional(),
  gridAutoFlow: z
    .enum(["row", "column", "row dense", "column dense"])
    .optional(),
  // Premium-2026 effect & interaction escapes. Raw-CSS fields length-capped;
  // the rest are small enums. Land in inline styles, validated by the CSSOM.
  clipPath: z.string().max(200).optional(),
  maskImage: z.string().max(300).optional(),
  textStroke: z.string().max(40).optional(),
  cursor: z
    .enum([
      "auto",
      "default",
      "pointer",
      "grab",
      "grabbing",
      "crosshair",
      "zoom-in",
      "zoom-out",
      "not-allowed",
      "text",
      "wait",
      "help",
      "move",
      "none",
    ])
    .optional(),
  userSelect: z.enum(["auto", "none", "text", "all"]).optional(),
  pointerEvents: z.enum(["auto", "none"]).optional(),
  scrollSnapType: z.string().max(40).optional(),
  scrollSnapAlign: z.enum(["none", "start", "center", "end"]).optional(),
  // Layered background system (Wave 3 · 3C). Each entry is one layer (gradient
  // / image / solid color). Max 8 layers; each value is length-capped to keep
  // CSS strings safe. The array is OPTIONAL + back-compat (undefined → no extra
  // emission, existing `backgroundImage` / `backgroundColor` unchanged).
  backgroundLayers: z
    .array(
      z
        .object({
          type: z.enum(["gradient", "image", "color"]),
          value: z.string().max(600),
        })
        .strict(),
    )
    .max(8)
    .optional(),
  // Per-layer blend mode — a single keyword or comma-separated list matching
  // the backgroundLayers count (CSS background-blend-mode). Length-capped.
  backgroundBlendMode: z.string().max(120).optional(),
  // Focus / form theming. accentColor / caretColor also accept a `token:color.*`
  // binding (Wave 3 · 3A).
  outline: z.string().max(60).optional(),
  outlineOffset: z.string().max(16).optional(),
  accentColor: tokenAwareStyleString(64),
  caretColor: tokenAwareStyleString(64),
  // Entrance animation — preset maps to a baked @keyframe; duration/delay are
  // CSS time strings (short-capped).
  // The vocabulary is NOT inlined here: it comes from `./animation-presets`, the
  // one list the TS type, the renderer keyframes and the inspector's Animation
  // gallery all derive from. Adding a preset means adding it there (plus its
  // keyframe) -- there is no way to widen this enum without widening the
  // gallery, which is what `animation-preset-parity.static.test.ts` proves.
  animationPreset: z.enum(BUILDER_ANIMATION_PRESETS).optional(),
  animationDuration: z.string().max(16).optional(),
  animationDelay: z.string().max(16).optional(),
  // Travel distance for the directional presets, published as
  // `--bn-anim-distance`. Short-capped like the other CSS-length style keys.
  animationDistance: z.string().max(16).optional(),
  // Scroll-trigger replay policy. `once` = IntersectionObserver reveal (plays
  // the first time it scrolls in); `every` = scroll-linked `view()` timeline.
  animationRepeat: z.enum(BUILDER_ANIMATION_REPEATS).optional(),
  animationTrigger: z.enum(BUILDER_ANIMATION_TRIGGERS).optional(),
  animationEasing: z
    .enum(["ease", "linear", "ease-in", "ease-out", "ease-in-out", "back", "smooth"])
    .optional(),
  // Wave 6B (#27) — interaction timeline. A free easing curve (cubic-bezier /
  // steps / linear()) that wins over animationEasing; a named scroll parallax
  // intensity. Both optional + back-compat (undefined → no change in render).
  animationEasingCustom: z.string().max(64).optional(),
  parallax: z.enum(["none", "subtle", "medium", "strong"]).optional(),
  // Reveal-on-view (2026-06-04) — IntersectionObserver-driven entry interaction.
  // Direction + travel distance + duration/delay + named easing. All optional +
  // back-compat. revealDistance/Duration/Delay are short-capped CSS strings.
  revealOnView: z
    .enum(["none", "fade", "fade-up", "fade-down", "fade-left", "fade-right", "zoom"])
    .optional(),
  revealDistance: z.string().max(16).optional(),
  revealDuration: z.string().max(16).optional(),
  revealDelay: z.string().max(16).optional(),
  revealEasing: z
    .enum(["ease", "linear", "ease-in", "ease-out", "ease-in-out", "back", "smooth"])
    .optional(),
});

// Hover-state overrides — animatable props re-applied while hovered/focused.
// Desktop: style.hover. Tablet/mobile: style.responsive.{tier}.hover.
const builderNodeHoverStyleSchema = z.object({
  // Hover colors also accept a `token:color.*` binding (Wave 3 · 3A).
  backgroundColor: tokenAwareStyleString(80),
  color: tokenAwareStyleString(80),
  borderColor: tokenAwareStyleString(80),
  // boxShadow also accepts a `token:shadow.*` binding (Wave 3 · 3A-extended).
  boxShadow: tokenAwareStyleString(200),
  scale: z.string().max(16).optional(),
  translate: z.string().max(24).optional(),
  opacity: z.number().min(0).max(1).optional(),
  filter: z.string().max(120).optional(),
  backdropFilter: z.string().max(120).optional(),
  parentHover: z.boolean().optional(),
});

const builderNodeViewportStyleSchema = builderNodeStyleValueSchema.extend({
  hover: builderNodeHoverStyleSchema.optional(),
});

const builderNodeStyleSchema = builderNodeStyleValueSchema
  .extend({
    // Built-in `tablet`/`mobile` plus any operator-defined custom tier id.
    responsive: z.record(z.string(), builderNodeViewportStyleSchema).optional(),
    containerQueries: z
      .object({
        tablet: builderNodeViewportStyleSchema.optional(),
        mobile: builderNodeViewportStyleSchema.optional(),
      })
      .optional(),
    hover: builderNodeHoverStyleSchema.optional(),
    // UNIVERSAL STATE STYLES (Wave 3 · 3D) — focus-visible + active overrides.
    // Reuses the hover-style schema (same curated subset). Optional + back-compat.
    stateStyles: z
      .object({
        focus: builderNodeHoverStyleSchema.optional(),
        active: builderNodeHoverStyleSchema.optional(),
      })
      .optional(),
    // Linked style class reference (Wave 3 · 3B) — a page-scoped class id
    // (slug). Optional + back-compat; the renderer merges the class style as
    // the base with this node's own props on top. Length-capped to the id
    // normalizer's 48-char ceiling (styleClassIdFromName).
    classRef: z.string().min(1).max(48).optional(),
    // Per-node custom CSS escape hatch (2026-06-09). Free author CSS rendered as
    // a scope-confined <style> keyed to `[data-builder-node-id]` via the hardened
    // `nodeScopedCss` scoper — a stray `}` can't break the scope. Base-style only
    // (not per-viewport). Capped at 8000 chars (a generous block; sections' field
    // is uncapped at the schema, but bounding the node escape keeps payloads sane).
    // Optional + back-compat: absent → renderer emits nothing → byte-identical.
    customCss: z.string().max(8000).optional(),
  })
  .optional();

const layerLabelSchema = z.string().max(80).optional();

const accordionPropsSchema = z.object({
  allowMultiple: z.boolean().optional(),
  defaultOpenItemIds: z.array(z.string().min(1)).max(30).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const accordionItemPropsSchema = z.object({
  title: z.string().min(1).max(180),
  style: builderNodeStyleSchema,
});

const tabsPropsSchema = z.object({
  defaultTabId: z.string().min(1).optional(),
  style: builderNodeStyleSchema,
});

const tabPanelPropsSchema = z.object({
  title: z.string().min(1).max(180),
  style: builderNodeStyleSchema,
});

const carouselSlidesPerViewSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
  .optional();

/**
 * Per-breakpoint carousel overrides. Declared here (not just in `types.ts`) so
 * `validateBuilderNodeTree`'s Zod parse does NOT strip the bucket on snapshot
 * read — the exact trap `containerResponsiveSchema` documents, where `display`
 * / `itemsPerView` silently vanished from the published render while `columns`
 * survived.
 */
const carouselResponsiveSchema = z.object({
  slidesPerView: carouselSlidesPerViewSchema,
});

const carouselPropsSchema = z.object({
  variant: z.enum(["rail", "hero"]).optional(),
  slidesPerView: carouselSlidesPerViewSchema,
  // Optional + every key inside optional: an absent bucket renders exactly as
  // it did before per-device slides existed. See carousel-slides-per-view.ts.
  responsive: z
    .object({
      tablet: carouselResponsiveSchema.optional(),
      mobile: carouselResponsiveSchema.optional(),
    })
    .optional(),
  autoplayMs: z.number().int().min(1000).max(30000).optional(),
  loop: z.boolean().optional(),
  showArrows: z.boolean().optional(),
  showDots: z.boolean().optional(),
  layerLabel: layerLabelSchema,
  // ── hero-variant levers ────────────────────────────────────────────────
  heightMode: z.enum(["viewport", "large", "medium", "fixed"]).optional(),
  minHeightPx: z.number().int().min(120).max(2000).optional(),
  overlay: z
    .object({
      scrim: z.boolean().optional(),
      tone: z.enum(["dark", "light"]).optional(),
      vignette: z.boolean().optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
  grain: z.boolean().optional(),
  transition: z.enum(["crossfade", "slide"]).optional(),
  transitionMs: z.number().int().min(150).max(4000).optional(),
  kenBurns: z.boolean().optional(),
  kenBurnsAmount: z.number().min(0).max(0.4).optional(),
  pauseOnHover: z.boolean().optional(),
  controls: z
    .object({
      dots: z.boolean().optional(),
      arrows: z.boolean().optional(),
      progress: z.boolean().optional(),
      counter: z.boolean().optional(),
      scrollCue: z.boolean().optional(),
    })
    .optional(),
  contentAlign: z
    .enum(["tl", "tc", "tr", "cl", "cc", "cr", "bl", "bc", "br"])
    .optional(),
  contentMode: z.enum(["per-slide", "shared"]).optional(),
  sharedContent: z
    .object({
      eyebrow: z.string().max(160).optional(),
      headingLead: z.string().max(240).optional(),
      headingAccent: z.string().max(120).optional(),
      sub: z.string().max(400).optional(),
      primaryCta: z
        .object({
          label: z.string().max(80).optional(),
          href: z.string().max(2048).optional(),
        })
        .optional(),
      secondaryCta: z
        .object({
          label: z.string().max(80).optional(),
          href: z.string().max(2048).optional(),
        })
        .optional(),
    })
    .optional(),
  style: builderNodeStyleSchema,
});

const masonryPropsSchema = z.object({
  columns: z
    .union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const containerResponsiveSchema = z.object({
  layout: z.enum(["stack", "row", "grid"]).optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
  columns: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  // Per-breakpoint grid-vs-slider override. Declared here so the Zod parse in
  // `validateBuilderNodeTree` does NOT strip them on snapshot read — without
  // these keys the snapshot render path silently dropped `display`/`itemsPerView`
  // (the slider on mobile never rendered) while `columns` survived.
  display: z.enum(["grid", "slider"]).optional(),
  itemsPerView: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ])
    .optional(),
});

const containerPropsSchema = z
  .object({
    layout: z.enum(["stack", "row", "grid"]),
    gap: z.enum(["s", "m", "l"]).optional(),
    layerLabel: layerLabelSchema,
    columns: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    // Desktop-base grid-vs-slider presentation. Declared here so the Zod parse
    // in `validateBuilderNodeTree` does NOT strip them on snapshot read (mirrors
    // how `columns` survives); the renderer reads `node.props.itemsPerView` and
    // `node.props.display` directly.
    display: z.enum(["grid", "slider"]).optional(),
    itemsPerView: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ])
      .optional(),
    responsive: z
      .object({
        tablet: containerResponsiveSchema.optional(),
        mobile: containerResponsiveSchema.optional(),
      })
      .optional(),
    dataBinding: dataBindingPropsSchema.optional(),
    // Moving background (uploaded video or a YouTube URL) painted BEHIND this
    // container's children, with an author-controlled scrim so text stays
    // readable. Optional + back-compat: undefined emits no wrapper, no data
    // attribute and no extra CSS hook, so existing trees render byte-identical.
    // The whole contract (parsing, the nocookie rebuild, poster derivation,
    // overlay normalization) lives in `background-media.ts`.
    backgroundMedia: backgroundMediaSchema.optional(),
    style: builderNodeStyleSchema,
    instanceOf: z.string().max(120).optional(),
    instanceOverrides: z
      .record(
        z.string().max(200),
        z
          .object({
            text: z.string().max(2000).optional(),
            imageSrc: z.string().max(2000).optional(),
            imageAlt: z.string().max(500).optional(),
            href: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    const baseLayout = value.layout;
    const baseColumns = value.columns;
    const tablet = value.responsive?.tablet;
    const mobile = value.responsive?.mobile;

    if (baseLayout !== "grid" && typeof baseColumns === "number" && baseColumns > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["columns"],
        message:
          'columns > 1 is only valid when layout is "grid".',
      });
    }

    const checkResponsive = (
      key: "tablet" | "mobile",
      bucket: z.infer<typeof containerResponsiveSchema> | undefined,
    ) => {
      if (!bucket) return;
      const effectiveLayout = bucket.layout ?? baseLayout;
      if (effectiveLayout !== "grid" && typeof bucket.columns === "number" && bucket.columns > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["responsive", key, "columns"],
          message:
            'columns > 1 is only valid when effective layout is "grid".',
        });
      }
      if (effectiveLayout === "stack" && typeof bucket.columns === "number" && bucket.columns !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["responsive", key, "columns"],
          message: 'stack layout must use exactly 1 column.',
        });
      }
    };

    checkResponsive("tablet", tablet);
    checkResponsive("mobile", mobile);

    if (mobile?.columns != null && tablet?.columns == null && baseColumns == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsive", "mobile", "columns"],
        message:
          "mobile columns override requires base or tablet columns to preserve cascade intent.",
      });
    }
  });

const splitPropsSchema = z.object({
  ratio: z.enum(["50-50", "40-60", "60-40", "30-70", "70-30"]).optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
  collapseOnMobile: z.boolean().optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const headingPropsSchema = z.object({
  text: z.string().min(1).max(240),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  href: z.string().max(500).optional(),
  layerLabel: layerLabelSchema,
  fieldBindings: fieldBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

const paragraphPropsSchema = z.object({
  text: z.string().min(1).max(5000),
  href: z.string().max(500).optional(),
  layerLabel: layerLabelSchema,
  fieldBindings: fieldBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

const buttonPropsSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1).max(500),
  layerLabel: layerLabelSchema,
  tone: z.enum(["primary", "secondary"]).optional(),
  /**
   * Icons on a button. The gallery has advertised an "Icon button" variant for
   * a while; it inserted a literal "♥ Save" text label, because the node had
   * no icon slot at all.
   */
  leadingIcon: z.enum(BUILDER_ICON_NAMES).optional(),
  trailingIcon: z.enum(BUILDER_ICON_NAMES).optional(),
  /** Hide the label visually; it stays as the accessible name. */
  iconOnly: z.boolean().optional(),
  fieldBindings: fieldBindingPropsSchema.optional(),
  stateStyles: z
    .object({
      hover: z.object({ tone: z.enum(["primary", "secondary"]).optional() }).optional(),
      focus: z.object({ tone: z.enum(["primary", "secondary"]).optional() }).optional(),
      active: z.object({ tone: z.enum(["primary", "secondary"]).optional() }).optional(),
      disabled: z.object({ tone: z.enum(["primary", "secondary"]).optional() }).optional(),
    })
    .optional(),
  style: builderNodeStyleSchema,
});

/** One art-direction rendition. Same caps as the base `src` / `mediaId`. */
const imageDeviceSourceSchema = z.object({
  src: z.string().max(2048),
  mediaId: pgUuidSchema().optional(),
});

const imagePropsSchema = z.object({
  src: z.string().max(2048),
  mediaId: pgUuidSchema().optional(),
  // Art direction — a different FILE at tablet / phone. Keyed by the two
  // render-backed override tiers, so the keys match `style.responsive`.
  sources: z
    .object({
      tablet: imageDeviceSourceSchema.optional(),
      mobile: imageDeviceSourceSchema.optional(),
    })
    .optional(),
  alt: z.string().max(240).optional(),
  // Above-the-fold hint — eager-load + fetchpriority=high (LCP hero image).
  priority: z.boolean().optional(),
  // Whole-image link (the shell logo → home). Same cap as a button href.
  href: z.string().max(500).optional(),
  layerLabel: layerLabelSchema,
  fieldBindings: fieldBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

const videoPropsSchema = z.object({
  // D3 fix: was `z.string().url().max(2048)`. `.url()` rejected "" (an
  // empty-but-valid "cleared" state — mirrors imagePropsSchema's `src`,
  // which has always been a plain string), which made the video node's
  // "Clear" affordance impossible to save even after the dead-guard bug in
  // builder-node-content.tsx was fixed. `.url()` was not doing real
  // security work here either — `new URL()` happily accepts a
  // `javascript:` scheme, so this never was an XSS control.
  src: z.string().max(2048),
  poster: z.string().url().max(2048).optional(),
  autoplay: z.boolean().optional(),
  muted: z.boolean().optional(),
  loop: z.boolean().optional(),
  controls: z.boolean().optional(),
  style: builderNodeStyleSchema,
});

// Embed iframes are gated to the same hosts as the CSP frame-src allowlist
// (next.config.ts builderEmbedCsp + googleMapsCsp). Validating here is
// defense-in-depth: the iframe DOM is never emitted for an off-allowlist origin,
// so a mismatched provider/src (e.g. provider:"youtube" + src:"https://attacker.com")
// is rejected at authoring time instead of relying solely on the browser CSP.
const ALLOWED_EMBED_HOST_SUFFIXES = [
  "youtube.com",
  "youtube-nocookie.com",
  "vimeo.com",
  "calendly.com",
  "google.com",
] as const;

function isAllowedEmbedSrc(value: string): boolean {
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED_EMBED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

const embedPropsSchema = z.object({
  src: z
    .string()
    .url()
    .max(2048)
    .refine((value) => value.startsWith("https://"), {
      message: "Embed URLs must use https://.",
    })
    .refine(isAllowedEmbedSrc, {
      message:
        "Embed host must be YouTube, Vimeo, Calendly, or Google Maps (the allowed embed providers).",
    }),
  title: z.string().max(160).optional(),
  provider: z.enum(["youtube", "vimeo", "maps", "calendly", "url"]).optional(),
  allowFullScreen: z.boolean().optional(),
  style: builderNodeStyleSchema,
});

/**
 * A social post is addressed by its CANONICAL url, which the inspector derives
 * via parseSocialPostUrl (allow-listed host + strict id). Storing the canonical
 * form — not the operator's raw paste — keeps tracking params and lookalike
 * hosts out of published markup even if a future caller skips the parser.
 */
const socialPostPropsSchema = z.object({
  provider: z.enum(SOCIAL_POST_PROVIDERS),
  // Empty is VALID and is the seeded state: a freshly inserted block has no URL
  // yet (seeding a placeholder post would put someone else's content on the
  // page). Requiring a valid URL here made every insert fail validation and get
  // dropped silently — the block could never be added at all. Non-empty values
  // must still parse to an allow-listed post.
  url: z
    .string()
    .max(2048)
    .refine((value) => value === "" || parseSocialPostUrl(value) !== null, {
      message:
        "Paste a full Instagram post/reel URL or a TikTok video URL (profile and story links cannot be embedded).",
    }),
  /** Optional operator caption shown above the embed. */
  caption: z.string().max(280).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const HTTPS_URL = z
  .string()
  .max(2048)
  .refine((v) => v.startsWith("https://"), {
    message: "Media and link URLs must use https://.",
  });

const socialFeedItemSchema = z.object({
  id: z.string().min(1).max(64),
  mediaUrl: HTTPS_URL,
  mediaType: z.enum(["image", "video"]).optional(),
  posterUrl: HTTPS_URL.optional(),
  permalink: HTTPS_URL.optional(),
  caption: z.string().max(500).optional(),
});

/**
 * Deliberately shaped like the Instagram/TikTok API payloads (media url,
 * media type, permalink, caption) so the OAuth-connected source (Phase 3 of
 * the social plan) is a data-source swap, not a schema migration. Items are
 * capped at 48 — a storefront section, not an archive.
 */
const socialFeedPropsSchema = z.object({
  source: z.enum(["manual", "connected"]).optional(),
  layout: z.enum(["grid", "masonry", "slider", "stories"]).optional(),
  provider: z.enum(["instagram", "tiktok", "mixed"]).optional(),
  handle: z.string().max(64).optional(),
  columns: z.number().int().min(2).max(6).optional(),
  initialCount: z.number().int().min(2).max(48).optional(),
  gap: z.enum(["none", "sm", "md", "lg"]).optional(),
  aspect: z.enum(["square", "portrait", "video", "auto"]).optional(),
  hover: z.enum(["none", "zoom", "caption", "zoom-caption"]).optional(),
  lightbox: z.boolean().optional(),
  loadMore: z.enum(["button", "auto", "none"]).optional(),
  autoplayVideos: z.boolean().optional(),
  // Empty is valid and is the seeded state (see social_post: requiring content
  // at insert time silently breaks insertion).
  items: z.array(socialFeedItemSchema).max(48),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

/**
 * WS7 Phase 0 — NATIVE `hero_search`. Field-for-field the authoring surface of
 * the frozen `hero_search` curated section (schema.ts there), flattened into
 * builder-node prop shape: no `presentation` / `nodePresentation` blocks (the
 * builder's own style system owns those) and no LinkRef objects (builder nodes
 * carry plain hrefs, prefixed at render).
 */
const heroSearchPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  highlight: z.string().max(120).optional(),
  subheadline: z.string().max(320).optional(),
  searchEnabled: z.boolean().optional(),
  searchPlaceholder: z.string().max(120).optional(),
  searchActionHref: z.string().max(500).optional(),
  searchSubmitLabel: z.string().max(40).optional(),
  primaryCtaLabel: z.string().max(60).optional(),
  primaryCtaHref: z.string().max(500).optional(),
  secondaryCtaLabel: z.string().max(60).optional(),
  secondaryCtaHref: z.string().max(500).optional(),
  chips: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        href: z.string().max(500).optional(),
      }),
    )
    .max(12)
    .optional(),
  statSource: z.enum(["manual", "tenant_talent_count"]).optional(),
  statItems: z
    .array(
      z.object({
        value: z.string().min(1).max(24),
        label: z.string().min(1).max(60),
      }),
    )
    .max(4)
    .optional(),
  statCountLabel: z.string().max(80).optional(),
  layout: z.enum(["centered", "split", "minimal", "editorial"]).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const menuBoardPropsSchema = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(240).optional(),
  emptyMessage: z.string().max(240).optional(),
  /**
   * Show a category strip above the board that jumps to each group.
   *
   * A 117-dish menu across 13 categories is unusable on a phone without one —
   * the operator's own categories become the navigation. Opt-in rather than
   * automatic: a short board is better without a strip, and turning it on for
   * everyone would put a one-tab nav above a five-line menu.
   *
   * The strip renders only when the board actually has something to navigate
   * (two or more categories). A menu whose items all carry `category: null` —
   * the common case today — shows no strip at all rather than an empty one.
   */
  categoryNav: z.boolean().optional(),
  style: builderNodeStyleSchema,
});

/**
 * RESERVATIONS — `reserve_table`. Props ONLY: the island dynamically imports
 * its own server action and loads availability client-side, so there is no data
 * loader and deliberately no `native-data-block-needs` entry.
 *
 * `tenantId` is NOT a prop. The renderer injects it from
 * `options.dataSources.tenantId`, the same way `menu_board` does — an operator
 * cannot type a tenant id and must never be asked to.
 *
 * `partyMin`/`partyMax` are DISPLAY BOUNDS, not a gate: the server re-derives
 * both from `venue_service_rules` and refuses anything outside them. The caps
 * here only stop the stepper offering obvious nonsense. `cardNotice` is
 * nullable rather than optional because "no notice" is a real, chosen state
 * distinct from "not configured".
 */
const reserveTablePropsSchema = z.object({
  venueName: z.string().max(120).optional(),
  ctaVerb: z.string().max(40).optional(),
  partyMin: z.number().int().min(1).max(99).optional(),
  partyMax: z.number().int().min(1).max(99).optional(),
  cardNotice: z.string().max(240).nullable().optional(),
  notesEnabled: z.boolean().optional(),
  style: builderNodeStyleSchema,
});

const sessionPickerPropsSchema = z.object({
  offeringId: z.string().max(200),
  title: z.string().max(120).optional(),
  style: builderNodeStyleSchema,
});

const qrCodePropsSchema = z.object({
  linkCode: z.string().max(200),
  foreground: z.string().max(9).optional(),
  cornerStyle: z.enum(["square", "rounded"]).optional(),
  caption: z.string().max(240).optional(),
  showShortLink: z.boolean().optional(),
  style: builderNodeStyleSchema,
});

/**
 * WS7 Phase 0 — NATIVE `talent_type_grid`. Same relationship to the frozen
 * curated `talent_type_grid` schema: the authoring fields survive, the section
 * presentation envelope does not. `items` is OPTIONAL and may be empty — a
 * dynamic-mode block carries no authored cards at all, and requiring content at
 * insert time silently breaks insertion (see the socialFeed note above).
 */
const talentTypeGridPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(320).optional(),
  mode: z.enum(["manual", "dynamic"]).optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        description: z.string().max(200).optional(),
        imageUrl: z.string().max(2048).optional(),
        imageAlt: z.string().max(200).optional(),
        imagePosition: z.string().max(40).optional(),
        taxonomyTermId: z.string().max(64).optional(),
        href: z.string().max(500).optional(),
        featured: z.boolean().optional(),
      }),
    )
    .max(18)
    .optional(),
  selectedTermIds: z.array(z.string().min(1).max(64)).max(40).optional(),
  parentCategoryMode: z.boolean().optional(),
  maxItems: z.number().int().min(1).max(18).optional(),
  columns: z.number().int().min(1).max(6).optional(),
  showCount: z.boolean().optional(),
  showImages: z.boolean().optional(),
  showDescriptions: z.boolean().optional(),
  cardRatio: z.enum(["1/1", "3/4", "4/3", "16/9"]).optional(),
  textPosition: z.enum(["overlay-bottom", "below"]).optional(),
  seeAllLabel: z.string().max(40).optional(),
  seeAllHref: z.string().max(500).optional(),
  emptyStateText: z.string().max(240).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

/* ────────────────────────────────────────────────────────────────────────────
 * BUILDER 2027 · P2A — prop schemas for the twelve native kinds.
 *
 * Every field is OPTIONAL, including the item arrays. A schema that requires
 * content at insert time silently breaks insertion (see the socialFeed note
 * above), and several of these blocks legitimately carry no authored content at
 * all — a dynamic directory, a roster-sourced map, a reveal wrapper.
 * ──────────────────────────────────────────────────────────────────────────── */

const marqueePropsSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().min(1).max(140),
        href: z.string().max(500).optional(),
      }),
    )
    .max(40)
    .optional(),
  speed: z.enum(["slow", "medium", "fast"]).optional(),
  direction: z.enum(["left", "right"]).optional(),
  separator: z.enum(["dot", "slash", "diamond", "none"]).optional(),
  variant: z.enum(["text", "tags"]).optional(),
  pauseOnHover: z.boolean().optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

/** Profile-code / key list shared by the directory + featured-talent scopes. */
const shortKeyListSchema = (max: number) =>
  z.array(z.string().min(1).max(80)).max(max).optional();

const directoryPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(400).optional(),
  headerAlign: z.enum(["center", "left", "split"]).optional(),
  showHeading: z.boolean().optional(),
  entityLabel: z
    .enum(["talent", "people", "members", "professionals", "providers", "team"])
    .optional(),
  scope: z.enum(["all", "by_talent_type", "by_tag", "manual"]).optional(),
  talentTypeKeys: shortKeyListSchema(40),
  tagKeys: shortKeyListSchema(40),
  manualProfileCodes: shortKeyListSchema(200),
  pinnedProfileCodes: shortKeyListSchema(50),
  excludedProfileCodes: shortKeyListSchema(200),
  requirePhoto: z.boolean().optional(),
  excludeUnavailable: z.boolean().optional(),
  minTrustTier: z
    .enum(["any", "basic", "verified", "silver", "gold"])
    .optional(),
  defaultSort: z
    .enum(["recommended", "newest", "az", "availability", "curated"])
    .optional(),
  pagination: z.enum(["load_more", "infinite", "paged"]).optional(),
  pageSize: z.number().int().min(6).max(60).optional(),
  columnsDesktop: z.number().int().min(1).max(6).optional(),
  columnsTablet: z.number().int().min(1).max(4).optional(),
  columnsMobile: z.number().int().min(1).max(2).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  containerWidth: z.enum(["boxed", "full"]).optional(),
  cardStyle: z
    .enum([
      "portrait",
      "editorial",
      "portfolio",
      "profile",
      "stat",
      "service",
      "minimal",
    ])
    .optional(),
  cardAspect: z.enum(["4:5", "1:1", "3:4", "16:9"]).optional(),
  showName: z.boolean().optional(),
  showTalentType: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  showAvailability: z.boolean().optional(),
  showBadges: z.boolean().optional(),
  showSave: z.boolean().optional(),
  showAddToInquiry: z.boolean().optional(),
  showQuickView: z.boolean().optional(),
  cardClickAction: z.enum(["modal", "page"]).optional(),
  filterSearchBox: z.boolean().optional(),
  filterPlaceholder: z.string().max(160).optional(),
  filterSubmitLabel: z.string().max(40).optional(),
  searchActionHref: z.string().max(500).optional(),
  topBarMode: z.enum(["none", "talent_type", "field"]).optional(),
  sortControlShow: z.boolean().optional(),
  showResultCount: z.boolean().optional(),
  sidebarShow: z.boolean().optional(),
  sidebarPosition: z.enum(["left", "right"]).optional(),
  emptyStateTitle: z.string().max(120).optional(),
  emptyStateText: z.string().max(240).optional(),
  emptyStateCtaLabel: z.string().max(60).optional(),
  emptyStateCtaHref: z.string().max(500).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const featuredTalentPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  copy: z.string().max(400).optional(),
  sourceMode: z
    .enum([
      "manual_pick",
      "auto_featured_flag",
      "auto_by_service",
      "auto_by_destination",
      "auto_recent",
    ])
    .optional(),
  manualProfileCodes: shortKeyListSchema(15),
  filterServiceSlug: z.string().max(120).optional(),
  filterDestinationSlug: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(15).optional(),
  columnsDesktop: z.number().int().min(2).max(4).optional(),
  variant: z.enum(["grid", "carousel"]).optional(),
  headerAlign: z.enum(["split", "left", "center"]).optional(),
  cardVariant: z
    .enum(["editorial", "compact", "minimal", "profile"])
    .optional(),
  showName: z.boolean().optional(),
  showPrimaryType: z.boolean().optional(),
  showSecondaryType: z.boolean().optional(),
  showCity: z.boolean().optional(),
  showLanguages: z.boolean().optional(),
  showAvailability: z.boolean().optional(),
  showBadge: z.boolean().optional(),
  parentCategoryDisplay: z.boolean().optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(500).optional(),
  footerCtaLabel: z.string().max(60).optional(),
  footerCtaHref: z.string().max(500).optional(),
  emptyStateText: z.string().max(240).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

/**
 * `mapEmbedUrl` keeps the frozen `map_overlay` allow-list: an embed URL is
 * dropped into an iframe, so the host set is the security boundary and a
 * hostname typo must fail at authoring time rather than render an arbitrary
 * third-party frame on a tenant page.
 */
const MAP_EMBED_HOSTS = [
  "www.google.com",
  "maps.google.com",
  "www.bing.com",
] as const;

function isAllowedMapEmbedUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    return (
      (MAP_EMBED_HOSTS as ReadonlyArray<string>).includes(u.hostname) ||
      u.hostname.endsWith(".google.com") ||
      u.hostname.endsWith(".openstreetmap.org")
    );
  } catch {
    return false;
  }
}

const locationMapPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  subheadline: z.string().max(320).optional(),
  source: z.enum(["manual", "roster_cities"]).optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        region: z.string().max(80).optional(),
        href: z.string().max(500).optional(),
        count: z.number().int().min(0).max(100000).optional(),
        featured: z.boolean().optional(),
        status: z.enum(["active", "coming_soon"]).optional(),
      }),
    )
    .max(24)
    .optional(),
  maxItems: z.number().int().min(1).max(24).optional(),
  showCount: z.boolean().optional(),
  showMap: z.boolean().optional(),
  mapStyle: z.enum(["editorial", "embed"]).optional(),
  mapEmbedUrl: z
    .string()
    .max(2048)
    .refine(
      (v) => v.length === 0 || isAllowedMapEmbedUrl(v),
      "URL must be a Google Maps / OpenStreetMap embed",
    )
    .optional(),
  overlayTitle: z.string().max(160).optional(),
  overlayBody: z.string().max(800).optional(),
  overlayAddress: z.string().max(280).optional(),
  overlayHours: z.string().max(280).optional(),
  overlaySide: z.enum(["card-left", "card-right", "card-bottom"]).optional(),
  ratio: z.enum(["16/9", "4/3", "1/1", "21/9"]).optional(),
  layout: z.enum(["grid", "list", "compact"]).optional(),
  ctaLabel: z.string().max(40).optional(),
  ctaHref: z.string().max(500).optional(),
  emptyStateText: z.string().max(240).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

/** The shared authoring surface of the four native shell widgets. */
const headerWidgetBaseShape = {
  label: z.string().max(80).optional(),
  showLabel: z.boolean().optional(),
  icon: z.enum(BUILDER_ICON_NAMES).optional(),
  href: z.string().max(500).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
};

const headerSearchPropsSchema = z.object({
  ...headerWidgetBaseShape,
  inlineField: z.boolean().optional(),
  placeholder: z.string().max(120).optional(),
});

const headerAccountPropsSchema = z.object({
  ...headerWidgetBaseShape,
  signedOutLabel: z.string().max(60).optional(),
  signedInLabel: z.string().max(60).optional(),
});

const headerInquiryPropsSchema = z.object({
  ...headerWidgetBaseShape,
  showCount: z.boolean().optional(),
});

const headerLanguagePropsSchema = z.object({
  ...headerWidgetBaseShape,
  display: z.enum(["code", "name"]).optional(),
  separator: z.string().max(4).optional(),
});

const stickyScrollPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  imageUrl: z.string().max(2048).optional(),
  imageAlt: z.string().max(200).optional(),
  blocks: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        body: z.string().max(800).optional(),
      }),
    )
    .max(8)
    .optional(),
  side: z.enum(["media-left", "media-right"]).optional(),
  variant: z.enum(["bordered", "minimal"]).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const revealPropsSchema = z.object({
  effect: z
    .enum(["fade", "rise", "scale", "blur", "mask-up", "none"])
    .optional(),
  direction: z.enum(["up", "down", "left", "right"]).optional(),
  distance: z.number().int().min(0).max(400).optional(),
  durationMs: z.number().int().min(0).max(4000).optional(),
  delayMs: z.number().int().min(0).max(4000).optional(),
  staggerMs: z.number().int().min(0).max(1000).optional(),
  threshold: z.number().min(0).max(1).optional(),
  once: z.boolean().optional(),
  easing: z.enum(["linear", "ease", "ease-out", "ease-in-out"]).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const statsPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  items: z
    .array(
      z.object({
        value: z.string().min(1).max(20),
        label: z.string().min(1).max(80),
        caption: z.string().max(140).optional(),
        prefix: z.string().max(8).optional(),
        suffix: z.string().max(8).optional(),
      }),
    )
    .max(6)
    .optional(),
  variant: z.enum(["row", "grid", "split"]).optional(),
  align: z.enum(["start", "center"]).optional(),
  columns: z.number().int().min(1).max(6).optional(),
  animate: z.boolean().optional(),
  durationMs: z.number().int().min(0).max(6000).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const beforeAfterPropsSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  beforeUrl: z.string().max(2048).optional(),
  afterUrl: z.string().max(2048).optional(),
  beforeAlt: z.string().max(200).optional(),
  afterAlt: z.string().max(200).optional(),
  beforeLabel: z.string().max(40).optional(),
  afterLabel: z.string().max(40).optional(),
  initialPosition: z.number().int().min(0).max(100).optional(),
  ratio: z.enum(["16/9", "4/3", "1/1", "5/4"]).optional(),
  orientation: z.enum(["horizontal", "vertical"]).optional(),
  sliderLabel: z.string().max(80).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const iconPropsSchema = z.object({
  icon: z.enum(BUILDER_ICON_NAMES),
  label: z.string().max(160).optional(),
  layerLabel: layerLabelSchema,
  decorative: z.boolean().optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
  // Inspector Reset P3 (D9 item 2, "preset = shortcut, never a ceiling"): an
  // exact pixel/rem size the operator typed or dragged, taking precedence over
  // `size` in the renderer when present. Mirrors the "Free" companion-field
  // convention already used by `builderNodeStyleSchema` (e.g. `marginTopFree`).
  sizeFree: z.string().max(24).optional(),
  style: builderNodeStyleSchema,
});

const pricingTablePropsSchema = z.object({
  tiers: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(120), description: z.string().max(500).optional(), price: z.string().min(1).max(80), period: z.string().max(80).optional(), ctaLabel: z.string().max(80).optional(), ctaHref: z.string().max(500).optional(), highlighted: z.boolean().optional(), features: z.array(z.object({ label: z.string().min(1).max(240), included: z.boolean().optional() })).max(20).optional() })).min(2).max(4),
  style: builderNodeStyleSchema,
});
const richTextPropsSchema = z.object({ text: z.string().min(1).max(10000), href: z.string().max(500).optional(), fieldBindings: fieldBindingPropsSchema.optional(), style: builderNodeStyleSchema });
const codePropsSchema = z.object({ html: z.string().max(20000), minHeight: z.number().int().min(40).max(5000).optional(), style: builderNodeStyleSchema }); // safety = opaque-origin sandbox in render.tsx, not markup validation

const spacerPropsSchema = z.object({
  size: z.enum(["s", "m", "l"]),
  // Inspector Reset P3 (D9 item 2): exact height override, same "Free"
  // companion-field convention as `iconPropsSchema.sizeFree`. `size` stays
  // required (a fallback preset is always on record) and is simply ignored by
  // the renderer while `sizeFree` is set.
  sizeFree: z.string().max(24).optional(),
  style: builderNodeStyleSchema,
});

const dividerPropsSchema = z.object({
  tone: z.enum(["default", "muted"]).optional(),
  style: builderNodeStyleSchema,
});

const cardPropsSchema = z.object({
  variant: z.enum(["elevated", "outline", "ghost"]).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

const ctaGroupPropsSchema = z.object({
  layout: z.enum(["row", "stack"]).optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

// Tulala component embed — wraps a curated dynamic section by key. `config`
// is the section's own props payload; it is deliberately a loose passthrough
// record here (capped) because each section type owns its own Zod schema, which
// the RENDERER applies (migrate + parse via SECTION_REGISTRY). Validating the
// full per-type shape here would duplicate ~50 section schemas and couple the
// node registry to every section. The loose object still bounds payload size
// and rejects non-objects; an invalid config degrades to a placeholder at
// render time rather than failing tree validation.
const sectionEmbedPropsSchema = z.object({
  sectionTypeKey: z.string().min(1).max(80),
  sectionId: pgUuidSchema().nullable().optional(),
  dataBinding: dataBindingPropsSchema.optional(),
  layerLabel: layerLabelSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  // Wrapper-level style overrides (background, padding, margin, border, radius,
  // max-width, shadow…). Applied to the section_embed's wrapper <div> in the
  // renderer — lets operators restyle the OUTER box of an otherwise-curated
  // "Tulala component" (the section's own internal presentation still lives in
  // `config`). Optional → existing embeds are unchanged.
  style: builderNodeStyleSchema,
});

// Lead/contact form (MVP). Fields are an ordered array (text/email/tel/
// textarea/select/radio/checkbox/date/file/consent + one submit button).
// `action` is "internal" (POST to /api/cms/forms/submit, gated by a real
// `sectionId`) OR a full https/http URL (Formspree, a custom handler, …).
// Inquiry routing is owned by the contact_form section the operator picks.
const formFieldSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  type: z.enum([
    "text",
    "email",
    "tel",
    "textarea",
    "submit",
    "select",
    "radio",
    "checkbox",
    "date",
    "file",
    "consent",
  ]),
  label: z.string().min(1).max(120),
  placeholder: z.string().max(160).optional(),
  consentText: z.string().max(500).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(80)).max(24).optional(),
});

const formPropsSchema = z.object({
  action: z.string().max(2048).optional(),
  method: z.enum(["get", "post"]).optional(),
  sectionId: pgUuidSchema().nullable().optional(),
  layerLabel: layerLabelSchema,
  fields: z.array(formFieldSchema).min(1).max(24),
  honeypotName: z.string().max(80).optional(),
  // Field-box styling (the inputs, not the wrapper). Free-form CSS color/length
  // strings, length-capped like every other authored string here — the
  // renderer emits them as CSS custom properties, never as markup.
  fieldBorderColor: z.string().max(64).optional(),
  fieldBackground: z.string().max(64).optional(),
  fieldCornerRadius: z.string().max(24).optional(),
  style: builderNodeStyleSchema,
});

// A3 — a nav link MAY carry a one-level `children[]` submenu. The child link
// shape is the SAME (id/label/href) but WITHOUT its own `children` — nesting is
// capped at one level for the header bar, so a child's children key is simply
// not declared and is stripped on validate. A top-level link's `children` is
// optional + capped at 12 (matches the top-row cap). No children ⇒ the link
// object is byte-identical to the pre-A3 shape, so old trees parse unchanged.
// Depth is two levels below the top row: a child-with-children is a GROUP whose
// label is a column heading. A fourth level is stripped, not rejected.
/**
 * Fields any nav link may carry, at any depth. All optional, so a link with
 * none of them serializes byte-identically to the pre-v2 shape and every
 * stored tree keeps parsing.
 */
const navLinkExtrasSchema = z.object({
  icon: z.enum(BUILDER_ICON_NAMES).optional(),
  description: z.string().max(160).optional(),
  badge: z.string().max(24).optional(),
  external: z.boolean().optional(),
  placement: z.enum(["both", "bar", "menu"]).optional(),
  hideOn: z.array(z.enum(["desktop", "tablet", "mobile"])).max(3).optional(),
});

/** Depth 3 — a grandchild is a leaf. Declaring no `children` key is what strips
 *  a fourth level on validate, the same technique that capped depth 2. */
const navGrandchildLinkSchema = navLinkExtrasSchema.extend({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  href: z.string().min(1).max(500),
});

/** A child with children of its own is a GROUP: its label becomes the column
 *  heading in a mega panel and the section heading in the drawer. */
const navChildLinkSchema = navGrandchildLinkSchema.extend({
  children: z.array(navGrandchildLinkSchema).max(8).optional(),
});

const navLinkSchema = navChildLinkSchema.extend({
  children: z.array(navChildLinkSchema).max(12).optional(),
  featured: z
    .object({
      title: z.string().min(1).max(80),
      description: z.string().max(160).optional(),
      href: z.string().min(1).max(500),
      imageMediaId: z.string().max(120).optional(),
      imageSrc: z.string().max(1000).optional(),
    })
    .optional(),
});

const navPropsSchema = z.object({
  brand: z.string().max(120).optional(),
  brandHref: z.string().max(500).optional(),
  links: z.array(navLinkSchema).min(1).max(12),
  submenuVariant: z.enum(["dropdown", "mega"]).optional(),
  collapseAt: z.enum(["tablet", "mobile"]).optional(),
  // A6 — collapsed mobile-menu style (mirrors PublicHeaderMobileMenu variants).
  mobileMenuVariant: z
    .enum(["dropdown", "drawer-right", "sheet-bottom", "full-screen-fade"])
    .optional(),
  menuLabel: z.string().max(80).optional(),
  // Mobile-menu palette. The panel's colours were always overridable by CSS
  // custom property; these are the authoring path for them, so a dark site
  // stops getting a white drawer.
  // tokenAware, not bare string: the renderer resolves these through
  // resolveStyleTokenRef, which returns undefined for an unknown token key —
  // so a typo'd binding silently drops the colour instead of erroring. The
  // refine catches it at authoring time.
  menuBackground: tokenAwareStyleString(60),
  menuTextColor: tokenAwareStyleString(60),
  menuBorderColor: tokenAwareStyleString(60),
  /** Link interaction. Default "underline" — the bar answered a pointer with
   *  nothing at all before, which read as broken rather than restrained. */
  linkHover: z.enum(["underline", "fade", "none"]).optional(),
  /** Mega panel columns. Absent ⇒ auto-fill, the pre-v2 behaviour. */
  megaColumns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  /** Anchored under the trigger (default) or full-bleed across the nav. */
  megaWidth: z.enum(["anchored", "full"]).optional(),
  /**
   * Mobile drawer furniture. Props rather than child nodes on purpose: the
   * panel is a <details> whose CSS-only behaviour and viewport-unit geometry
   * are pinned by static tests, and arbitrary child nodes would put both at
   * the mercy of whatever got dropped inside.
   */
  menu: z
    .object({
      ctaLabel: z.string().max(60).optional(),
      ctaHref: z.string().max(500).optional(),
      showSocial: z.boolean().optional(),
      showLanguageToggle: z.boolean().optional(),
      groups: z.enum(["inline", "collapsible"]).optional(),
      density: z.enum(["compact", "comfortable", "spacious"]).optional(),
    })
    .optional(),
  /** Drives --bn-nav-accent: the underline, the badge fill, the drawer CTA. */
  accentColor: tokenAwareStyleString(60),
  ariaLabel: z.string().max(80).optional(),
  // A4 follow-up — optional bind to a collection nav source (`cms_page` /
  // `cms_posts`). When it resolves, the SHELL/server caller passes those
  // records and the renderer auto-populates the top-level links from them;
  // otherwise the static `links[]` render unchanged.
  dataBinding: dataBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

// A4 — social/contact icon row. `links[]` is an ordered array of
// {platform, href}; the renderer paints a brand-neutral glyph per platform.
// `dataBinding` optionally binds to `workspace_social_links` (the tenant's
// identity store) — when it resolves, the SHELL/server caller passes those
// records and the renderer paints them instead of the static `links[]`.
const socialPlatformSchema = z.enum([
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "linkedin",
  "x",
  "whatsapp",
  "email",
]);

const socialLinkSchema = z.object({
  id: z.string().min(1).max(120),
  platform: socialPlatformSchema,
  href: z.string().min(1).max(500),
  label: z.string().max(80).optional(),
  // Additive: absent ⇒ the platform's own glyph, exactly as before.
  icon: z.enum(BUILDER_ICON_NAMES).optional(),
});

const socialLinksPropsSchema = z.object({
  links: z.array(socialLinkSchema).max(12),
  size: z.enum(["sm", "md", "lg"]).optional(),
  shape: z.enum(["bare", "circle", "square"]).optional(),
  ariaLabel: z.string().max(80).optional(),
  dataBinding: dataBindingPropsSchema.optional(),
  layerLabel: layerLabelSchema,
  style: builderNodeStyleSchema,
});

export const BUILDER_NODE_REGISTRY: Readonly<Record<BuilderNodeKind, BuilderNodeRegistryEntry>> =
  {
    section: {
      kind: "section",
      label: "Section",
      description: "Top-level page section row.",
      children: {
        type: "allow_list",
        kinds: [...COMPOSABLE_LAYOUT_CHILD_KINDS],
      },
      propsSchema: sectionPropsSchema,
    },
    container: {
      kind: "container",
      label: "Container",
      description: "Layout container for nested nodes.",
      children: {
        type: "allow_list",
        kinds: [...COMPOSABLE_LAYOUT_CHILD_KINDS],
      },
      propsSchema: containerPropsSchema,
    },
    card: {
      kind: "card",
      label: "Card",
      description: "Bounded surface for heading, copy, image, and buttons. No nested containers.",
      children: {
        type: "allow_list",
        kinds: [...CARD_CHILD_KINDS],
      },
      propsSchema: cardPropsSchema,
    },
    cta_group: {
      kind: "cta_group",
      label: "CTA group",
      description: "Inline primary and secondary actions (buttons only).",
      children: {
        type: "allow_list",
        kinds: [...CTA_GROUP_CHILD_KINDS],
      },
      propsSchema: ctaGroupPropsSchema,
    },
    split: {
      kind: "split",
      label: "Split",
      description: "Two-column split container.",
      children: {
        type: "allow_list",
        kinds: [
          "heading",
          "paragraph",
          "button",
          "image",
          "video",
          "embed",
          "icon",
          "divider",
          "spacer",
          "container",
          "card",
          "cta_group",
          "carousel",
          "masonry",
        ],
      },
      propsSchema: splitPropsSchema,
    },
    accordion: {
      kind: "accordion",
      label: "Accordion",
      description: "Accordion group container.",
      children: {
        type: "allow_list",
        kinds: ["accordion_item"],
      },
      propsSchema: accordionPropsSchema,
    },
    accordion_item: {
      kind: "accordion_item",
      label: "Accordion Item",
      description: "Single accordion item with nested content.",
      children: {
        type: "allow_list",
        kinds: [
          "heading",
          "paragraph",
          "button",
          "image",
          "video",
          "embed",
          "icon",
          "divider",
          "spacer",
          "container",
          "card",
          "cta_group",
        ],
      },
      propsSchema: accordionItemPropsSchema,
    },
    tabs: {
      kind: "tabs",
      label: "Tabs",
      description: "Tabbed container.",
      children: {
        type: "allow_list",
        kinds: ["tab_panel"],
      },
      propsSchema: tabsPropsSchema,
    },
    tab_panel: {
      kind: "tab_panel",
      label: "Tab Panel",
      description: "Single tab panel with nested content.",
      children: {
        type: "allow_list",
        kinds: [
          "heading",
          "paragraph",
          "button",
          "image",
          "video",
          "embed",
          "icon",
          "divider",
          "spacer",
          "container",
          "card",
          "cta_group",
        ],
      },
      propsSchema: tabPanelPropsSchema,
    },
    carousel: {
      kind: "carousel",
      label: "Carousel",
      description: "Carousel/slider container.",
      children: {
        type: "allow_list",
        kinds: [
          "image",
          "video",
          "embed",
          "icon",
          "heading",
          "paragraph",
          "button",
          "divider",
          "container",
          "card",
          "cta_group",
          // A hero slide can be a full freeform layout — a `split` (columns) or a
          // `masonry` directly, not only a `container`. Each slide stays a node
          // tree the editor builds on canvas (no fixed slide fields).
          "split",
          "masonry",
        ],
      },
      propsSchema: carouselPropsSchema,
    },
    masonry: {
      kind: "masonry",
      label: "Masonry",
      description: "Masonry grid container.",
      children: {
        type: "allow_list",
        kinds: [
          "image",
          "video",
          "embed",
          "icon",
          "heading",
          "paragraph",
          "button",
          "divider",
          "container",
          "card",
          "cta_group",
        ],
      },
      propsSchema: masonryPropsSchema,
    },
    heading: {
      kind: "heading",
      label: "Heading",
      description: "Simple text heading node.",
      children: { type: "none" },
      propsSchema: headingPropsSchema,
    },
    paragraph: {
      kind: "paragraph",
      label: "Paragraph",
      description: "Simple paragraph text node.",
      children: { type: "none" },
      propsSchema: paragraphPropsSchema,
    },
    button: {
      kind: "button",
      label: "Button",
      description: "Simple CTA node.",
      children: { type: "none" },
      propsSchema: buttonPropsSchema,
    },
    image: { kind: "image", label: "Image", description: "Standalone image node.", children: { type: "none" }, propsSchema: imagePropsSchema },
    video: {
      kind: "video",
      label: "Video",
      description: "Hosted video with poster, playback, and control options.",
      children: { type: "none" },
      propsSchema: videoPropsSchema,
    },
    embed: {
      kind: "embed",
      label: "Embed",
      description: "Sandboxed iframe for video, maps, booking, or other embeds.",
      children: { type: "none" },
      propsSchema: embedPropsSchema,
    },
    social_post: {
      kind: "social_post",
      label: "Social post",
      description:
        "Feature one Instagram or TikTok post. Paste the post URL and it renders with the provider's own embed.",
      children: { type: "none" },
      propsSchema: socialPostPropsSchema,
    },
    social_feed: {
      kind: "social_feed",
      label: "Social feed",
      description:
        "A gallery of posts and reels: grid, masonry, slider or stories, with lazy loading and a lightbox. Paid plans.",
      children: { type: "none" },
      propsSchema: socialFeedPropsSchema,
    },
    // WS7 Phase 0 — the two NATIVE data blocks. Structural leaves like every
    // other data-bound kind: their inner rows come from live roster data, not
    // from child nodes, so there is nothing for the tree to nest.
    hero_search: {
      kind: "hero_search",
      label: "Search hero",
      description:
        "Search-first hero: headline, a live directory search bar, quick filters and a roster-derived talent count.",
      children: { type: "none" },
      propsSchema: heroSearchPropsSchema,
    },
    menu_board: {
      kind: "menu_board",
      label: "Menu board",
      description:
        "Workspace-owned menu items with quantity steppers and an order form. Renders from live tenant data, never from child nodes.",
      children: { type: "none" },
      propsSchema: menuBoardPropsSchema,
    },
    reserve_table: {
      kind: "reserve_table",
      label: "Reserve a table",
      description:
        "A guest picks party size, date and time and books a real table. Availability comes from your venue's service windows; the booking is held as an order the host stand can see.",
      children: { type: "none" },
      propsSchema: reserveTablePropsSchema,
    },
    session_picker: {
      kind: "session_picker",
      label: "Book a session",
      description:
        "A guest picks a seat in an upcoming session or class and books it, held as an order; the seat past capacity is refused.",
      children: { type: "none" },
      propsSchema: sessionPickerPropsSchema,
    },
    qr_code: {
      kind: "qr_code",
      label: "QR code",
      description:
        "A scannable code for one of your links, rendered on the page. Point a phone at it and it opens the link.",
      children: { type: "none" },
      propsSchema: qrCodePropsSchema,
    },
    talent_type_grid: {
      kind: "talent_type_grid",
      label: "Talent by discipline",
      description:
        "Discipline cards derived from your own roster's taxonomy, or authored by hand. Each card links into the directory.",
      children: { type: "none" },
      propsSchema: talentTypeGridPropsSchema,
    },
    // BUILDER 2027 · P2A — the twelve native kinds. All structural leaves except
    // `reveal`, which is a wrapper primitive and accepts any child.
    marquee: {
      kind: "marquee",
      label: "Marquee",
      description:
        "A continuously scrolling strip of text or tags. Used for press lines, partner names and value statements.",
      children: { type: "none" },
      propsSchema: marqueePropsSchema,
    },
    directory: {
      kind: "directory",
      label: "Directory",
      description:
        "Your roster as a filterable grid, scoped per instance by talent type, tag or a hand-picked list. Renders from live workspace data.",
      children: { type: "none" },
      propsSchema: directoryPropsSchema,
    },
    featured_talent: {
      kind: "featured_talent",
      label: "Featured talent",
      description:
        "A curated showcase of talent cards, picked by hand or filled automatically from your roster.",
      children: { type: "none" },
      propsSchema: featuredTalentPropsSchema,
    },
    location_map: {
      kind: "location_map",
      label: "Location map",
      description:
        "A map with a copy panel over it and a pin for every city, sourced by hand or from where your roster lives.",
      children: { type: "none" },
      propsSchema: locationMapPropsSchema,
    },
    header_search: {
      kind: "header_search",
      label: "Header search",
      description:
        "The header's search control: an icon linking to your directory, or an inline search field.",
      children: { type: "none" },
      propsSchema: headerSearchPropsSchema,
    },
    header_account: {
      kind: "header_account",
      label: "Header account",
      description:
        "The header's account control. Signed-out visitors see a sign-in link; signed-in visitors get their account menu.",
      children: { type: "none" },
      propsSchema: headerAccountPropsSchema,
    },
    header_inquiry: {
      kind: "header_inquiry",
      label: "Header inquiry",
      description:
        "The header's inquiry control, with a live count of what a visitor has saved.",
      children: { type: "none" },
      propsSchema: headerInquiryPropsSchema,
    },
    header_language: {
      kind: "header_language",
      label: "Header language",
      description:
        "The header's language switcher. It hides itself on a single-language site rather than showing a dead toggle.",
      children: { type: "none" },
      propsSchema: headerLanguagePropsSchema,
    },
    sticky_scroll: {
      kind: "sticky_scroll",
      label: "Sticky scroll",
      description:
        "A picture that stays pinned while the copy blocks beside it scroll past.",
      children: { type: "none" },
      propsSchema: stickyScrollPropsSchema,
    },
    reveal: {
      kind: "reveal",
      label: "Reveal",
      description:
        "Wrap any blocks so they animate into view as the visitor scrolls. Content stays visible if animation is off.",
      children: { type: "allow_list", kinds: COMPOSABLE_LAYOUT_CHILD_KINDS },
      propsSchema: revealPropsSchema,
    },
    stats: {
      kind: "stats",
      label: "Stats",
      description:
        "Oversized numbers with labels, counting up as they scroll into view.",
      children: { type: "none" },
      propsSchema: statsPropsSchema,
    },
    before_after: {
      kind: "before_after",
      label: "Before and after",
      description:
        "Two images with a slider between them, so a visitor can drag to compare.",
      children: { type: "none" },
      propsSchema: beforeAfterPropsSchema,
    },
    icon: {
      kind: "icon",
      label: "Icon",
      description: "Inline SVG icon that inherits current text color.",
      children: { type: "none" },
      propsSchema: iconPropsSchema,
    },
    pricing_table: { kind: "pricing_table", label: "Pricing table", description: "Two to four pricing tiers with features and calls to action.", children: { type: "none" }, propsSchema: pricingTablePropsSchema },
    rich_text: { kind: "rich_text", label: "Rich text", description: "Body copy with bold, italic, and sanitized links.", children: { type: "none" }, propsSchema: richTextPropsSchema },
    code: { kind: "code", label: "Code / HTML", description: "Raw HTML/CSS in a sandboxed iframe (owner only), for static markup the Embed node can't cover.", children: { type: "none" }, propsSchema: codePropsSchema },
    divider: {
      kind: "divider",
      label: "Divider",
      description: "Horizontal rule separator.",
      children: { type: "none" },
      propsSchema: dividerPropsSchema,
    },
    spacer: {
      kind: "spacer",
      label: "Spacer",
      description: "Vertical spacing node.",
      children: { type: "none" },
      propsSchema: spacerPropsSchema,
    },
    nav: {
      kind: "nav",
      label: "Navigation",
      description:
        "Header navigation bar: inline links on desktop, hamburger menu on mobile. Links stay reachable at every width. Each link can open a dropdown or mega submenu.",
      children: { type: "none" },
      propsSchema: navPropsSchema,
    },
    social_links: {
      kind: "social_links",
      label: "Social links",
      description:
        "A row of social/contact icon links (Instagram, TikTok, X, …). Bind to your workspace social profiles or set links by hand.",
      children: { type: "none" },
      propsSchema: socialLinksPropsSchema,
    },
    form: {
      kind: "form",
      label: "Form",
      description:
        "Lead/contact form: text, email, phone, and message fields plus a submit button. Submissions land in your workspace inbox.",
      children: { type: "none" },
      propsSchema: formPropsSchema,
    },
    section_embed: {
      kind: "section_embed",
      label: "Tulala component",
      description:
        "Embed a live Tulala component (directory, featured talent, booking, or CTA) anywhere on the canvas. Connects to real workspace data on publish.",
      children: { type: "none" },
      propsSchema: sectionEmbedPropsSchema,
    },
  };
