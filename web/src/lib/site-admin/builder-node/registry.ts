import { z } from "zod";
import { BUILDER_ICON_NAMES } from "./icon-registry";
import {
  isBindableTokenKey,
  isStyleTokenRef,
  STYLE_TOKEN_REF_PREFIX,
} from "./style-token-bindings";
import type { BuilderNodeKind } from "./types";

/** Kinds allowed inside composable shells (section body, container, card, CTA group, …). */
const COMPOSABLE_LAYOUT_CHILD_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "container",
  "card",
  "cta_group",
  "split",
  "nav",
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
  "icon",
  "pricing_table",
  "rich_text",
  "code",
  "divider",
  "spacer",
  // Lead/contact form — droppable inside layout shells as well as at the root.
  "form",
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

const sectionPropsSchema = z.object({
  sectionId: z.string().uuid().nullable().optional(),
  sectionTypeKey: z.string().min(1),
  label: z.string().nullable().optional(),
  slotKey: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dataBinding: dataBindingPropsSchema.optional(),
  ejected: z.boolean().optional(),
});

const builderNodeStyleValueSchema = z.object({
  align: z.enum(["left", "center", "right"]).optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
  tone: z.enum(["default", "muted", "strong"]).optional(),
  maxWidth: z.enum(["narrow", "reading", "wide", "full"]).optional(),
  marginTop: z.enum(["none", "s", "m", "l"]).optional(),
  marginBottom: z.enum(["none", "s", "m", "l"]).optional(),
  paddingX: z.enum(["none", "s", "m", "l"]).optional(),
  paddingY: z.enum(["none", "s", "m", "l"]).optional(),
  background: z.enum(["none", "surface", "contrast"]).optional(),
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
  borderColor: tokenAwareStyleString(64),
  borderWidth: z.string().max(16).optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
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
  paddingTop: tokenAwareStyleString(16),
  paddingRight: tokenAwareStyleString(16),
  paddingBottom: tokenAwareStyleString(16),
  paddingLeft: tokenAwareStyleString(16),
  // Free per-side margin escapes (collision-safe *Free keys; the margin tokens
  // are enums). Layer after every margin token so the exact value wins. Also
  // accept a `token:space.*` binding.
  marginTopFree: tokenAwareStyleString(16),
  marginRightFree: tokenAwareStyleString(16),
  marginBottomFree: tokenAwareStyleString(16),
  marginLeftFree: tokenAwareStyleString(16),
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
  gap: tokenAwareStyleString(16),
  // Container-query registration — turns this node into a query container.
  containerType: z.enum(["normal", "inline-size", "size"]).optional(),
  containerName: z.string().max(80).optional(),
  // Positioning escapes — context + inset offsets (negatives allowed).
  position: z.enum(["relative", "absolute", "sticky"]).optional(),
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
  flexBasis: z.string().max(16).optional(),
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
  mixBlendMode: z
    .enum(["multiply", "screen", "overlay", "darken", "lighten"])
    .optional(),
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
  animationPreset: z
    .enum([
      "none",
      "fade-in",
      "rise",
      "fall",
      "zoom-in",
      "slide-left",
      "slide-right",
      "blur-in",
      "flip-in",
      "bounce-in",
    ])
    .optional(),
  animationDuration: z.string().max(16).optional(),
  animationDelay: z.string().max(16).optional(),
  animationTrigger: z.enum(["load", "scroll"]).optional(),
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

// Hover-state overrides — a curated subset of animatable props re-applied while
// hovered/focused. Single layer (hover is a pointer interaction, not a viewport).
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
});

const builderNodeStyleSchema = builderNodeStyleValueSchema
  .extend({
    responsive: z
      .object({
        tablet: builderNodeStyleValueSchema.optional(),
        mobile: builderNodeStyleValueSchema.optional(),
      })
      .optional(),
    containerQueries: z
      .object({
        tablet: builderNodeStyleValueSchema.optional(),
        mobile: builderNodeStyleValueSchema.optional(),
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

const carouselPropsSchema = z.object({
  slidesPerView: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  autoplayMs: z.number().int().min(1000).max(30000).optional(),
  loop: z.boolean().optional(),
  showArrows: z.boolean().optional(),
  showDots: z.boolean().optional(),
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
    responsive: z
      .object({
        tablet: containerResponsiveSchema.optional(),
        mobile: containerResponsiveSchema.optional(),
      })
      .optional(),
    dataBinding: dataBindingPropsSchema.optional(),
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
  layerLabel: layerLabelSchema,
  fieldBindings: fieldBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

const paragraphPropsSchema = z.object({
  text: z.string().min(1).max(5000),
  layerLabel: layerLabelSchema,
  fieldBindings: fieldBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

const buttonPropsSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1).max(500),
  layerLabel: layerLabelSchema,
  tone: z.enum(["primary", "secondary"]).optional(),
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

const imagePropsSchema = z.object({
  src: z.string().max(2048),
  mediaId: z.string().uuid().optional(),
  alt: z.string().max(240).optional(),
  layerLabel: layerLabelSchema,
  fieldBindings: fieldBindingPropsSchema.optional(),
  style: builderNodeStyleSchema,
});

const videoPropsSchema = z.object({
  src: z.string().url().max(2048),
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

const iconPropsSchema = z.object({
  icon: z.enum(BUILDER_ICON_NAMES),
  label: z.string().max(160).optional(),
  layerLabel: layerLabelSchema,
  decorative: z.boolean().optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
  style: builderNodeStyleSchema,
});

const pricingTablePropsSchema = z.object({
  tiers: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(120), description: z.string().max(500).optional(), price: z.string().min(1).max(80), period: z.string().max(80).optional(), ctaLabel: z.string().max(80).optional(), ctaHref: z.string().max(500).optional(), highlighted: z.boolean().optional(), features: z.array(z.object({ label: z.string().min(1).max(240), included: z.boolean().optional() })).max(20).optional() })).min(2).max(4),
  style: builderNodeStyleSchema,
});
const richTextPropsSchema = z.object({ text: z.string().min(1).max(10000), fieldBindings: fieldBindingPropsSchema.optional(), style: builderNodeStyleSchema });
const codePropsSchema = z.object({ html: z.string().max(20000), minHeight: z.number().int().min(40).max(5000).optional(), style: builderNodeStyleSchema }); // safety = opaque-origin sandbox in render.tsx, not markup validation

const spacerPropsSchema = z.object({
  size: z.enum(["s", "m", "l"]),
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
  sectionId: z.string().uuid().nullable().optional(),
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
// textarea inputs + one submit button). `action` is "internal" (POST to
// /api/cms/forms/submit, gated by a real `sectionId`) OR a full https/http URL
// (Formspree, a custom handler, …). Field `name`s become submission keys; the
// renderer adds a honeypot + hidden section marker. DEFERRED: select / radio /
// checkbox, multi-step, and validation beyond native required/type.
const formFieldSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  type: z.enum(["text", "email", "tel", "textarea", "submit"]),
  label: z.string().min(1).max(120),
  placeholder: z.string().max(160).optional(),
  required: z.boolean().optional(),
});

const formPropsSchema = z.object({
  action: z.string().max(2048).optional(),
  method: z.enum(["get", "post"]).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  layerLabel: layerLabelSchema,
  fields: z.array(formFieldSchema).min(1).max(24),
  honeypotName: z.string().max(80).optional(),
  style: builderNodeStyleSchema,
});

const navPropsSchema = z.object({
  brand: z.string().max(120).optional(),
  brandHref: z.string().max(500).optional(),
  links: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        label: z.string().min(1).max(120),
        href: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(12),
  collapseAt: z.enum(["tablet", "mobile"]).optional(),
  menuLabel: z.string().max(80).optional(),
  ariaLabel: z.string().max(80).optional(),
  style: builderNodeStyleSchema,
});

export const BUILDER_NODE_REGISTRY: Readonly<Record<BuilderNodeKind, BuilderNodeRegistryEntry>> =
  {
    section: {
      kind: "section",
      label: "Legacy Section",
      description: "Reference to a section-composition slot entry.",
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
      description: "Bounded surface for heading, copy, image, and buttons — no nested containers.",
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
    icon: {
      kind: "icon",
      label: "Icon",
      description: "Inline SVG icon that inherits current text color.",
      children: { type: "none" },
      propsSchema: iconPropsSchema,
    },
    pricing_table: { kind: "pricing_table", label: "Pricing table", description: "Two to four pricing tiers with features and calls to action.", children: { type: "none" }, propsSchema: pricingTablePropsSchema },
    rich_text: { kind: "rich_text", label: "Rich text", description: "Body copy with bold, italic, and sanitized links.", children: { type: "none" }, propsSchema: richTextPropsSchema },
    code: { kind: "code", label: "Code / HTML", description: "Raw HTML/CSS in a sandboxed iframe (owner only) — for static markup the Embed node can't cover.", children: { type: "none" }, propsSchema: codePropsSchema },
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
        "Header navigation bar — inline links on desktop, hamburger menu on mobile. Links stay reachable at every width.",
      children: { type: "none" },
      propsSchema: navPropsSchema,
    },
    form: {
      kind: "form",
      label: "Form",
      description:
        "Lead/contact form — text, email, phone, and message fields plus a submit button. Submissions land in your workspace inbox.",
      children: { type: "none" },
      propsSchema: formPropsSchema,
    },
    section_embed: {
      kind: "section_embed",
      label: "Tulala component",
      description:
        "Embed a live Tulala component — directory, featured talent, booking, or CTA — anywhere on the canvas. Connects to real workspace data on publish.",
      children: { type: "none" },
      propsSchema: sectionEmbedPropsSchema,
    },
  };
