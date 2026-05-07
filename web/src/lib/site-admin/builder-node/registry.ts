import { z } from "zod";
import type { BuilderNodeKind } from "./types";

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

const sectionPropsSchema = z.object({
  sectionId: z.string().uuid().nullable().optional(),
  sectionTypeKey: z.string().min(1),
  label: z.string().nullable().optional(),
  slotKey: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dataBinding: z
    .object({
      sourceKey: z.string().min(1),
      mode: z.enum(["auto", "manual"]).optional(),
      filterQuery: z.string().max(500).optional(),
      maxItems: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

const containerPropsSchema = z.object({
  layout: z.enum(["stack", "row", "grid"]),
  gap: z.enum(["s", "m", "l"]).optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  responsive: z
    .object({
      tablet: z
        .object({
          layout: z.enum(["stack", "row", "grid"]).optional(),
          gap: z.enum(["s", "m", "l"]).optional(),
          columns: z
            .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
            .optional(),
          align: z.enum(["start", "center", "end", "stretch"]).optional(),
        })
        .optional(),
      mobile: z
        .object({
          layout: z.enum(["stack", "row", "grid"]).optional(),
          gap: z.enum(["s", "m", "l"]).optional(),
          columns: z
            .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
            .optional(),
          align: z.enum(["start", "center", "end", "stretch"]).optional(),
        })
        .optional(),
    })
    .optional(),
});

const splitPropsSchema = z.object({
  ratio: z.enum(["50-50", "40-60", "60-40", "30-70", "70-30"]).optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
  collapseOnMobile: z.boolean().optional(),
});

const accordionPropsSchema = z.object({
  allowMultiple: z.boolean().optional(),
  defaultOpenItemIds: z.array(z.string().min(1)).max(30).optional(),
});

const accordionItemPropsSchema = z.object({
  title: z.string().min(1).max(180),
});

const tabsPropsSchema = z.object({
  defaultTabId: z.string().min(1).optional(),
});

const tabPanelPropsSchema = z.object({
  title: z.string().min(1).max(180),
});

const carouselPropsSchema = z.object({
  slidesPerView: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  autoplayMs: z.number().int().min(1000).max(30000).optional(),
  loop: z.boolean().optional(),
  showArrows: z.boolean().optional(),
  showDots: z.boolean().optional(),
});

const masonryPropsSchema = z.object({
  columns: z
    .union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
  gap: z.enum(["s", "m", "l"]).optional(),
});

const headingPropsSchema = z.object({
  text: z.string().min(1).max(240),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

const paragraphPropsSchema = z.object({
  text: z.string().min(1).max(5000),
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
});

const imagePropsSchema = z.object({
  src: z.string().url().max(2048),
  alt: z.string().max(240).optional(),
});

const spacerPropsSchema = z.object({
  size: z.enum(["s", "m", "l"]),
});

export const BUILDER_NODE_REGISTRY: Readonly<Record<BuilderNodeKind, BuilderNodeRegistryEntry>> =
  {
    section: {
      kind: "section",
      label: "Legacy Section",
      description: "Reference to a section-composition slot entry.",
      children: {
        type: "allow_list",
        kinds: [
          "container",
          "split",
          "accordion",
          "tabs",
          "carousel",
          "masonry",
          "heading",
          "paragraph",
          "button",
          "image",
          "spacer",
        ],
      },
      propsSchema: sectionPropsSchema,
    },
    container: {
      kind: "container",
      label: "Container",
      description: "Layout container for nested nodes.",
      children: {
        type: "allow_list",
        kinds: [
          "container",
          "split",
          "accordion",
          "tabs",
          "carousel",
          "masonry",
          "heading",
          "paragraph",
          "button",
          "image",
          "spacer",
        ],
      },
      propsSchema: containerPropsSchema,
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
          "spacer",
          "container",
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
        kinds: ["heading", "paragraph", "button", "image", "spacer", "container"],
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
        kinds: ["heading", "paragraph", "button", "image", "spacer", "container"],
      },
      propsSchema: tabPanelPropsSchema,
    },
    carousel: {
      kind: "carousel",
      label: "Carousel",
      description: "Carousel/slider container.",
      children: {
        type: "allow_list",
        kinds: ["image", "heading", "paragraph", "button", "container"],
      },
      propsSchema: carouselPropsSchema,
    },
    masonry: {
      kind: "masonry",
      label: "Masonry",
      description: "Masonry grid container.",
      children: {
        type: "allow_list",
        kinds: ["image", "heading", "paragraph", "button", "container"],
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
    spacer: {
      kind: "spacer",
      label: "Spacer",
      description: "Vertical spacing node.",
      children: { type: "none" },
      propsSchema: spacerPropsSchema,
    },
  };
