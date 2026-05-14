"use client";

/**
 * LayoutPanel — shared Layout tab for every section type.
 *
 * Implements builder-experience.html surface §2 (Inspector Layout tab).
 * Last reconciled: 2026-04-25.
 *
 * Reads/writes the platform `presentation` sub-schema: container width,
 * padding, alignment, mobile stack, visibility. Every section inherits
 * these via `sectionPresentationSchema`, so the panel works uniformly
 * regardless of type.
 *
 * Why Segmented chips and icon buttons rather than `<select>`:
 *   The presentation schema is finite-enum-only (e.g. paddingTop is one of
 *   five values). A pill-row makes the available choices and the active
 *   one legible at a glance — far better than a hidden dropdown the
 *   operator has to open to remember what's possible. The previous
 *   select-only build ("1995 website" — operator feedback, 2026-04-25)
 *   was the entire reason for the Phase B inspector pass.
 *
 * Patches (not whole values) are emitted — InspectorDock's
 * `handlePresentationPatch` merges into draftProps.presentation and
 * strips empty keys so the server treats them as "unset → theme default"
 * instead of invalid enum values. Selecting the active chip a second
 * time clears the field back to inherited.
 */

import {
  BREAKPOINT_LABELS,
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
  type CustomLength,
} from "@/lib/site-admin/sections/shared/presentation";
import type {
  BuilderAccordionNode,
  BuilderCardNode,
  BuilderCarouselNode,
  BuilderContainerNode,
  BuilderCtaGroupNode,
  BuilderDividerNode,
  BuilderMasonryNode,
  BuilderNode,
  BuilderNodeTree,
  BuilderSpacerNode,
  BuilderSplitNode,
  BuilderTabsNode,
} from "@/lib/site-admin/builder-node";
import {
  getBuilderNodeLayoutFindings,
  isBlockingLayoutFindingId,
  type BuilderNodeLayoutFinding,
} from "@/lib/site-admin/builder-node/layout-health";

import { useEffect, useMemo, useState, type ReactElement } from "react";

import { useEditContext } from "../edit-context";
import { NumberUnit, type LengthUnit } from "../kit/number-unit";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import { CHROME } from "../kit/tokens";

const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.10em] text-zinc-500";
const HINT = "text-[10.5px] leading-tight text-zinc-500";
const INHERIT_HINT = "text-[10.5px] text-zinc-400";

interface LayoutPanelProps {
  presentation: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  onDeepPatch?: (patch: Record<string, unknown>) => void;
}

// Short pill labels — full descriptors live in PRESENTATION_OPTIONS for the
// dropdown shape but don't fit in chips. Keep these aligned with the enum
// values declared in `sectionPresentationSchema`; an unknown value falls
// back to the long label.
const SHORT_LABELS: Record<string, Record<string, string>> = {
  containerWidth: {
    narrow: "Narrow",
    standard: "Standard",
    wide: "Wide",
    editorial: "Editorial",
    "full-bleed": "Full",
  },
  paddingTop: {
    none: "None",
    tight: "Tight",
    standard: "Standard",
    airy: "Airy",
    editorial: "XL",
  },
  paddingBottom: {
    none: "None",
    tight: "Tight",
    standard: "Standard",
    airy: "Airy",
    editorial: "XL",
  },
  mobileStack: {
    default: "Stack",
    "single-column": "Single col",
    "horizontal-scroll": "Scroll",
  },
};

// Icon glyphs — used for chip-row affordances where iconography reads
// faster than copy (alignment, visibility, mobile layout).
const AlignLeftIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="17" y1="10" x2="3" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="17" y1="18" x2="3" y2="18" />
  </svg>
);
const AlignCenterIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="18" y1="10" x2="6" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="18" y1="18" x2="6" y2="18" />
  </svg>
);
const AlignRightIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="21" y1="10" x2="7" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="21" y1="18" x2="7" y2="18" />
  </svg>
);
const StackIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="4" y="3" width="16" height="5" rx="1" />
    <rect x="4" y="11" width="16" height="5" rx="1" />
    <rect x="4" y="19" width="16" height="2" rx="1" />
  </svg>
);
const SingleColIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="9" y="3" width="6" height="18" rx="1" />
  </svg>
);
const ScrollIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="6" width="6" height="12" rx="1" />
    <rect x="10" y="6" width="6" height="12" rx="1" />
    <line x1="20" y1="9" x2="22" y2="9" />
    <line x1="20" y1="15" x2="22" y2="15" />
  </svg>
);
const EyeIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const DesktopIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const MobileIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <line x1="11" y1="18" x2="13" y2="18" />
  </svg>
);
const HiddenIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a19.77 19.77 0 015.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a19.86 19.86 0 01-3.18 4.18" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const VISIBILITY_ICONS: Record<string, () => ReactElement> = {
  always: EyeIcon,
  "desktop-only": DesktopIcon,
  "mobile-only": MobileIcon,
  hidden: HiddenIcon,
};

const MOBILE_STACK_ICONS: Record<string, () => ReactElement> = {
  default: StackIcon,
  "single-column": SingleColIcon,
  "horizontal-scroll": ScrollIcon,
};

const ALIGN_ICONS: Record<string, () => ReactElement> = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
};

/**
 * LengthRow — token chip group with a "Custom" disclosure that swaps in
 * a NumberUnit. Implements the token-default + pixel-escape pattern from
 * Phase 1 of the page-builder vision: tokens stay the default, raw pixels
 * are one click away. When a custom value is set, the chip row hides
 * (the renderer omits the data-attr so inline style wins).
 */
interface LengthRowProps {
  label: string;
  /** Token enum value ("standard", "airy", etc.). */
  tokenValue: string;
  /** Custom length value, or null/undefined when unset. */
  customValue: CustomLength | null | undefined;
  /** Token chip options. */
  tokenOptions: ReadonlyArray<SegmentedOption<string>>;
  /** Allowed units for the custom picker. */
  units?: readonly LengthUnit[];
  defaultUnit?: LengthUnit;
  onTokenChange: (next: string) => void;
  onCustomChange: (next: CustomLength | null) => void;
}

function LengthRow({
  label,
  tokenValue,
  customValue,
  tokenOptions,
  units,
  defaultUnit,
  onTokenChange,
  onCustomChange,
}: LengthRowProps) {
  // Auto-open custom mode if a custom value is already set.
  const [customOpen, setCustomOpen] = useState<boolean>(
    Boolean(customValue),
  );
  // QA 2026-05-13 — useState initializer only runs on mount, so when
  // the parent section changed (different section selected, different
  // `customValue` prop) the local `customOpen` stayed at the previous
  // section's value. Operators saw stale Custom/Token mode on every
  // new selection. Sync via effect so the open-state tracks the
  // incoming customValue prop.
  useEffect(() => {
    setCustomOpen(Boolean(customValue));
  }, [customValue]);
  const isCustom = customOpen || Boolean(customValue);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={FIELD_LABEL}>{label}</span>
        <button
          type="button"
          onClick={() => {
            if (isCustom) {
              // Switch back to tokens — clear the custom override.
              onCustomChange(null);
              setCustomOpen(false);
            } else {
              setCustomOpen(true);
            }
          }}
          className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
          style={{
            background: "transparent",
            border: "none",
            color: isCustom ? CHROME.blue : CHROME.muted,
            padding: 0,
          }}
        >
          {isCustom ? "Use tokens" : "Custom"}
        </button>
      </div>
      {isCustom ? (
        <NumberUnit
          value={customValue ?? null}
          onChange={onCustomChange}
          units={units}
          defaultUnit={defaultUnit ?? units?.[0]}
          step={4}
          min={0}
          placeholder="0"
        />
      ) : (
        <Segmented
          fullWidth
          compact
          value={tokenValue}
          onChange={onTokenChange}
          options={tokenOptions}
        />
      )}
    </div>
  );
}

const SPACING_UNITS: readonly LengthUnit[] = ["px", "rem", "em"];
const CONTAINER_UNITS: readonly LengthUnit[] = ["px", "rem", "%", "vw"];
const NODE_LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "stack", label: "Stack" },
  { value: "row", label: "Row" },
  { value: "grid", label: "Grid" },
];
const NODE_GAP_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];
const NODE_ALIGN_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];
const GRID_COLUMNS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];
const SPLIT_RATIO_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "50-50", label: "50 / 50" },
  { value: "40-60", label: "40 / 60" },
  { value: "60-40", label: "60 / 40" },
  { value: "30-70", label: "30 / 70" },
  { value: "70-30", label: "70 / 30" },
];
const CAROUSEL_AUTOPLAY_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Off" },
  { value: "3000", label: "3s" },
  { value: "6000", label: "6s" },
  { value: "9000", label: "9s" },
  { value: "12000", label: "12s" },
];
const CAROUSEL_SLIDES_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];
const MASONRY_COLUMNS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];
const SPACER_SIZE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];
type NodeLayoutPreset<T extends AdvancedEditableBuilderNode["kind"]> = {
  id: string;
  label: string;
  description: string;
  kind: T;
  patch: Extract<AdvancedEditableBuilderNode, { kind: T }>["props"];
};
type AnyNodeLayoutPreset =
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
const SECTION_SPACING_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  paddingTop?: string;
  paddingBottom?: string;
}> = [
  {
    id: "compact",
    label: "Compact",
    description: "Tight vertical rhythm for dense utility pages.",
    paddingTop: "tight",
    paddingBottom: "tight",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Default editorial breathing room.",
    paddingTop: "standard",
    paddingBottom: "standard",
  },
  {
    id: "feature",
    label: "Feature",
    description: "Larger lead-in and close-out spacing.",
    paddingTop: "airy",
    paddingBottom: "airy",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Maximum premium whitespace.",
    paddingTop: "editorial",
    paddingBottom: "editorial",
  },
  {
    id: "flush",
    label: "Flush",
    description: "Remove vertical padding for embedded layouts.",
    paddingTop: "none",
    paddingBottom: "none",
  },
];
type ResponsiveSpacingTarget = "tablet" | "mobile";
const RESPONSIVE_SPACING_TARGETS: ReadonlyArray<ResponsiveSpacingTarget> = [
  "tablet",
  "mobile",
];

type AdvancedEditableBuilderNode =
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

type ContainerResponsiveViewport = "tablet" | "mobile";

function findBuilderNodeById(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode | null {
  if (!nodeId) return null;
  const walk = (nodes: BuilderNodeTree): BuilderNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children);
        if (nested) return nested;
      }
    }
    return null;
  };
  return walk(tree);
}

function nodeKindLabel(kind: AdvancedEditableBuilderNode["kind"]): string {
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

function cleanContainerResponsive(
  responsive: BuilderContainerNode["props"]["responsive"] | undefined,
) {
  if (!responsive) return undefined;
  const next: NonNullable<BuilderContainerNode["props"]["responsive"]> = {};
  for (const viewport of ["tablet", "mobile"] as const) {
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

function nodeLayoutPresetsFor(
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

function nodeLayoutResetPatch(
  node: AdvancedEditableBuilderNode,
): Record<string, unknown> {
  switch (node.kind) {
    case "container":
      return {
        layout: "stack",
        gap: "m",
        columns: undefined,
        align: "stretch",
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

function NodeLayoutPresetGrid({
  kind,
  onApply,
}: {
  kind: AdvancedEditableBuilderNode["kind"];
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const presets = nodeLayoutPresetsFor(kind);
  if (presets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className={FIELD_LABEL}>Quick layouts</span>
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-builder-node-layout-preset={preset.id}
            onClick={() => onApply(preset.patch)}
            className="cursor-pointer text-left transition-colors"
            style={{
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 6,
              padding: "8px 9px",
              color: CHROME.ink,
            }}
          >
            <span className="block text-[11.5px] font-semibold">
              {preset.label}
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-tight text-zinc-500">
              {preset.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2"
      style={{
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
      }}
    >
      <span className="flex flex-col">
        <span className="text-[11.5px] font-semibold text-zinc-700">{label}</span>
        <span className="text-[10.5px] text-zinc-500">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer"
      />
    </label>
  );
}

function LayoutHealthCard({
  findings,
  onApply,
}: {
  findings: ReadonlyArray<BuilderNodeLayoutFinding>;
  onApply: (patch: Record<string, unknown>) => void;
}) {
  const orderedFindings = [...findings].sort((a, b) => {
    const rank = (finding: BuilderNodeLayoutFinding): number => {
      if (isBlockingLayoutFindingId(finding.id)) return 0;
      if (finding.level === "warning") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  const blockingCount = orderedFindings.filter((finding) =>
    isBlockingLayoutFindingId(finding.id),
  ).length;
  const warningCount = orderedFindings.filter(
    (finding) => !isBlockingLayoutFindingId(finding.id) && finding.level === "warning",
  ).length;
  const recommendationCount = orderedFindings.length - blockingCount - warningCount;

  if (orderedFindings.length === 0) {
    return (
      <div
        data-builder-node-layout-health="ok"
        className="rounded-md px-3 py-2"
        style={{
          background: "rgba(16, 185, 129, 0.08)",
          border: "1px solid rgba(16, 185, 129, 0.22)",
        }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
          Layout checks
        </div>
        <p className="mt-1 text-[11px] leading-snug text-emerald-700">
          No obvious responsive layout issues found for this node.
        </p>
      </div>
    );
  }

  return (
    <div
      data-builder-node-layout-health="findings"
      className="flex flex-col gap-2 rounded-md p-3"
      style={{ background: CHROME.paper, border: `1px solid ${CHROME.line}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>Layout checks</span>
        <span className={INHERIT_HINT}>
          {blockingCount > 0 ? `${blockingCount} blocker${blockingCount === 1 ? "" : "s"}` : null}
          {blockingCount > 0 && (warningCount > 0 || recommendationCount > 0)
            ? " · "
            : null}
          {warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : null}
          {warningCount > 0 && recommendationCount > 0 ? " · " : null}
          {recommendationCount > 0
            ? `${recommendationCount} recommendation${recommendationCount === 1 ? "" : "s"}`
            : null}
          {blockingCount === 0 && warningCount === 0 && recommendationCount === 0
            ? "No findings"
            : null}
        </span>
      </div>
      {blockingCount > 0 ? (
        <div
          data-builder-node-layout-blockers={blockingCount}
          className="rounded-md px-2.5 py-2"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-red-700">
            Publish blockers
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug text-red-700">
            {blockingCount} layout issue{blockingCount === 1 ? "" : "s"} should be
            fixed before publish.
          </p>
        </div>
      ) : null}
      {orderedFindings.map((finding) => (
        <div
          key={finding.id}
          data-builder-node-layout-finding={finding.id}
          className="rounded-md px-2.5 py-2"
          style={{
            background: isBlockingLayoutFindingId(finding.id)
              ? "rgba(239, 68, 68, 0.08)"
              : finding.level === "warning"
                ? "rgba(245, 158, 11, 0.10)"
                : "rgba(59, 130, 246, 0.08)",
            border: isBlockingLayoutFindingId(finding.id)
              ? "1px solid rgba(239, 68, 68, 0.26)"
              : finding.level === "warning"
                ? "1px solid rgba(245, 158, 11, 0.28)"
                : "1px solid rgba(59, 130, 246, 0.18)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div
                className="text-[9.5px] font-semibold uppercase tracking-[0.11em]"
                style={{
                  color: isBlockingLayoutFindingId(finding.id)
                    ? "rgb(185, 28, 28)"
                    : finding.level === "warning"
                      ? "rgb(161, 98, 7)"
                      : "rgb(30, 64, 175)",
                }}
              >
                {isBlockingLayoutFindingId(finding.id)
                  ? "Publish blocker"
                  : finding.level === "warning"
                    ? "Warning"
                    : "Recommendation"}
              </div>
              <div className="text-[11px] font-semibold text-zinc-800">
                {finding.title}
              </div>
              <p className="mt-0.5 text-[10.5px] leading-snug text-zinc-500">
                {finding.message}
              </p>
            </div>
            {finding.quickFixPatch && finding.quickFixLabel ? (
              <button
                type="button"
                data-builder-node-layout-fix={finding.id}
                onClick={() => onApply(finding.quickFixPatch!)}
                className="shrink-0 cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                style={{
                  background: "transparent",
                  border: "none",
                  color: CHROME.muted,
                  padding: 0,
                }}
              >
                {finding.quickFixLabel}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContainerResponsiveEditor({
  viewport,
  value,
  onPatch,
}: {
  viewport: ContainerResponsiveViewport;
  value: NonNullable<BuilderContainerNode["props"]["responsive"]>[ContainerResponsiveViewport];
  onPatch: (
    key: "layout" | "gap" | "columns" | "align",
    next: string | number | undefined,
  ) => void;
}) {
  const label = viewport === "tablet" ? "Tablet" : "Mobile";

  return (
    <div
      className="flex flex-col gap-2 rounded-md p-3"
      style={{ background: CHROME.paper, border: `1px solid ${CHROME.line}` }}
    >
      <div className="flex items-center justify-between">
        <span className={FIELD_LABEL}>{label}</span>
        <span className={INHERIT_HINT}>
          {value ? "Override active" : "Inherit desktop"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Layout</span>
        <Segmented
          fullWidth
          compact
          value={value?.layout ?? ""}
          onChange={(next) => onPatch("layout", next || undefined)}
          options={[{ value: "", label: "Inherit" }, ...NODE_LAYOUT_OPTIONS]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Gap</span>
          <Segmented
            fullWidth
            compact
            value={value?.gap ?? ""}
            onChange={(next) => onPatch("gap", next || undefined)}
            options={[{ value: "", label: "Auto" }, ...NODE_GAP_OPTIONS]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Align</span>
          <Segmented
            fullWidth
            compact
            value={value?.align ?? ""}
            onChange={(next) => onPatch("align", next || undefined)}
            options={[{ value: "", label: "Auto" }, ...NODE_ALIGN_OPTIONS]}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Columns</span>
        <Segmented
          fullWidth
          compact
          value={String(value?.columns ?? "")}
          onChange={(next) =>
            onPatch("columns", next ? Number.parseInt(next, 10) : undefined)
          }
          options={[{ value: "", label: "Auto" }, ...GRID_COLUMNS_OPTIONS]}
        />
      </div>
    </div>
  );
}

function AdvancedNodeLayoutEditor({
  node,
  onPatch,
}: {
  node: AdvancedEditableBuilderNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const resetNodeLayout = () => onPatch(nodeLayoutResetPatch(node));

  if (node.kind === "container") {
    const responsive = node.props.responsive;
    const patchResponsive = (
      viewport: ContainerResponsiveViewport,
      key: "layout" | "gap" | "columns" | "align",
      next: string | number | undefined,
    ) => {
      const nextResponsive: NonNullable<BuilderContainerNode["props"]["responsive"]> = {
        ...(responsive ?? {}),
        [viewport]: {
          ...(responsive?.[viewport] ?? {}),
          [key]: next,
        },
      };
      onPatch({ responsive: cleanContainerResponsive(nextResponsive) });
    };

    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="container">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <NodeLayoutPresetGrid kind={node.kind} onApply={onPatch} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Layout</span>
            <Segmented
              fullWidth
              compact
              value={node.props.layout}
              onChange={(next) => onPatch({ layout: next })}
              options={NODE_LAYOUT_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Gap</span>
            <Segmented
              fullWidth
              compact
              value={node.props.gap ?? "m"}
              onChange={(next) => onPatch({ gap: next })}
              options={NODE_GAP_OPTIONS}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Columns</span>
            <Segmented
              fullWidth
              compact
              value={String(node.props.columns ?? "")}
              onChange={(next) =>
                onPatch({
                  columns:
                    node.props.layout === "grid" && next
                      ? Number.parseInt(next, 10)
                      : undefined,
                })
              }
              options={
                node.props.layout === "grid"
                  ? GRID_COLUMNS_OPTIONS
                  : [{ value: "", label: "Only for grid" }]
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Align</span>
            <Segmented
              fullWidth
              compact
              value={node.props.align ?? "stretch"}
              onChange={(next) => onPatch({ align: next })}
              options={NODE_ALIGN_OPTIONS}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL}>Responsive overrides</span>
            {responsive ? (
              <button
                type="button"
                data-builder-node-responsive-reset=""
                onClick={() => onPatch({ responsive: undefined })}
                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                style={{
                  background: "transparent",
                  border: "none",
                  color: CHROME.muted,
                  padding: 0,
                }}
              >
                Clear
              </button>
            ) : (
              <span className={INHERIT_HINT}>Desktop only</span>
            )}
          </div>
          <ContainerResponsiveEditor
            viewport="tablet"
            value={responsive?.tablet}
            onPatch={(key, next) => patchResponsive("tablet", key, next)}
          />
          <ContainerResponsiveEditor
            viewport="mobile"
            value={responsive?.mobile}
            onPatch={(key, next) => patchResponsive("mobile", key, next)}
          />
        </div>
      </div>
    );
  }

  if (node.kind === "split") {
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="split">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <NodeLayoutPresetGrid kind={node.kind} onApply={onPatch} />
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Column ratio</span>
          <Segmented
            fullWidth
            compact
            value={node.props.ratio ?? "50-50"}
            onChange={(next) => onPatch({ ratio: next })}
            options={SPLIT_RATIO_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Gap</span>
          <Segmented
            fullWidth
            compact
            value={node.props.gap ?? "m"}
            onChange={(next) => onPatch({ gap: next })}
            options={NODE_GAP_OPTIONS}
          />
        </div>
        <ToggleRow
          label="Collapse on mobile"
          hint="Stack the two columns vertically on mobile."
          checked={node.props.collapseOnMobile !== false}
          onChange={(next) => onPatch({ collapseOnMobile: next ? undefined : false })}
        />
      </div>
    );
  }

  if (node.kind === "accordion") {
    const defaultOpenItemIds = new Set(node.props.defaultOpenItemIds ?? []);
    const items = node.children.filter(
      (child): child is BuilderAccordionNode["children"][number] & { kind: "accordion_item" } =>
        child.kind === "accordion_item",
    );
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="accordion">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <ToggleRow
          label="Allow multiple open"
          hint="Visitors can expand more than one item at the same time."
          checked={Boolean(node.props.allowMultiple)}
          onChange={(next) => onPatch({ allowMultiple: next || undefined })}
        />
        {items.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className={FIELD_LABEL}>Default open items</span>
            {items.map((item) => {
              const checked = defaultOpenItemIds.has(item.id);
              return (
                <label
                  key={item.id}
                  className="flex items-center justify-between rounded-md px-2.5 py-2"
                  style={{
                    background: CHROME.paper,
                    border: `1px solid ${CHROME.line}`,
                  }}
                >
                  <span className="text-[11.5px] text-zinc-700">{item.props.title}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(defaultOpenItemIds);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      onPatch({
                        defaultOpenItemIds:
                          next.size > 0 ? Array.from(next) : undefined,
                      });
                    }}
                    className="h-4 w-4 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        ) : (
          <span className={HINT}>Add accordion items in Structure to define defaults.</span>
        )}
      </div>
    );
  }

  if (node.kind === "tabs") {
    const panels = node.children.filter(
      (child): child is BuilderTabsNode["children"][number] & { kind: "tab_panel" } =>
        child.kind === "tab_panel",
    );
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="tabs">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        {panels.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Default tab</span>
            <select
              value={node.props.defaultTabId ?? ""}
              onChange={(e) =>
                onPatch({ defaultTabId: e.target.value || undefined })
              }
              className="w-full px-2"
              style={{
                height: 30,
                fontSize: 12.5,
                background: CHROME.surface2,
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 6,
                color: CHROME.ink,
                outline: "none",
              }}
            >
              <option value="">First tab</option>
              {panels.map((panel) => (
                <option key={panel.id} value={panel.id}>
                  {panel.props.title}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className={HINT}>Add tab panels in Structure to choose a default tab.</span>
        )}
      </div>
    );
  }

  if (node.kind === "carousel") {
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="carousel">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <NodeLayoutPresetGrid kind={node.kind} onApply={onPatch} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Slides per view</span>
            <Segmented
              fullWidth
              compact
              value={String(node.props.slidesPerView ?? "2")}
              onChange={(next) =>
                onPatch({ slidesPerView: Number.parseInt(next, 10) })
              }
              options={CAROUSEL_SLIDES_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Autoplay</span>
            <Segmented
              fullWidth
              compact
              value={String(node.props.autoplayMs ?? "")}
              onChange={(next) =>
                onPatch({
                  autoplayMs: next ? Number.parseInt(next, 10) : undefined,
                })
              }
              options={CAROUSEL_AUTOPLAY_OPTIONS}
            />
          </div>
        </div>
        <ToggleRow
          label="Loop slides"
          hint="Wrap from the last slide back to the first."
          checked={Boolean(node.props.loop)}
          onChange={(next) => onPatch({ loop: next || undefined })}
        />
        <ToggleRow
          label="Show arrows"
          hint="Render previous and next arrow controls."
          checked={Boolean(node.props.showArrows)}
          onChange={(next) => onPatch({ showArrows: next || undefined })}
        />
        <ToggleRow
          label="Show dots"
          hint="Render pagination dots below the slider."
          checked={Boolean(node.props.showDots)}
          onChange={(next) => onPatch({ showDots: next || undefined })}
        />
      </div>
    );
  }

  if (node.kind === "masonry") {
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="masonry">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <NodeLayoutPresetGrid kind={node.kind} onApply={onPatch} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Columns</span>
            <Segmented
              fullWidth
              compact
              value={String(node.props.columns ?? "3")}
              onChange={(next) => onPatch({ columns: Number.parseInt(next, 10) })}
              options={MASONRY_COLUMNS_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Gap</span>
            <Segmented
              fullWidth
              compact
              value={node.props.gap ?? "m"}
              onChange={(next) => onPatch({ gap: next })}
              options={NODE_GAP_OPTIONS}
            />
          </div>
        </div>
      </div>
    );
  }

  if (node.kind === "card") {
    const CARD_VARIANT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
      { value: "elevated", label: "Elevated" },
      { value: "outline", label: "Outline" },
      { value: "ghost", label: "Ghost" },
    ];
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="card">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Surface</span>
          <Segmented
            fullWidth
            compact
            value={node.props.variant ?? "elevated"}
            onChange={(next) =>
              onPatch({
                variant: next === "elevated" ? undefined : (next as "outline" | "ghost"),
              })
            }
            options={CARD_VARIANT_OPTIONS}
          />
        </div>
      </div>
    );
  }

  if (node.kind === "cta_group") {
    const CTA_LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
      { value: "row", label: "Row" },
      { value: "stack", label: "Stack" },
    ];
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="cta_group">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Layout</span>
            <Segmented
              fullWidth
              compact
              value={node.props.layout ?? "row"}
              onChange={(next) =>
                onPatch({
                  layout: next === "row" ? undefined : (next as "stack"),
                })
              }
              options={CTA_LAYOUT_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Gap</span>
            <Segmented
              fullWidth
              compact
              value={node.props.gap ?? "m"}
              onChange={(next) =>
                onPatch({
                  gap: next === "m" ? undefined : (next as "s" | "l"),
                })
              }
              options={NODE_GAP_OPTIONS}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Align</span>
          <Segmented
            fullWidth
            compact
            value={node.props.align ?? "center"}
            onChange={(next) =>
              onPatch({
                align: next === "center" ? undefined : (next as "start" | "end" | "stretch"),
              })
            }
            options={NODE_ALIGN_OPTIONS}
          />
        </div>
      </div>
    );
  }

  if (node.kind === "divider") {
    const DIVIDER_TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
      { value: "default", label: "Default" },
      { value: "muted", label: "Muted" },
    ];
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="divider">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Divider tone</span>
          <Segmented
            fullWidth
            compact
            value={node.props.tone ?? "default"}
            onChange={(next) =>
              onPatch({
                tone: next === "default" ? undefined : (next as "muted"),
              })
            }
            options={DIVIDER_TONE_OPTIONS}
          />
        </div>
      </div>
    );
  }

  if (node.kind === "spacer") {
    return (
      <div className="flex flex-col gap-3" data-builder-node-layout-panel="spacer">
        <div className="flex justify-end">
          <button
            type="button"
            data-builder-node-layout-reset=""
            onClick={resetNodeLayout}
            className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
            style={{
              background: "transparent",
              border: "none",
              color: CHROME.muted,
              padding: 0,
            }}
          >
            Reset node
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Spacer size</span>
        <Segmented
          fullWidth
          compact
          value={node.props.size}
          onChange={(next) => onPatch({ size: next })}
          options={SPACER_SIZE_OPTIONS}
        />
        </div>
      </div>
    );
  }

  return null;
}

export function LayoutPanel({
  presentation,
  onPatch,
  onDeepPatch,
}: LayoutPanelProps) {
const {
    builderTree,
    selectedBuilderNodeId,
    patchBuilderNodeProps,
    reportMutationError,
    device,
    setDevice,
  } = useEditContext();
  const val = (key: string): string =>
    (presentation[key] as string | undefined) ?? "";

  const customVal = (key: string): CustomLength | null => {
    const v = presentation[key] as CustomLength | undefined;
    return v ?? null;
  };

  /**
   * Toggle pattern: clicking the active chip clears the field back to
   * `undefined` (= inherit theme default). Clicking an inactive chip
   * sets it. This avoids needing a separate "Clear" button per row and
   * matches the mockup's progressive-disclosure feel.
   */
  function setOrToggle(key: string, next: string) {
    const current = val(key);
    onPatch({ [key]: current === next ? undefined : next });
  }

  function shortLabel(key: string, value: string): string {
    return (
      SHORT_LABELS[key]?.[value] ??
      PRESENTATION_OPTIONS[key as keyof typeof PRESENTATION_OPTIONS]?.find(
        (o) => o.value === value,
      )?.label ??
      value
    );
  }

  function chipOptions(
    key: string,
  ): ReadonlyArray<SegmentedOption<string>> {
    const opts =
      PRESENTATION_OPTIONS[key as keyof typeof PRESENTATION_OPTIONS] ?? [];
    return opts.map((o) => ({
      value: o.value,
      label: shortLabel(key, o.value),
    }));
  }

  function iconOptions(
    key: string,
    icons: Record<string, () => ReactElement>,
  ): ReadonlyArray<SegmentedOption<string>> {
    const opts =
      PRESENTATION_OPTIONS[key as keyof typeof PRESENTATION_OPTIONS] ?? [];
    return opts.map((o) => {
      const Icon = icons[o.value];
      return {
        value: o.value,
        label: Icon ? <Icon /> : shortLabel(key, o.value),
      };
    });
  }

  const containerValue = val("containerWidth");
  const padTopValue = val("paddingTop");
  const padBottomValue = val("paddingBottom");
  const alignValue = val("align");
  const mobileStackValue = val("mobileStack");
  const visibilityValue = val("visibility");
  const responsiveSpacingTarget: ResponsiveSpacingTarget =
    device === "tablet" || device === "mobile" ? device : "mobile";
  const breakpointOverrides =
    (presentation.breakpoints as
      | Partial<Record<ResponsiveSpacingTarget, Record<string, unknown>>>
      | undefined) ?? {};
  const responsiveSpacingOverride =
    breakpointOverrides[responsiveSpacingTarget] ?? {};
  const responsivePadTop =
    (responsiveSpacingOverride.paddingTop as string | undefined) ?? "";
  const responsivePadBottom =
    (responsiveSpacingOverride.paddingBottom as string | undefined) ?? "";
  const responsiveContainerWidth =
    (responsiveSpacingOverride.containerWidth as string | undefined) ?? "";
  const responsiveAlign =
    (responsiveSpacingOverride.align as string | undefined) ?? "";
  const hasResponsiveLayoutOverride =
    Boolean(responsivePadTop) ||
    Boolean(responsivePadBottom) ||
    Boolean(responsiveContainerWidth) ||
    Boolean(responsiveAlign);
  const spacingCustomKeys = [
    "paddingTopCustom",
    "paddingBottomCustom",
    "paddingLeftCustom",
    "paddingRightCustom",
    "marginTopCustom",
    "marginBottomCustom",
  ] as const;
  const hasSpacingOverride =
    Boolean(padTopValue) ||
    Boolean(padBottomValue) ||
    spacingCustomKeys.some((key) => Boolean(customVal(key)));
  const applySpacingPreset = (
    preset: (typeof SECTION_SPACING_PRESETS)[number],
  ) => {
    onPatch({
      paddingTop: preset.paddingTop,
      paddingBottom: preset.paddingBottom,
      paddingTopCustom: undefined,
      paddingBottomCustom: undefined,
      paddingLeftCustom: undefined,
      paddingRightCustom: undefined,
    });
  };
  const resetSpacing = () => {
    onPatch({
      paddingTop: undefined,
      paddingBottom: undefined,
      paddingTopCustom: undefined,
      paddingBottomCustom: undefined,
      paddingLeftCustom: undefined,
      paddingRightCustom: undefined,
      marginTopCustom: undefined,
      marginBottomCustom: undefined,
    });
  };
  const applyResponsiveSpacingPreset = (
    preset: (typeof SECTION_SPACING_PRESETS)[number],
  ) => {
    onDeepPatch?.({
      breakpoints: {
        [responsiveSpacingTarget]: {
          paddingTop: preset.paddingTop,
          paddingBottom: preset.paddingBottom,
        },
      },
    });
  };
  const resetResponsiveSpacing = () => {
    onDeepPatch?.({
      breakpoints: {
        [responsiveSpacingTarget]: {
          paddingTop: undefined,
          paddingBottom: undefined,
          containerWidth: undefined,
          align: undefined,
        },
      },
    });
  };
  const setResponsiveLayoutField = (
    key: "containerWidth" | "align",
    next: string,
  ) => {
    const current =
      key === "containerWidth" ? responsiveContainerWidth : responsiveAlign;
    onDeepPatch?.({
      breakpoints: {
        [responsiveSpacingTarget]: {
          [key]: current === next ? undefined : next,
        },
      },
    });
  };
  const selectedBuilderNode = useMemo(() => {
    const resolved = findBuilderNodeById(builderTree, selectedBuilderNodeId);
    if (!resolved) return null;
    switch (resolved.kind) {
      case "container":
      case "card":
      case "cta_group":
      case "split":
      case "accordion":
      case "tabs":
      case "carousel":
      case "masonry":
      case "divider":
      case "spacer":
        return resolved;
      default:
        return null;
    }
  }, [builderTree, selectedBuilderNodeId]);
  const selectedBuilderNodeFindings = useMemo(
    () =>
      selectedBuilderNode
        ? getBuilderNodeLayoutFindings(selectedBuilderNode)
        : [],
    [selectedBuilderNode],
  );
  const commitBuilderNodePatch = async (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => {
    const result = await patchBuilderNodeProps(nodeId, patch);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {selectedBuilderNode ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className={SECTION_TITLE}>Selected node</div>
            <span className={INHERIT_HINT}>
              {nodeKindLabel(selectedBuilderNode.kind)}
            </span>
          </div>
          <div
            className="flex flex-col gap-3 rounded-md p-3"
            style={{
              background: CHROME.surface2,
              border: `1px solid ${CHROME.line}`,
            }}
          >
            <LayoutHealthCard
              findings={selectedBuilderNodeFindings}
              onApply={(patch) => {
                void commitBuilderNodePatch(selectedBuilderNode.id, patch);
              }}
            />
            <AdvancedNodeLayoutEditor
              node={selectedBuilderNode}
              onPatch={(patch) => {
                void commitBuilderNodePatch(selectedBuilderNode.id, patch);
              }}
            />
          </div>
        </section>
      ) : null}

      {/* ── Container ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Container</div>
          {!containerValue && !customVal("containerWidthCustom") ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <LengthRow
          label={PRESENTATION_FIELD_LABELS.containerWidth}
          tokenValue={containerValue}
          customValue={customVal("containerWidthCustom")}
          tokenOptions={chipOptions("containerWidth")}
          units={CONTAINER_UNITS}
          defaultUnit="px"
          onTokenChange={(next) => setOrToggle("containerWidth", next)}
          onCustomChange={(next) =>
            onPatch({ containerWidthCustom: next ?? undefined })
          }
        />
      </section>

      {/* ── Spacing ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Padding</div>
          {!hasSpacingOverride ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : (
            <button
              type="button"
              onClick={resetSpacing}
              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
              style={{
                background: "transparent",
                border: "none",
                color: CHROME.muted,
                padding: 0,
              }}
            >
              Reset spacing
            </button>
          )}
        </div>
        <div
          className="rounded-md p-3"
          style={{
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className={FIELD_LABEL}>Presets</span>
                <span className={INHERIT_HINT}>Clears custom L/R</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SECTION_SPACING_PRESETS.map((preset) => {
                  const selectedPreset =
                    padTopValue === preset.paddingTop &&
                    padBottomValue === preset.paddingBottom &&
                    !customVal("paddingTopCustom") &&
                    !customVal("paddingBottomCustom") &&
                    !customVal("paddingLeftCustom") &&
                    !customVal("paddingRightCustom");
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-layout-spacing-preset={preset.id}
                      aria-pressed={selectedPreset}
                      title={preset.description}
                      onClick={() => applySpacingPreset(preset)}
                      className="min-h-8 cursor-pointer px-2 text-left text-[11px] font-semibold"
                      style={{
                        background: selectedPreset ? CHROME.accent : CHROME.surface2,
                        border: `1px solid ${
                          selectedPreset ? CHROME.accent : CHROME.line
                        }`,
                        borderRadius: 6,
                        color: selectedPreset ? "#fff" : CHROME.text,
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <LengthRow
              label="Top"
              tokenValue={padTopValue}
              customValue={customVal("paddingTopCustom")}
              tokenOptions={chipOptions("paddingTop")}
              units={SPACING_UNITS}
              defaultUnit="px"
              onTokenChange={(next) => setOrToggle("paddingTop", next)}
              onCustomChange={(next) =>
                onPatch({ paddingTopCustom: next ?? undefined })
              }
            />
            <div
              className="rounded border-2 border-dashed py-3 text-center text-[10px] uppercase tracking-[0.12em]"
              style={{
                borderColor: CHROME.line,
                color: CHROME.muted2,
                background: CHROME.surface2,
              }}
              aria-hidden
            >
              Section content
            </div>
            <LengthRow
              label="Bottom"
              tokenValue={padBottomValue}
              customValue={customVal("paddingBottomCustom")}
              tokenOptions={chipOptions("paddingBottom")}
              units={SPACING_UNITS}
              defaultUnit="px"
              onTokenChange={(next) => setOrToggle("paddingBottom", next)}
              onCustomChange={(next) =>
                onPatch({ paddingBottomCustom: next ?? undefined })
              }
            />
            {/* Pixel-only L/R — no token equivalent; advanced control. */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Left</span>
                <NumberUnit
                  value={customVal("paddingLeftCustom")}
                  onChange={(next) =>
                    onPatch({ paddingLeftCustom: next ?? undefined })
                  }
                  units={SPACING_UNITS}
                  defaultUnit="px"
                  step={4}
                  min={0}
                  placeholder="—"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Right</span>
                <NumberUnit
                  value={customVal("paddingRightCustom")}
                  onChange={(next) =>
                    onPatch({ paddingRightCustom: next ?? undefined })
                  }
                  units={SPACING_UNITS}
                  defaultUnit="px"
                  step={4}
                  min={0}
                  placeholder="—"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {onDeepPatch ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className={SECTION_TITLE}>Responsive layout</div>
            {hasResponsiveLayoutOverride ? (
              <button
                type="button"
                onClick={resetResponsiveSpacing}
                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                style={{
                  background: "transparent",
                  border: "none",
                  color: CHROME.muted,
                  padding: 0,
                }}
              >
                Reset {BREAKPOINT_LABELS[responsiveSpacingTarget]}
              </button>
            ) : (
              <span className={INHERIT_HINT}>
                Inherits desktop
              </span>
            )}
          </div>
          <div
            className="rounded-md p-3"
            style={{
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
            }}
          >
            <div className="flex flex-col gap-3">
              <div
                className="inline-flex w-fit p-0.5"
                style={{
                  background: CHROME.surface2,
                  border: `1px solid ${CHROME.line}`,
                  borderRadius: 7,
                }}
              >
                {RESPONSIVE_SPACING_TARGETS.map((target) => {
                  const active = responsiveSpacingTarget === target;
                  const targetHasOverride = Boolean(
                    breakpointOverrides[target]?.paddingTop ||
                      breakpointOverrides[target]?.paddingBottom ||
                      breakpointOverrides[target]?.containerWidth ||
                      breakpointOverrides[target]?.align,
                  );
                  return (
                    <button
                      key={target}
                      type="button"
                      data-layout-responsive-target={target}
                      aria-pressed={active}
                      onClick={() => setDevice(target)}
                      className="relative rounded-[5px] px-3 py-1 text-[11px] font-semibold transition"
                      style={{
                        background: active ? CHROME.surface : "transparent",
                        color: active ? CHROME.ink : CHROME.muted,
                        boxShadow: active
                          ? "0 1px 3px rgba(0,0,0,0.08)"
                          : "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {BREAKPOINT_LABELS[target]}
                      {targetHasOverride ? (
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            right: 4,
                            top: 4,
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: CHROME.blue,
                          }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SECTION_SPACING_PRESETS.map((preset) => {
                  const selectedPreset =
                    responsivePadTop === preset.paddingTop &&
                    responsivePadBottom === preset.paddingBottom;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-layout-responsive-spacing-preset={preset.id}
                      aria-pressed={selectedPreset}
                      title={`${BREAKPOINT_LABELS[responsiveSpacingTarget]}: ${preset.description}`}
                      onClick={() => applyResponsiveSpacingPreset(preset)}
                      className="min-h-8 cursor-pointer px-2 text-left text-[11px] font-semibold"
                      style={{
                        background: selectedPreset ? CHROME.accent : CHROME.surface2,
                        border: `1px solid ${
                          selectedPreset ? CHROME.accent : CHROME.line
                        }`,
                        borderRadius: 6,
                        color: selectedPreset ? "#fff" : CHROME.text,
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex flex-col gap-1.5"
                  data-layout-responsive-container-control=""
                >
                  <span className={FIELD_LABEL}>Container</span>
                  <Segmented
                    fullWidth
                    compact
                    value={responsiveContainerWidth}
                    onChange={(next) =>
                      setResponsiveLayoutField("containerWidth", next)
                    }
                    options={chipOptions("containerWidth")}
                  />
                </div>
                <div
                  className="flex flex-col gap-1.5"
                  data-layout-responsive-align-control=""
                >
                  <span className={FIELD_LABEL}>Align</span>
                  <Segmented
                    compact
                    value={responsiveAlign}
                    onChange={(next) => setResponsiveLayoutField("align", next)}
                    options={iconOptions("align", ALIGN_ICONS)}
                  />
                </div>
              </div>
              <span className={HINT}>
                Applies only to {BREAKPOINT_LABELS[responsiveSpacingTarget]}.
                Desktop spacing stays untouched.
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Margin (pixel-only — no token equivalent) ────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Margin</div>
          {!customVal("marginTopCustom") && !customVal("marginBottomCustom") ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Top</span>
            <NumberUnit
              value={customVal("marginTopCustom")}
              onChange={(next) =>
                onPatch({ marginTopCustom: next ?? undefined })
              }
              units={SPACING_UNITS}
              defaultUnit="px"
              step={4}
              placeholder="—"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Bottom</span>
            <NumberUnit
              value={customVal("marginBottomCustom")}
              onChange={(next) =>
                onPatch({ marginBottomCustom: next ?? undefined })
              }
              units={SPACING_UNITS}
              defaultUnit="px"
              step={4}
              placeholder="—"
            />
          </div>
        </div>
      </section>

      {/* ── Composition (Phase 4) ────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Composition</div>
        </div>
        <label
          className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2"
          style={{
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
          }}
        >
          <span className="flex flex-col">
            <span className="text-[11.5px] font-semibold text-zinc-700">
              Full bleed
            </span>
            <span className="text-[10.5px] text-zinc-500">
              Escape the page container — touch viewport edges.
            </span>
          </span>
          <input
            type="checkbox"
            checked={Boolean(presentation.fullBleed)}
            onChange={(e) => onPatch({ fullBleed: e.target.checked || undefined })}
            className="h-4 w-4 cursor-pointer"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Overlap top</span>
            <NumberUnit
              value={customVal("overlapTop")}
              onChange={(next) => onPatch({ overlapTop: next ?? undefined })}
              units={SPACING_UNITS}
              defaultUnit="px"
              step={4}
              min={0}
              placeholder="—"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Overlap bottom</span>
            <NumberUnit
              value={customVal("overlapBottom")}
              onChange={(next) => onPatch({ overlapBottom: next ?? undefined })}
              units={SPACING_UNITS}
              defaultUnit="px"
              step={4}
              min={0}
              placeholder="—"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Sticky offset (px)</span>
          <input
            type="number"
            min={0}
            value={(presentation.stickyTop as number | undefined) ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onPatch({ stickyTop: undefined });
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) onPatch({ stickyTop: n });
            }}
            placeholder="—"
            className="w-full px-2"
            style={{
              height: 30,
              fontSize: 12.5,
              fontVariantNumeric: "tabular-nums",
              background: CHROME.surface2,
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 6,
              color: CHROME.ink,
              outline: "none",
            }}
          />
          <span className="text-[10.5px] text-zinc-400">
            Section sticks at this offset while you scroll past it.
          </span>
        </div>
      </section>

      {/* ── Alignment ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Alignment</div>
          {!alignValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            {PRESENTATION_FIELD_LABELS.align}
          </span>
          <Segmented
            compact
            value={alignValue}
            onChange={(next) => setOrToggle("align", next)}
            options={iconOptions("align", ALIGN_ICONS)}
          />
        </div>
      </section>

      {/* ── Responsive (in-tab summary; the Responsive tab carries the
            full per-breakpoint editor) ──────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className={SECTION_TITLE}>Responsive</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL}>
              {PRESENTATION_FIELD_LABELS.mobileStack}
            </span>
            {!mobileStackValue ? (
              <span className={INHERIT_HINT}>Default</span>
            ) : null}
          </div>
          <Segmented
            fullWidth
            compact
            value={mobileStackValue}
            onChange={(next) => setOrToggle("mobileStack", next)}
            options={iconOptions("mobileStack", MOBILE_STACK_ICONS)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL}>
              {PRESENTATION_FIELD_LABELS.visibility}
            </span>
            {!visibilityValue ? (
              <span className={INHERIT_HINT}>Always visible</span>
            ) : null}
          </div>
          <Segmented
            fullWidth
            compact
            value={visibilityValue}
            onChange={(next) => setOrToggle("visibility", next)}
            options={iconOptions("visibility", VISIBILITY_ICONS)}
          />
        </div>
      </section>
    </div>
  );
}
