import { z } from "zod";
import type { BuilderNodeKind } from "./types";

/** Kinds allowed inside composable shells (section body, container, card, CTA group, …). */
const COMPOSABLE_LAYOUT_CHILD_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "container",
  "card",
  "cta_group",
  "split",
  "accordion",
  "tabs",
  "carousel",
  "masonry",
  "heading",
  "paragraph",
  "button",
  "image",
  "divider",
  "spacer",
];

/** §7A parent/child governance — Card (typography + media + actions; no layout shells inside). */
const CARD_CHILD_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "heading",
  "paragraph",
  "button",
  "image",
];

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
});

const sectionPropsSchema = z.object({
  sectionId: z.string().uuid().nullable().optional(),
  sectionTypeKey: z.string().min(1),
  label: z.string().nullable().optional(),
  slotKey: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dataBinding: dataBindingPropsSchema.optional(),
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
  aspectRatio: z.enum(["auto", "1:1", "4:3", "3:4", "16:9", "21:9"]).optional(),
  visibility: z.enum(["visible", "hidden"]).optional(),
  // Free-value escapes (mirror of BuilderNodeStyleValue). Length-capped so a
  // hand-crafted tree can't smuggle an oversized declaration; values land in
  // React inline styles, which the CSSOM validates (no injection surface).
  fontFamily: z.string().max(160).optional(),
  fontSize: z.string().max(32).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.string().max(16).optional(),
  letterSpacing: z.string().max(16).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  // max 64 (not 32) so a theme-token binding like
  // `var(--token-color-surface-raised, #ffffff)` (and rgba()/hsl() free values)
  // survives the schema instead of being silently stripped on save.
  textColor: z.string().max(64).optional(),
  backgroundColor: z.string().max(64).optional(),
  borderColor: z.string().max(64).optional(),
  borderWidth: z.string().max(16).optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  // Free border-radius escape — raw CSS (supports per-corner shorthand). Layers
  // after the radius token so an exact value wins.
  borderRadius: z.string().max(64).optional(),
  // Free dimension escapes — exact width / height / min-height (length-capped).
  // Coexist with the maxWidth token above (max-width clamps the free width).
  width: z.string().max(16).optional(),
  height: z.string().max(16).optional(),
  minHeight: z.string().max(16).optional(),
  minWidth: z.string().max(16).optional(),
  maxWidthFree: z.string().max(16).optional(),
  maxHeight: z.string().max(16).optional(),
  // Free per-side padding escapes — layer after the paddingX/paddingY token.
  paddingTop: z.string().max(16).optional(),
  paddingRight: z.string().max(16).optional(),
  paddingBottom: z.string().max(16).optional(),
  paddingLeft: z.string().max(16).optional(),
  // Free per-side margin escapes (collision-safe *Free keys; the margin tokens
  // are enums). Layer after every margin token so the exact value wins.
  marginTopFree: z.string().max(16).optional(),
  marginRightFree: z.string().max(16).optional(),
  marginBottomFree: z.string().max(16).optional(),
  marginLeftFree: z.string().max(16).optional(),
  // Surface & depth escapes (length/string-capped; opacity normalized 0–1).
  boxShadow: z.string().max(200).optional(),
  textShadow: z.string().max(200).optional(),
  backgroundImage: z.string().max(500).optional(),
  opacity: z.number().min(0).max(1).optional(),
  // Free gap escape — overrides the layout gap token via the --bn-gap variable.
  gap: z.string().max(16).optional(),
  // Positioning escapes — context + inset offsets (negatives allowed).
  position: z.enum(["relative", "absolute", "sticky"]).optional(),
  top: z.string().max(16).optional(),
  right: z.string().max(16).optional(),
  bottom: z.string().max(16).optional(),
  left: z.string().max(16).optional(),
  // Stacking & clipping escapes — z-index (integer, negatives allowed) +
  // overflow control.
  zIndex: z.number().int().min(-999).max(999).optional(),
  overflow: z.enum(["visible", "hidden", "auto", "scroll"]).optional(),
  // Transform escapes — standalone rotate (angle) + scale (factor).
  rotate: z.string().max(16).optional(),
  scale: z.string().max(16).optional(),
  // Flex/grid child placement — self-alignment + flex sizing inside a parent.
  alignSelf: z.enum(["auto", "start", "center", "end", "stretch"]).optional(),
  flexGrow: z.number().min(0).max(999).optional(),
  flexShrink: z.number().min(0).max(999).optional(),
  flexBasis: z.string().max(16).optional(),
  // Grid child placement — grid-column / grid-row span/line specs.
  gridColumn: z.string().max(24).optional(),
  gridRow: z.string().max(24).optional(),
  // Filter effects — CSS filter (self) + backdrop-filter (behind, glassmorphism).
  filter: z.string().max(120).optional(),
  backdropFilter: z.string().max(120).optional(),
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
});

const builderNodeStyleSchema = builderNodeStyleValueSchema
  .extend({
    responsive: z
      .object({
        tablet: builderNodeStyleValueSchema.optional(),
        mobile: builderNodeStyleValueSchema.optional(),
      })
      .optional(),
  })
  .optional();

const accordionPropsSchema = z.object({
  allowMultiple: z.boolean().optional(),
  defaultOpenItemIds: z.array(z.string().min(1)).max(30).optional(),
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
  style: builderNodeStyleSchema,
});

const headingPropsSchema = z.object({
  text: z.string().min(1).max(240),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  style: builderNodeStyleSchema,
});

const paragraphPropsSchema = z.object({
  text: z.string().min(1).max(5000),
  style: builderNodeStyleSchema,
});

const buttonPropsSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1).max(500),
  tone: z.enum(["primary", "secondary"]).optional(),
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
  src: z.string().url().max(2048),
  alt: z.string().max(240).optional(),
  style: builderNodeStyleSchema,
});

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
  style: builderNodeStyleSchema,
});

const ctaGroupPropsSchema = z.object({
  layout: z.enum(["row", "stack"]).optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
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
    image: {
      kind: "image",
      label: "Image",
      description: "Standalone image node.",
      children: { type: "none" },
      propsSchema: imagePropsSchema,
    },
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
  };
