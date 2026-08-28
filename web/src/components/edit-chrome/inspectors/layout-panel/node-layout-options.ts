/**
 * Layout tab — the node layout VOCABULARY, in one place.
 *
 * Lifted verbatim out of `layout-panel.tsx` when the stack-first pass split the
 * container editor into its own module. Both files need these option tables, so
 * neither can own them without the other importing it back; a shared leaf
 * module is the only shape that keeps the import graph acyclic.
 *
 * Pure data plus two pure functions. No React, so a unit-test lane can import
 * it without a DOM.
 */

import type {
  BuilderAccordionNode,
  BuilderCardNode,
  BuilderCarouselNode,
  BuilderContainerNode,
  BuilderCtaGroupNode,
  BuilderDividerNode,
  BuilderMasonryNode,
  BuilderSpacerNode,
  BuilderSplitNode,
  BuilderTabsNode,
} from "@/lib/site-admin/builder-node";
import type { SegmentedOption } from "../../kit/segmented";

export const NODE_LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "stack", label: "Stack" },
  { value: "row", label: "Row" },
  { value: "grid", label: "Grid" },
];
export const NODE_GAP_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];
export const NODE_ALIGN_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];
export const GRID_COLUMNS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];
export const DISPLAY_MODE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "grid", label: "Grid" },
  { value: "slider", label: "Slider" },
];
export const ITEMS_PER_VIEW_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
];
// REND-1 — HTML landmark tag options for container nodes. Compact short labels
// fit the chip strip; full descriptions appear in the helper text below.
// Values mirror BuilderContainerNode.props.htmlTag in types.ts.
export const CONTAINER_HTML_TAG_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "div", label: "div" },
  { value: "section", label: "section" },
  { value: "article", label: "article" },
  { value: "aside", label: "aside" },
  { value: "header", label: "header" },
  { value: "footer", label: "footer" },
  { value: "nav", label: "nav" },
  { value: "main", label: "main" },
];
export const SPLIT_RATIO_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "50-50", label: "50 / 50" },
  { value: "40-60", label: "40 / 60" },
  { value: "60-40", label: "60 / 40" },
  { value: "30-70", label: "30 / 70" },
  { value: "70-30", label: "70 / 30" },
];
export const CAROUSEL_AUTOPLAY_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Off" },
  { value: "3000", label: "3s" },
  { value: "6000", label: "6s" },
  { value: "9000", label: "9s" },
  { value: "12000", label: "12s" },
];
export const CAROUSEL_SLIDES_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];
export const MASONRY_COLUMNS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];
export const SPACER_SIZE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];

export type AdvancedEditableBuilderNode =
  | BuilderContainerNode
  | BuilderCardNode
  | BuilderCtaGroupNode
  | BuilderSplitNode
  | BuilderAccordionNode
  | BuilderTabsNode
  | BuilderCarouselNode
  | BuilderMasonryNode
  | BuilderDividerNode
  | BuilderSpacerNode;

// A container-layout override tier id. `tablet`/`mobile` are the built-ins;
// any other slug is an operator-defined custom tier. `desktop` is the base
// (never an override bucket). First-class responsive writes into any of these.
export type ContainerResponsiveViewport = string;

/** The container-layout keys the responsive bucket can carry. */
export type ContainerLayoutFieldKey =
  | "layout"
  | "gap"
  | "columns"
  | "align"
  | "display"
  | "itemsPerView";

export function nodeKindLabel(kind: AdvancedEditableBuilderNode["kind"]): string {
  switch (kind) {
    case "container":
      return "Container";
    case "card":
      return "Card";
    case "cta_group":
      return "CTA group";
    case "split":
      return "Split";
    case "accordion":
      return "Accordion";
    case "tabs":
      return "Tabs";
    case "carousel":
      return "Carousel";
    case "masonry":
      return "Masonry";
    case "divider":
      return "Divider";
    case "spacer":
      return "Spacer";
  }
}

export function cleanContainerResponsive(
  responsive: BuilderContainerNode["props"]["responsive"] | undefined,
) {
  if (!responsive) return undefined;
  const next: NonNullable<BuilderContainerNode["props"]["responsive"]> = {};
  // Iterate EVERY tier id present (built-in tablet/mobile + any custom tier),
  // not a fixed pair — first-class responsive writes into any tier bucket.
  for (const viewport of Object.keys(responsive)) {
    const value = responsive[viewport];
    if (!value) continue;
    const cleaned = Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    );
    if (Object.keys(cleaned).length > 0) {
      next[viewport] = cleaned;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
