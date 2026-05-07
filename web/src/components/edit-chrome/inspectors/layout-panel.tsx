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
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
  type CustomLength,
} from "@/lib/site-admin/sections/shared/presentation";
import type {
  BuilderAccordionNode,
  BuilderCarouselNode,
  BuilderContainerNode,
  BuilderMasonryNode,
  BuilderNode,
  BuilderNodeTree,
  BuilderSpacerNode,
  BuilderSplitNode,
  BuilderTabsNode,
} from "@/lib/site-admin/builder-node";

import { useMemo, useState, type ReactElement } from "react";

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

type AdvancedEditableBuilderNode =
  | BuilderContainerNode
  | BuilderSplitNode
  | BuilderAccordionNode
  | BuilderTabsNode
  | BuilderCarouselNode
  | BuilderMasonryNode
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
      <div className="flex flex-col gap-3">
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
            {!responsive ? (
              <span className={INHERIT_HINT}>Desktop only</span>
            ) : null}
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
      <div className="flex flex-col gap-3">
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
          checked={Boolean(node.props.collapseOnMobile)}
          onChange={(next) => onPatch({ collapseOnMobile: next || undefined })}
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
      <div className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Slides per view</span>
            <Segmented
              fullWidth
              compact
              value={String(node.props.slidesPerView ?? "1")}
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
      <div className="flex flex-col gap-3">
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

  if (node.kind === "spacer") {
    return (
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
    );
  }

  return null;
}

export function LayoutPanel({ presentation, onPatch }: LayoutPanelProps) {
  const { builderTree, selectedBuilderNodeId, patchBuilderNodeProps } =
    useEditContext();
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
  const selectedBuilderNode = useMemo(() => {
    const resolved = findBuilderNodeById(builderTree, selectedBuilderNodeId);
    if (!resolved) return null;
    switch (resolved.kind) {
      case "container":
      case "split":
      case "accordion":
      case "tabs":
      case "carousel":
      case "masonry":
      case "spacer":
        return resolved;
      default:
        return null;
    }
  }, [builderTree, selectedBuilderNodeId]);

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
            className="rounded-md p-3"
            style={{
              background: CHROME.surface2,
              border: `1px solid ${CHROME.line}`,
            }}
          >
            <AdvancedNodeLayoutEditor
              node={selectedBuilderNode}
              onPatch={(patch) => {
                void patchBuilderNodeProps(selectedBuilderNode.id, patch);
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
          {!padTopValue &&
          !padBottomValue &&
          !customVal("paddingTopCustom") &&
          !customVal("paddingBottomCustom") &&
          !customVal("paddingLeftCustom") &&
          !customVal("paddingRightCustom") ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div
          className="rounded-md p-3"
          style={{
            background: CHROME.paper,
            border: `1px solid ${CHROME.line}`,
          }}
        >
          <div className="flex flex-col gap-3">
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
