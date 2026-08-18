import type { LucideIcon } from "lucide-react";
import {
  Droplet,
  LayoutGrid,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
} from "lucide-react";

import {
  BUILDER_NODE_REGISTRY,
  builderNodeSupportsDataBinding,
  builderNodeSupportsFieldBindings,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";

import { resolveStandaloneBuilderNodeForContent } from "./inspectors/builder-node-content-utils";

export type InspectorTabKey = "content" | "layout" | "style" | "data" | "motion";

export const INSPECTOR_TABS: ReadonlyArray<{ key: InspectorTabKey; label: string }> = [
  { key: "layout", label: "Layout" },
  { key: "content", label: "Content" },
  { key: "style", label: "Style" },
  { key: "data", label: "Data" },
  { key: "motion", label: "Motion" },
];

export const INSPECTOR_TAB_ICON: Record<InspectorTabKey, LucideIcon> = {
  content: SquarePen,
  layout: LayoutGrid,
  style: Droplet,
  data: SlidersHorizontal,
  motion: Sparkles,
};

export const INSPECTOR_TAB_HINT: Record<InspectorTabKey, string> = {
  content: "Edit text, images, and controls for this block",
  layout: "Spacing, width, and how the block sits on the page",
  style: "Colors, type, borders, and surfaces",
  data: "Connect this block to live roster or catalog data",
  motion: "Entrance motion when visitors scroll to this block",
};

const DEFAULT_TABS: ReadonlyArray<InspectorTabKey> = ["layout", "content", "style"];

const TABS_BY_SECTION_TYPE: Record<string, ReadonlyArray<InspectorTabKey>> = {
  hero: ["layout", "content", "style", "data", "motion"],
  featured_talent: ["layout", "content", "style", "data", "motion"],
  gallery_strip: ["layout", "content", "style", "motion"],
  testimonials_trio: ["layout", "content", "style", "motion"],
  cta_banner: ["layout", "content", "style", "motion"],
  image_copy_alternating: ["layout", "content", "style"],
  trust_strip: ["layout", "content", "style"],
  press_strip: ["layout", "content", "style"],
  values_trio: ["layout", "content", "style"],
  process_steps: ["layout", "content", "style"],
  category_grid: ["layout", "content", "style", "data"],
  destinations_mosaic: ["layout", "content", "style", "data"],
  map_overlay: ["layout", "content", "style", "data"],
  marquee: ["layout", "content", "style", "motion"],
};

export function tabsForSectionType(
  typeKey: string | null | undefined,
): ReadonlyArray<InspectorTabKey> {
  if (!typeKey) return DEFAULT_TABS;
  return TABS_BY_SECTION_TYPE[typeKey] ?? DEFAULT_TABS;
}

function nodeUsesLayoutInspector(
  node: Exclude<BuilderNode, { kind: "section" }>,
): boolean {
  switch (node.kind) {
    case "container":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
    case "divider":
    case "spacer":
      return true;
    default:
      return false;
  }
}

/**
 * Kinds that get a Data tab for its VISIBILITY rules alone, having no data
 * binding of their own to earn it.
 */
const KINDS_WITH_VISIBILITY_RULES: ReadonlySet<string> = new Set([
  "nav",
  "social_links",
]);

export function resolveInspectorVisibleTabs(input: {
  sectionTypeKey: string | null | undefined;
  selectedStandaloneBuilderNode: ReturnType<
    typeof resolveStandaloneBuilderNodeForContent
  >;
}): ReadonlyArray<InspectorTabKey> {
  const { sectionTypeKey, selectedStandaloneBuilderNode } = input;
  if (selectedStandaloneBuilderNode) {
    const tabs: InspectorTabKey[] = nodeUsesLayoutInspector(selectedStandaloneBuilderNode)
      ? ["layout", "content", "style"]
      : ["content", "style"];
    if (builderNodeSupportsDataBinding(selectedStandaloneBuilderNode.kind)) {
      tabs.push("data");
    } else if (
      builderNodeSupportsFieldBindings(selectedStandaloneBuilderNode.kind)
    ) {
      tabs.push("data");
    } else if (KINDS_WITH_VISIBILITY_RULES.has(selectedStandaloneBuilderNode.kind)) {
      // The Data tab also owns visibility rules (show only in one locale, only
      // when signed in). Gating the tab purely on data BINDING hid that control
      // from the header's two most locale-sensitive nodes -- a nav and a social
      // row -- so the rules existed with no way to reach them.
      tabs.push("data");
    }
    tabs.push("motion");
    return tabs;
  }
  const allowed = tabsForSectionType(sectionTypeKey);
  const set = new Set(allowed);
  return INSPECTOR_TABS.filter((t) => set.has(t.key)).map((t) => t.key);
}

export function inspectorTabItemsForKeys(
  keys: ReadonlyArray<InspectorTabKey>,
): ReadonlyArray<{
  key: InspectorTabKey;
  label: string;
  hint: string;
  icon: LucideIcon;
}> {
  return INSPECTOR_TABS.filter((t) => keys.includes(t.key)).map((t) => ({
    key: t.key,
    label: t.label,
    hint: INSPECTOR_TAB_HINT[t.key],
    icon: INSPECTOR_TAB_ICON[t.key],
  }));
}

/** For type labels in empty states — kept here to avoid circular imports. */
export function humanizeSectionTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function builderNodeDisplayTitle(
  node: Exclude<BuilderNode, { kind: "section" }>,
): string {
  switch (node.kind) {
    case "heading":
      return node.props.text || "Heading";
    case "paragraph":
      return node.props.text.length > 64
        ? `${node.props.text.slice(0, 63).trimEnd()}…`
        : node.props.text || "Paragraph";
    case "button":
      return node.props.label || "Button";
    case "image":
      return node.props.alt?.trim() || "Image";
    case "accordion_item":
    case "tab_panel":
      return node.props.title || BUILDER_NODE_REGISTRY[node.kind].label;
    default:
      return BUILDER_NODE_REGISTRY[node.kind].label;
  }
}
