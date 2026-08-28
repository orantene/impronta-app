"use client";

/**
 * Layout tab - node layout PRESETS and the reset patch.
 *
 * Extracted from `layout-panel.tsx` in the stack-first pass: the four preset
 * tables plus their card grid are ~200 lines of pure vocabulary that the
 * container editor and the remaining per-kind branches both read, and the
 * Layout panel is line-ratcheted, so they move out rather than being carried
 * as dead weight in a file that is not allowed to grow.
 *
 * Behaviour unchanged: same ids, same labels, same patches.
 */

import { InspectorLayoutPresetCards } from "../kit/inspector-mockup-primitives";
import type { AdvancedEditableBuilderNode } from "./node-layout-options";

export type NodeLayoutPreset<T extends AdvancedEditableBuilderNode["kind"]> = {
  id: string;
  label: string;
  description: string;
  kind: T;
  patch: Extract<AdvancedEditableBuilderNode, { kind: T }>["props"];
};
export type AnyNodeLayoutPreset =
  | NodeLayoutPreset<"container">
  | NodeLayoutPreset<"split">
  | NodeLayoutPreset<"carousel">
  | NodeLayoutPreset<"masonry">;
const CONTAINER_LAYOUT_PRESETS: ReadonlyArray<NodeLayoutPreset<"container">> = [
  {
    id: "editorial-stack",
    label: "Editorial stack",
    description: "Vertical rhythm for copy-led sections.",
    kind: "container",
    patch: { layout: "stack", gap: "m", align: "stretch", columns: undefined, responsive: undefined },
  },
  {
    id: "media-row",
    label: "Media row",
    description: "Flexible row that wraps gracefully.",
    kind: "container",
    patch: { layout: "row", gap: "m", align: "center", columns: undefined, responsive: undefined },
  },
  {
    id: "two-column-grid",
    label: "Two columns",
    description: "Classic split grid with mobile stack.",
    kind: "container",
    patch: {
      layout: "grid",
      gap: "m",
      align: "stretch",
      columns: 2,
      responsive: { tablet: { columns: 2 }, mobile: { layout: "stack", columns: 1 } },
    },
  },
  {
    id: "card-grid",
    label: "Card grid",
    description: "Three-up desktop, two-up tablet, one-up mobile.",
    kind: "container",
    patch: {
      layout: "grid",
      gap: "l",
      align: "stretch",
      columns: 3,
      responsive: { tablet: { layout: "grid", columns: 2 }, mobile: { layout: "stack", columns: 1 } },
    },
  },
];
const SPLIT_LAYOUT_PRESETS: ReadonlyArray<NodeLayoutPreset<"split">> = [
  {
    id: "balanced-split",
    label: "Balanced",
    description: "Even columns with a mobile stack.",
    kind: "split",
    patch: { ratio: "50-50", gap: "m", collapseOnMobile: undefined },
  },
  {
    id: "media-left",
    label: "Media left",
    description: "Stronger visual column on the left.",
    kind: "split",
    patch: { ratio: "60-40", gap: "l", collapseOnMobile: undefined },
  },
  {
    id: "copy-led",
    label: "Copy led",
    description: "Text column leads with supporting media.",
    kind: "split",
    patch: { ratio: "40-60", gap: "l", collapseOnMobile: undefined },
  },
];
const CAROUSEL_LAYOUT_PRESETS: ReadonlyArray<NodeLayoutPreset<"carousel">> = [
  {
    id: "editorial-reel",
    label: "Editorial reel",
    description: "Two visible slides with arrows and dots.",
    kind: "carousel",
    patch: { slidesPerView: 2, showArrows: true, showDots: true, loop: undefined, autoplayMs: undefined },
  },
  {
    id: "campaign-strip",
    label: "Campaign strip",
    description: "Three visible slides for dense story rows.",
    kind: "carousel",
    patch: { slidesPerView: 3, showArrows: true, showDots: undefined, loop: true, autoplayMs: undefined },
  },
  {
    id: "auto-showcase",
    label: "Auto showcase",
    description: "Single-slide feature carousel with slow autoplay.",
    kind: "carousel",
    patch: { slidesPerView: 1, showArrows: true, showDots: true, loop: true, autoplayMs: 6000 },
  },
];
const MASONRY_LAYOUT_PRESETS: ReadonlyArray<NodeLayoutPreset<"masonry">> = [
  {
    id: "portfolio-wall",
    label: "Portfolio wall",
    description: "Three-column editorial masonry.",
    kind: "masonry",
    patch: { columns: 3, gap: "m" },
  },
  {
    id: "dense-board",
    label: "Dense board",
    description: "Four columns for image-heavy discovery.",
    kind: "masonry",
    patch: { columns: 4, gap: "s" },
  },
];

export function nodeLayoutPresetsFor(
  kind: AdvancedEditableBuilderNode["kind"],
): ReadonlyArray<AnyNodeLayoutPreset> {
  switch (kind) {
    case "container":
      return CONTAINER_LAYOUT_PRESETS;
    case "split":
      return SPLIT_LAYOUT_PRESETS;
    case "carousel":
      return CAROUSEL_LAYOUT_PRESETS;
    case "masonry":
      return MASONRY_LAYOUT_PRESETS;
    default:
      return [];
  }
}

export function nodeLayoutResetPatch(
  node: AdvancedEditableBuilderNode,
): Record<string, unknown> {
  switch (node.kind) {
    case "container":
      return {
        layout: "stack",
        gap: "m",
        columns: undefined,
        align: "stretch",
        display: undefined,
        itemsPerView: undefined,
        responsive: undefined,
      };
    case "split":
      return {
        ratio: undefined,
        gap: "m",
        collapseOnMobile: undefined,
      };
    case "accordion":
      return {
        allowMultiple: undefined,
        defaultOpenItemIds: undefined,
      };
    case "tabs":
      return {
        defaultTabId: undefined,
      };
    case "carousel":
      return {
        slidesPerView: 2,
        autoplayMs: undefined,
        loop: undefined,
        showArrows: undefined,
        showDots: undefined,
      };
    case "masonry":
      return {
        columns: 3,
        gap: "m",
      };
    case "card":
      return {
        variant: undefined,
      };
    case "cta_group":
      return {
        layout: undefined,
        gap: undefined,
        align: undefined,
      };
    case "divider":
      return {
        tone: undefined,
      };
    case "spacer":
      return {
        size: "m",
      };
  }
}

export function NodeLayoutPresetGrid({
  kind,
  onApply,
}: {
  kind: AdvancedEditableBuilderNode["kind"];
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const presets = nodeLayoutPresetsFor(kind);
  if (presets.length === 0) return null;

  return (
    <InspectorLayoutPresetCards
      value={undefined}
      onChange={(id) => {
        const preset = presets.find((p) => p.id === id);
        if (preset) onApply(preset.patch);
      }}
      options={presets.map((preset) => ({
        value: preset.id,
        title: preset.label,
        description: preset.description,
      }))}
    />
  );
}
