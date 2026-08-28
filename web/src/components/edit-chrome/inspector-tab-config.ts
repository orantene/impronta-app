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
  // Animation sits FOURTH, right after Style: it is a design decision about the
  // element in front of you, not a power-user data concern. `motion` is still
  // the key -- renaming a persisted tab key would orphan every operator whose
  // last-open tab was stored.
  { key: "motion", label: "Animation" },
  { key: "data", label: "Data" },
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
  motion: "How this block arrives on the page",
};

const DEFAULT_TABS: ReadonlyArray<InspectorTabKey> = ["layout", "content", "style"];

/**
 * The only per-type allow-list. The command rail and the dock body both
 * resolve through `resolveInspectorVisibleTabs`. Do not add a second map
 * in inspector-dock.
 */
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

function allowedInspectorTabKeys(input: {
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
    // Animation is available for every kind that gets a Style tab -- which is
    // every standalone kind -- and is pushed BEFORE Data so the rail order
    // matches INSPECTOR_TABS.
    tabs.push("motion");
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
    return tabs;
  }
  return tabsForSectionType(sectionTypeKey);
}

/**
 * Single tab resolver for the command rail AND the dock body.
 * Curated cms_page_sections rows and freeform builder nodes both go through
 * here so the inspector product stays one chrome (Layout / Content / Style /
 * Animation / Data). Empty tabs stay hidden via the allow-lists above.
 */
export function resolveInspectorVisibleTabs(input: {
  sectionTypeKey: string | null | undefined;
  selectedStandaloneBuilderNode: ReturnType<
    typeof resolveStandaloneBuilderNodeForContent
  >;
}): ReadonlyArray<InspectorTabKey> {
  const allowed = new Set(allowedInspectorTabKeys(input));
  return INSPECTOR_TABS.filter((t) => allowed.has(t.key)).map((t) => t.key);
}

/** The Style tab always mounts this panel, for curated sections and freeform nodes. */
export const INSPECTOR_STYLE_MOUNT = "StylePanel" as const;
export type InspectorStyleMount = typeof INSPECTOR_STYLE_MOUNT;

export function resolveInspectorChrome(input: {
  sectionTypeKey: string | null | undefined;
  selectedStandaloneBuilderNode: ReturnType<
    typeof resolveStandaloneBuilderNodeForContent
  >;
}): {
  tabKeys: ReadonlyArray<InspectorTabKey>;
  styleMount: InspectorStyleMount;
} {
  return {
    tabKeys: resolveInspectorVisibleTabs(input),
    styleMount: INSPECTOR_STYLE_MOUNT,
  };
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
