"use client";

/**
 * StylePanel — decorative + surface treatment for a section.
 *
 * Implements builder-experience.html surface §3 (Inspector Style tab).
 * Last reconciled: 2026-04-25.
 *
 * Replaces the original select-only build (Phase B.2 inspector pass —
 * "1995 website" operator feedback, 2026-04-25). The surface palette is
 * a swatch grid; the divider is a thumbnail gallery; the hero treatment
 * uses iconographic Segmented chips so the operator can read the choice
 * at a glance.
 *
 * Patches for presentation fields are wrapped under `__presentation` so
 * the dock's `handleStylePatch` routes them to the right merger. Root
 * payload patches (mood, overlay) go direct.
 *
 * Toggle-to-clear: clicking the active swatch / chip clears the field
 * back to `undefined` (= inherit theme default) — no separate "Reset"
 * button per row.
 */

import { PRESENTATION_OPTIONS } from "@/lib/site-admin/sections/shared/presentation";
import { resolveBuilderNodeRole, type BuilderNode, type BuilderNodeRole, type BuilderNodeHoverStyle, type BuilderNodeStyle, type BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import type {
  NodePresentation,
  NodePresentationValue,
} from "@/lib/site-admin/sections/shared/node-presentation";
import { isResponsivePlumbedStyleKey } from "@/lib/site-admin/builder-node/responsive-style-keys";
import { resolveStandaloneBuilderNodeForContent } from "./builder-node-content-utils";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { ColorPickerPopover } from "../kit/color-picker";
import { useEditContext } from "../edit-context";
import { useBuilderTree } from "../builder-tree-bridge";
import { useCanUndo, useCanRedo } from "../history-bridge";
import { GoogleFontPicker } from "../GoogleFontPicker";
import { NumberUnit } from "../kit/number-unit";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import { inspectorColorSwatchStyle } from "./style-panel-state-style-fields";
import { DividerPreview, ImportPresetsOverlay } from "./style-panel-preview-helpers";
import { StylePresetsBar } from "./style-presets-bar";
import { LinkedStyleClassesBar } from "./linked-style-classes-bar";
import { useAdvancedMode } from "../advanced-mode";
import { NodeThemeInheritancePanel } from "./node-theme-inheritance-panel";
import { buildFieldInheritRows } from "./inherit-override-fields";
import { useComponentDefaultsPreview } from "../component-defaults-bridge";
import { InstanceOverridesPanel } from "./instance-overrides-panel";
import { InstanceVariantPicker } from "./instance-variant-picker";
import { SectionStyleMockupPanel } from "./section-style-mockup-panel";
import { LockBadge, LockedFieldsBanner, styleLockedPathsOf, SegmentedField, NumberField, DebouncedRangeInput, InspectorInfoTip, InspectorLabelWithInfo } from "./kit";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL, INSPECTOR_HELP_TEXT_CLASS as HINT, INSPECTOR_SECTION_TITLE_CLASS as SECTION_TITLE, InspectorBody } from "./kit/inspector-ui";
import { useInspectorT } from "./kit/use-inspector-t";
import { stripLockedKeysFromPatch } from "@/lib/site-admin/builder-node/prop-lock";
import { CHROME } from "../kit/tokens";
import { BoxModel } from "../kit/box-model";
import { ImageCropModal } from "../image-crop";
import { uploadCmsMedia } from "@/lib/client/signed-upload";
import { breakpointLabelForDevice, naturalWidthForDevice } from "../breakpoint-registry";
import { useBuilderBreakpoints } from "../use-builder-breakpoints";
import { InlineNameInput } from "./kit/inline-name-input";
import { CssEditorWithHints } from "./kit/css-editor-with-hints";
import { pxLength, pctLength } from "./style-panel/length-utils";
import { BUILDER_NODE_THEME_COLOR_TOKENS, colorSwatchDisplay } from "./style-panel/section-shared";
import { QuickStyleCards } from "./style-panel/QuickStyleCards";
import { StyleFooterRow } from "./style-panel/StyleFooterRow";
import { StyleGroupStack } from "./style-panel/groups/StyleGroupStack";

const INHERIT_HINT = HINT;

/**
 * D6 (Inspector Reset P2) — a destructive confirm must LOOK different from the
 * first click. The old in-place text swap ("Reset block" → "Confirm reset")
 * changed nothing visually, so two identical-looking clicks destroyed all
 * styling. The armed state now wears the chrome's error tone; it still
 * auto-disarms after 2.6s (existing timers).
 */
const DESTRUCTIVE_CONFIRM_STYLE: CSSProperties = {
  background: CHROME.roseBg,
  border: `1px solid ${CHROME.roseLine}`,
  color: CHROME.rose,
  borderRadius: 5,
  padding: "2px 7px",
};

const HERO_OVERLAY_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "gradient-scrim", label: "Scrim" },
  { value: "aurora", label: "Aurora" },
  { value: "soft-vignette", label: "Vignette" },
];

const HERO_MOOD_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
}> = [
  { value: "", label: "Default", hint: "Tenant theme picks the rhythm." },
  { value: "clean", label: "Clean", hint: "Tight rhythm, compact type." },
  {
    value: "editorial",
    label: "Editorial",
    hint: "Serif display, generous spacing.",
  },
  { value: "cinematic", label: "Cinematic", hint: "Oversized, dramatic." },
];

// P7B Hero layout variants. Lives here (not in sections/hero/Editor.tsx)
// because the Hero Style tab is rendered by this panel, not by the per-
// section Editor — see web/docs/qa-evidence/p7-builder-live-walk-2026-05-13.md
// for the earlier divergence finding.
//
// Empty string = inherit (centered). The Component reads `data-hero-layout`
// from the schema and applies the matching CSS rule in globals.css.
const HERO_LAYOUT_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
}> = [
  {
    value: "",
    label: "Centered",
    hint: "Copy centered, image full-bleed behind. Editorial default.",
  },
  {
    value: "split-left",
    label: "Image left",
    hint: "Background photo on the left, copy on the right.",
  },
  {
    value: "split-right",
    label: "Image right",
    hint: "Copy on the left, background photo on the right.",
  },
];

interface StylePanelProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown>;
  selectedBuilderNodeId: string | null;
  onPatch: (patch: Record<string, unknown>) => void;
}

type EditableNodeRole = BuilderNodeRole;
type NodeViewport = "desktop" | "tablet" | "mobile";
type StandaloneStyleScope = "viewport" | "container";
type HorizontalSpacingMode = "linked" | "custom";

// W4-F1 — style-domain enum option arrays extracted to ./style-panel/style-options.
import { ALIGN_OPTIONS, SIZE_OPTIONS, TONE_OPTIONS, BUILDER_NODE_FIT_OPTIONS, BUILDER_NODE_RATIO_OPTIONS, BUILDER_BUTTON_TONE_OPTIONS, BUILDER_NODE_FONT_WEIGHT_OPTIONS, BUILDER_NODE_TEXT_TRANSFORM_OPTIONS, BUILDER_NODE_TEXT_WRAP_OPTIONS, BUILDER_NODE_WHITE_SPACE_OPTIONS, BUILDER_NODE_BORDER_STYLE_OPTIONS, BUILDER_NODE_VISIBILITY_OPTIONS } from "./style-panel/style-options";

/**
 * Parse a stored CSS length string ("48px", "1.5rem") back into the
 * structured {value, unit} the NumberUnit control expects. Returns null for
 * unset / unparseable values so the control falls back to its placeholder.
 */
// W5-C1 — parseCssLength / pxLength / pctLength moved to ./style-panel/length-utils
// so the extracted domain sub-sections share the identical adapters. Imported below.

const VISIBILITY_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "visible", label: "Show" },
  { value: "hidden", label: "Hide" },
];

const VIEWPORT_OPTIONS: ReadonlyArray<SegmentedOption<NodeViewport>> = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
  { value: "mobile", label: "Mobile" },
];
const STANDALONE_STYLE_SCOPE_OPTIONS: ReadonlyArray<
  SegmentedOption<StandaloneStyleScope>
> = [
  { value: "viewport", label: "Screen" },
  { value: "container", label: "Container" },
];
const BUILDER_NODE_CONTAINER_TYPE_OPTIONS: ReadonlyArray<
  SegmentedOption<string>
> = [
  { value: "", label: "Off" },
  { value: "inline-size", label: "Width" },
  { value: "size", label: "Size" },
];

const HORIZONTAL_MODE_OPTIONS: ReadonlyArray<SegmentedOption<HorizontalSpacingMode>> = [
  { value: "linked", label: "Linked" },
  { value: "custom", label: "Custom" },
];

type SpacingPreset = "" | "tight" | "balanced" | "airy";
const SPACING_PRESET_OPTIONS: ReadonlyArray<SegmentedOption<SpacingPreset>> = [
  { value: "", label: "Default" },
  { value: "tight", label: "Tight" },
  { value: "balanced", label: "Balanced" },
  { value: "airy", label: "Airy" },
];

type WidthPreset = "" | "narrow" | "reading" | "wide" | "full";
const WIDTH_PRESET_OPTIONS: ReadonlyArray<SegmentedOption<WidthPreset>> = [
  { value: "", label: "Default" },
  { value: "narrow", label: "Narrow" },
  { value: "reading", label: "Reading" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

type ConcreteNodePresentation = Exclude<NodePresentation, undefined>;
type ViewportSubsetKind = "typography" | "spacing";

type NodeStyleClipboard = {
  role: EditableNodeRole;
  full: ConcreteNodePresentation;
  viewport: NodePresentationValue | null;
  viewportSource: NodeViewport;
};
type NodeStyleActionEntry = {
  id: number;
  label: string;
};
type ResetConfirmTarget = "node" | "group" | null;
type PresetDeleteConfirmTarget = string | null;
type StoredNodeStylePreset = {
  id: string;
  name: string;
  value: ConcreteNodePresentation;
};
const NODE_STYLE_PRESET_STORAGE_KEY = "impronta:builder:node-style-presets:v1";
const VIEWPORT_TRACKED_KEYS: ReadonlyArray<keyof NodePresentationValue> = [
  "align",
  "maxWidthPx",
  "marginTopPx",
  "marginBottomPx",
  "marginInlinePx",
  "marginLeftPx",
  "marginRightPx",
  "paddingTopPx",
  "paddingBottomPx",
  "paddingInlinePx",
  "paddingLeftPx",
  "paddingRightPx",
  "size",
  "tone",
  "visibility",
  "fontFamily",
  "fontSizePx",
  "fontWeight",
  "letterSpacingPx",
  "lineHeightPct",
  "textTransform",
  "textColor",
  "backgroundColor",
  "borderColor",
  "borderWidthPx",
  "borderStyle",
];
// W5-C1 — BUILDER_NODE_THEME_COLOR_TOKENS / colorSwatchDisplay moved to
// ./style-panel/section-shared (shared with the extracted domain sections).

const TEXT_ROLES: ReadonlySet<EditableNodeRole> = new Set([
  "headline",
  "subheadline",
  "copy",
]);
const CTA_ROLES: ReadonlySet<EditableNodeRole> = new Set([
  "primaryCta",
  "secondaryCta",
  "footerCta",
]);

const EDITABLE_ROLES_BY_SECTION: Record<string, ReadonlyArray<EditableNodeRole>> = {
  hero: ["headline", "subheadline", "primaryCta", "secondaryCta"],
  category_grid: ["subheadline", "headline", "copy", "footerCta"],
  cta_banner: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
  directory: ["subheadline", "headline", "copy"],
  editorial_split_hero: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
  featured_talent: ["subheadline", "headline", "copy", "footerCta"],
  hero_search: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
  location_discovery: ["subheadline", "headline", "copy"],
  talent_type_grid: ["subheadline", "headline", "copy"],
  contact_form: ["subheadline", "headline", "copy", "primaryCta"],
  faq_accordion: ["subheadline", "headline", "copy"],
  pricing_grid: ["subheadline", "headline", "copy"],
  logo_cloud: ["subheadline", "headline"],
  team_grid: ["subheadline", "headline", "copy"],
  event_listing: ["subheadline", "headline"],
  content_tabs: ["subheadline", "headline"],
  process_steps: ["subheadline", "headline", "copy"],
  destinations_mosaic: ["subheadline", "headline", "copy"],
  stats: ["subheadline", "headline"],
  timeline: ["subheadline", "headline"],
  values_trio: ["subheadline", "headline"],
  comparison_table: ["subheadline", "headline", "copy"],
  hero_split: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
  image_copy_alternating: ["subheadline", "headline"],
  split_screen: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
  before_after: ["subheadline", "headline"],
  blank_section: [],
  booking_widget: ["subheadline", "headline", "copy", "primaryCta"],
  lookbook: ["subheadline", "headline"],
  magazine_layout: ["subheadline", "headline"],
  map_overlay: ["subheadline", "headline", "copy"],
  press_strip: ["subheadline"],
  masonry: ["subheadline", "headline"],
  sticky_scroll: ["subheadline", "headline"],
  scroll_carousel: ["subheadline", "headline"],
  lottie: ["subheadline", "headline", "copy"],
  video_reel: ["subheadline", "headline"],
  image_orbit: ["subheadline", "headline"],
  testimonials_trio: ["subheadline", "headline"],
  gallery_strip: ["subheadline", "headline", "copy"],
  trust_strip: ["subheadline", "headline"],
  code_embed: ["subheadline", "headline", "copy"],
  blog_index: ["subheadline", "headline"],
  donation_form: ["subheadline", "headline", "copy", "primaryCta"],
  code_snippet: ["subheadline", "headline"],
  blog_detail: ["subheadline", "headline", "copy"],
  site_header: ["headline", "primaryCta"],
  site_footer: ["headline", "copy"],
  anchor_nav: [],
  marquee: [],
  join_register: [],
  // WS-A A5 — header-widget embeds carry no role-bound child layers (the wrapped
  // widget owns its own markup), so they expose no editable text/CTA roles.
  header_search: [],
  header_account: [],
  header_inquiry: [],
  header_favorites: [],
  header_language: [],
};

function resolveNodeRole(
  sectionTypeKey: string,
  selectedBuilderNodeId: string | null,
): EditableNodeRole | null {
  if (!selectedBuilderNodeId) return null;
  const role = resolveBuilderNodeRole(selectedBuilderNodeId);
  if (!role) return null;
  return EDITABLE_ROLES_BY_SECTION[sectionTypeKey]?.includes(role) ? role : null;
}

function nodeRoleLabel(role: EditableNodeRole | null): string | null {
  if (role === "headline") return "Headline";
  if (role === "subheadline") return "Sub-headline";
  if (role === "copy") return "Supporting copy";
  if (role === "primaryCta") return "Primary CTA";
  if (role === "secondaryCta") return "Secondary CTA";
  if (role === "footerCta") return "Footer CTA";
  return null;
}

function resolveHorizontalMode(
  value: NodePresentationValue | null | undefined,
  kind: "margin" | "padding",
): HorizontalSpacingMode {
  if (!value) return "linked";
  if (kind === "margin") {
    return typeof value.marginLeftPx === "number" ||
      typeof value.marginRightPx === "number"
      ? "custom"
      : "linked";
  }
  return typeof value.paddingLeftPx === "number" ||
    typeof value.paddingRightPx === "number"
    ? "custom"
    : "linked";
}

function buildDesktopNodePresentationBase(
  value: NodePresentation | null | undefined,
): NodePresentationValue | null {
  if (!value) return null;
  const out: NodePresentationValue = {};
  if (value.align) out.align = value.align;
  if (
    typeof value.maxWidthPx === "number" &&
    Number.isFinite(value.maxWidthPx)
  ) {
    out.maxWidthPx = value.maxWidthPx;
  }
  if (
    typeof value.marginTopPx === "number" &&
    Number.isFinite(value.marginTopPx)
  ) {
    out.marginTopPx = value.marginTopPx;
  }
  if (
    typeof value.marginBottomPx === "number" &&
    Number.isFinite(value.marginBottomPx)
  ) {
    out.marginBottomPx = value.marginBottomPx;
  }
  if (
    typeof value.marginInlinePx === "number" &&
    Number.isFinite(value.marginInlinePx)
  ) {
    out.marginInlinePx = value.marginInlinePx;
  }
  if (
    typeof value.marginLeftPx === "number" &&
    Number.isFinite(value.marginLeftPx)
  ) {
    out.marginLeftPx = value.marginLeftPx;
  }
  if (
    typeof value.marginRightPx === "number" &&
    Number.isFinite(value.marginRightPx)
  ) {
    out.marginRightPx = value.marginRightPx;
  }
  if (
    typeof value.paddingTopPx === "number" &&
    Number.isFinite(value.paddingTopPx)
  ) {
    out.paddingTopPx = value.paddingTopPx;
  }
  if (
    typeof value.paddingBottomPx === "number" &&
    Number.isFinite(value.paddingBottomPx)
  ) {
    out.paddingBottomPx = value.paddingBottomPx;
  }
  if (
    typeof value.paddingInlinePx === "number" &&
    Number.isFinite(value.paddingInlinePx)
  ) {
    out.paddingInlinePx = value.paddingInlinePx;
  }
  if (
    typeof value.paddingLeftPx === "number" &&
    Number.isFinite(value.paddingLeftPx)
  ) {
    out.paddingLeftPx = value.paddingLeftPx;
  }
  if (
    typeof value.paddingRightPx === "number" &&
    Number.isFinite(value.paddingRightPx)
  ) {
    out.paddingRightPx = value.paddingRightPx;
  }
  if (value.size) out.size = value.size;
  if (value.tone) out.tone = value.tone;
  if (value.visibility) out.visibility = value.visibility;
  return Object.keys(out).length > 0 ? out : null;
}

function detectSpacingPreset(
  value: NodePresentationValue | null,
): SpacingPreset | null {
  if (!value) return null;
  const top = value.marginTopPx;
  const bottom = value.marginBottomPx;
  const paddingY =
    typeof value.paddingTopPx === "number" &&
    typeof value.paddingBottomPx === "number" &&
    value.paddingTopPx === value.paddingBottomPx
      ? value.paddingTopPx
      : null;

  if (top === 8 && bottom === 8 && paddingY === 8) return "tight";
  if (top === 16 && bottom === 16 && paddingY === 12) return "balanced";
  if (top === 28 && bottom === 28 && paddingY === 18) return "airy";
  return null;
}

function detectWidthPreset(
  value: NodePresentationValue | null,
): WidthPreset | null {
  const width = value?.maxWidthPx;
  if (typeof width !== "number") return null;
  if (width === 360) return "narrow";
  if (width === 540) return "reading";
  if (width === 760) return "wide";
  if (width === 960) return "full";
  return null;
}

function cloneNodePresentation(
  value: ConcreteNodePresentation,
): ConcreteNodePresentation {
  return {
    ...value,
    breakpoints: value.breakpoints
      ? {
          ...value.breakpoints,
          tablet: value.breakpoints.tablet
            ? { ...value.breakpoints.tablet }
            : undefined,
          mobile: value.breakpoints.mobile
            ? { ...value.breakpoints.mobile }
            : undefined,
        }
      : undefined,
  };
}

function resolveRoleGroup(
  role: EditableNodeRole | null,
): "text" | "cta" | null {
  if (!role) return null;
  if (TEXT_ROLES.has(role)) return "text";
  if (CTA_ROLES.has(role)) return "cta";
  return null;
}

function pickViewportSubset(
  value: NodePresentationValue,
  kind: ViewportSubsetKind,
): Partial<NodePresentationValue> {
  if (kind === "typography") {
    return {
      align: value.align,
      maxWidthPx: value.maxWidthPx,
      size: value.size,
      tone: value.tone,
      visibility: value.visibility,
    };
  }
  return {
    marginTopPx: value.marginTopPx,
    marginBottomPx: value.marginBottomPx,
    marginInlinePx: value.marginInlinePx,
    marginLeftPx: value.marginLeftPx,
    marginRightPx: value.marginRightPx,
    paddingTopPx: value.paddingTopPx,
    paddingBottomPx: value.paddingBottomPx,
    paddingInlinePx: value.paddingInlinePx,
    paddingLeftPx: value.paddingLeftPx,
    paddingRightPx: value.paddingRightPx,
  };
}

function hasSubsetValue(value: Partial<NodePresentationValue>): boolean {
  return Object.values(value).some((entry) => entry !== undefined);
}

// Job #33 — freeform-node group→key maps for the per-group "has overrides" dot.
// These mirror the controls actually rendered inside the standalone Typography
// and Spacing InspectorGroups, so a dot only lights when THAT group carries a
// non-active-breakpoint override. Kept as the canonical key list (BuilderNode
// style keys) rather than re-deriving from the DOM.
const FREEFORM_TYPOGRAPHY_STYLE_KEYS = [
  "align",
  "size",
  "tone",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "fontStyle",
  "textDecoration",
  "textWrap",
  "whiteSpace",
  "lineClamp",
  "textColor",
] as const satisfies ReadonlyArray<keyof BuilderNodeStyleValue>;

const FREEFORM_SPACING_STYLE_KEYS = [
  "marginTop",
  "marginBottom",
  "paddingX",
  "paddingY",
  "marginTopFree",
  "marginRightFree",
  "marginBottomFree",
  "marginLeftFree",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
] as const satisfies ReadonlyArray<keyof BuilderNodeStyleValue>;

function styleValueHasAnyKey(
  value: BuilderNodeStyleValue | undefined,
  keys: ReadonlyArray<keyof BuilderNodeStyleValue>,
): boolean {
  if (!value) return false;
  return keys.some((key) => value[key] !== undefined);
}

/**
 * Job #33 — does this freeform style carry a typography/spacing override on
 * EITHER non-desktop breakpoint (responsive OR container-query channel)? Drives
 * the per-group override dot so an operator on Desktop still sees which groups
 * behave differently on tablet/mobile.
 */
function styleGroupHasResponsiveOverride(
  style: BuilderNodeStyle | null | undefined,
  keys: ReadonlyArray<keyof BuilderNodeStyleValue>,
): boolean {
  if (!style) return false;
  return (
    styleValueHasAnyKey(style.responsive?.tablet, keys) ||
    styleValueHasAnyKey(style.responsive?.mobile, keys) ||
    styleValueHasAnyKey(style.containerQueries?.tablet, keys) ||
    styleValueHasAnyKey(style.containerQueries?.mobile, keys)
  );
}

function countDefinedViewportKeys(
  value: NodePresentationValue | null | undefined,
): number {
  if (!value) return 0;
  let count = 0;
  for (const key of VIEWPORT_TRACKED_KEYS) {
    if (value[key] !== undefined) count += 1;
  }
  return count;
}

function normalizePresetNameToId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized.slice(0, 48) : "preset";
}

function resolveUniquePresetId(
  requestedId: string,
  taken: ReadonlySet<string>,
): string {
  const base = requestedId.trim() || "preset";
  if (!taken.has(base)) return base;
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function resolveViewportPresentationForValue(
  value: ConcreteNodePresentation,
  viewport: NodeViewport,
): NodePresentationValue | null {
  if (viewport === "desktop") return value;
  return value.breakpoints?.[viewport] ?? buildDesktopNodePresentationBase(value);
}

// `section_embed` now carries a wrapper-level `style` prop (restyle its OUTER
// box — background, padding, margin, border, radius, max-width, shadow…; the
// section's internal presentation still lives in `config`/its Content editor).
// So it IS a standalone STYLE node; only the structural `section` shell is not.
type StandaloneStyleNode = Exclude<BuilderNode, { kind: "section" }>;
type StandaloneStylePreset = {
  id: string;
  label: string;
  hint: string;
  style?: BuilderNodeStyleValue;
  propsPatch?: Record<string, unknown>;
};
type StandaloneButtonStateStyles = Extract<
  BuilderNode,
  { kind: "button" }
>["props"]["stateStyles"];
type StandaloneStyleClipboard = {
  kind: StandaloneStyleNode["kind"];
  label: string;
  viewport: NodeViewport;
  style?: BuilderNodeStyleValue;
  buttonTone?: "primary" | "secondary";
  buttonStateStyles?: StandaloneButtonStateStyles;
};

function standaloneNodeLabel(node: StandaloneStyleNode): string {
  if (node.kind === "accordion_item") return "Accordion item";
  if (node.kind === "tab_panel") return "Tab panel";
  if (node.kind === "card") return "Card";
  if (node.kind === "cta_group") return "CTA group";
  return node.kind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanHoverStyle(
  value: BuilderNodeHoverStyle | undefined,
): BuilderNodeHoverStyle | undefined {
  if (!value) return undefined;
  const out: BuilderNodeHoverStyle = {};
  if (value.backgroundColor) out.backgroundColor = value.backgroundColor;
  if (value.color) out.color = value.color;
  if (value.borderColor) out.borderColor = value.borderColor;
  if (value.boxShadow) out.boxShadow = value.boxShadow;
  if (value.scale) out.scale = value.scale;
  if (value.translate) out.translate = value.translate;
  if (typeof value.opacity === "number") out.opacity = value.opacity;
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanBuilderNodeStyle(
  value: BuilderNodeStyle | undefined,
): BuilderNodeStyle | undefined {
  if (!value) return undefined;
  const out: BuilderNodeStyle = {};
  if (value.align) out.align = value.align;
  if (value.size) out.size = value.size;
  if (value.tone) out.tone = value.tone;
  if (value.maxWidth) out.maxWidth = value.maxWidth;
  if (value.marginTop) out.marginTop = value.marginTop;
  if (value.marginBottom) out.marginBottom = value.marginBottom;
  if (value.paddingX) out.paddingX = value.paddingX;
  if (value.paddingY) out.paddingY = value.paddingY;
  if (value.background) out.background = value.background;
  if (value.radius) out.radius = value.radius;
  if (value.objectFit) out.objectFit = value.objectFit;
  if (value.objectPosition) out.objectPosition = value.objectPosition;
  if (value.aspectRatioFree) out.aspectRatioFree = value.aspectRatioFree;
  if (value.aspectRatio) out.aspectRatio = value.aspectRatio;
  if (value.visibility) out.visibility = value.visibility;
  if (value.fontFamily) out.fontFamily = value.fontFamily;
  if (value.fontSize) out.fontSize = value.fontSize;
  if (typeof value.fontWeight === "number") out.fontWeight = value.fontWeight;
  if (value.lineHeight) out.lineHeight = value.lineHeight;
  if (value.letterSpacing) out.letterSpacing = value.letterSpacing;
  if (value.textTransform) out.textTransform = value.textTransform;
  if (value.fontStyle) out.fontStyle = value.fontStyle;
  if (value.textDecoration) out.textDecoration = value.textDecoration;
  if (value.textWrap) out.textWrap = value.textWrap;
  if (value.whiteSpace) out.whiteSpace = value.whiteSpace;
  if (typeof value.lineClamp === "number") out.lineClamp = value.lineClamp;
  if (value.textColor) out.textColor = value.textColor;
  if (value.backgroundColor) out.backgroundColor = value.backgroundColor;
  if (value.borderColor) out.borderColor = value.borderColor;
  if (value.borderWidth) out.borderWidth = value.borderWidth;
  if (value.borderStyle) out.borderStyle = value.borderStyle;
  if (value.borderRadius) out.borderRadius = value.borderRadius;
  if (value.width) out.width = value.width;
  if (value.height) out.height = value.height;
  if (value.minHeight) out.minHeight = value.minHeight;
  if (value.minWidth) out.minWidth = value.minWidth;
  if (value.maxWidthFree) out.maxWidthFree = value.maxWidthFree;
  if (value.maxHeight) out.maxHeight = value.maxHeight;
  if (value.paddingTop) out.paddingTop = value.paddingTop;
  if (value.paddingRight) out.paddingRight = value.paddingRight;
  if (value.paddingBottom) out.paddingBottom = value.paddingBottom;
  if (value.paddingLeft) out.paddingLeft = value.paddingLeft;
  if (value.marginTopFree) out.marginTopFree = value.marginTopFree;
  if (value.marginRightFree) out.marginRightFree = value.marginRightFree;
  if (value.marginBottomFree) out.marginBottomFree = value.marginBottomFree;
  if (value.marginLeftFree) out.marginLeftFree = value.marginLeftFree;
  if (value.boxShadow) out.boxShadow = value.boxShadow;
  if (value.textShadow) out.textShadow = value.textShadow;
  if (value.backgroundImage) out.backgroundImage = value.backgroundImage;
  if (value.backgroundSize) out.backgroundSize = value.backgroundSize;
  if (value.backgroundPosition) out.backgroundPosition = value.backgroundPosition;
  if (value.backgroundRepeat) out.backgroundRepeat = value.backgroundRepeat;
  if (value.backgroundClip) out.backgroundClip = value.backgroundClip;
  // Wave 3 · 3C — layered background system.
  if (value.backgroundLayers && value.backgroundLayers.length > 0) {
    out.backgroundLayers = value.backgroundLayers;
  }
  if (value.backgroundBlendMode) out.backgroundBlendMode = value.backgroundBlendMode;
  if (typeof value.opacity === "number") out.opacity = value.opacity;
  if (value.gap) out.gap = value.gap;
  if (value.containerType) out.containerType = value.containerType;
  if (value.containerName) out.containerName = value.containerName;
  if (value.position) out.position = value.position;
  if (value.top) out.top = value.top;
  if (value.right) out.right = value.right;
  if (value.bottom) out.bottom = value.bottom;
  if (value.left) out.left = value.left;
  if (value.stickyAnchor) out.stickyAnchor = value.stickyAnchor;
  if (value.stickyOffset) out.stickyOffset = value.stickyOffset;
  if (typeof value.zIndex === "number") out.zIndex = value.zIndex;
  if (value.overflow) out.overflow = value.overflow;
  if (value.rotate) out.rotate = value.rotate;
  if (value.scale) out.scale = value.scale;
  if (value.translate) out.translate = value.translate;
  if (value.transformOrigin) out.transformOrigin = value.transformOrigin;
  if (value.transitionProperty) out.transitionProperty = value.transitionProperty;
  if (value.transitionDuration) out.transitionDuration = value.transitionDuration;
  if (value.transitionTimingFunction) {
    out.transitionTimingFunction = value.transitionTimingFunction;
  }
  if (value.transitionDelay) out.transitionDelay = value.transitionDelay;
  if (value.transition) out.transition = value.transition;
  if (value.alignSelf) out.alignSelf = value.alignSelf;
  if (typeof value.flexGrow === "number") out.flexGrow = value.flexGrow;
  if (typeof value.flexShrink === "number") out.flexShrink = value.flexShrink;
  if (value.flexBasis) out.flexBasis = value.flexBasis;
  if (value.gridColumn) out.gridColumn = value.gridColumn;
  if (value.gridRow) out.gridRow = value.gridRow;
  if (typeof value.order === "number") out.order = value.order;
  if (value.filter) out.filter = value.filter;
  if (value.backdropFilter) out.backdropFilter = value.backdropFilter;
  if (value.mixBlendMode) out.mixBlendMode = value.mixBlendMode;
  if (value.justifyContent) out.justifyContent = value.justifyContent;
  if (value.alignItems) out.alignItems = value.alignItems;
  if (value.flexWrap) out.flexWrap = value.flexWrap;
  if (value.gridTemplateColumns) out.gridTemplateColumns = value.gridTemplateColumns;
  if (value.gridTemplateRows) out.gridTemplateRows = value.gridTemplateRows;
  if (value.gridAutoFlow) out.gridAutoFlow = value.gridAutoFlow;
  if (value.clipPath) out.clipPath = value.clipPath;
  if (value.maskImage) out.maskImage = value.maskImage;
  if (value.textStroke) out.textStroke = value.textStroke;
  if (value.cursor) out.cursor = value.cursor;
  if (value.userSelect) out.userSelect = value.userSelect;
  if (value.pointerEvents) out.pointerEvents = value.pointerEvents;
  if (value.scrollSnapType) out.scrollSnapType = value.scrollSnapType;
  if (value.scrollSnapAlign) out.scrollSnapAlign = value.scrollSnapAlign;
  if (value.outline) out.outline = value.outline;
  if (value.outlineOffset) out.outlineOffset = value.outlineOffset;
  if (value.accentColor) out.accentColor = value.accentColor;
  if (value.caretColor) out.caretColor = value.caretColor;
  if (value.animationPreset) out.animationPreset = value.animationPreset;
  if (value.animationDuration) out.animationDuration = value.animationDuration;
  if (value.animationDelay) out.animationDelay = value.animationDelay;
  if (value.animationTrigger) out.animationTrigger = value.animationTrigger;
  if (value.animationEasing) out.animationEasing = value.animationEasing;
  if (value.animationEasingCustom) {
    out.animationEasingCustom = value.animationEasingCustom;
  }
  if (value.parallax) out.parallax = value.parallax;
  if (value.revealOnView) out.revealOnView = value.revealOnView;
  if (value.revealDistance) out.revealDistance = value.revealDistance;
  if (value.revealDuration) out.revealDuration = value.revealDuration;
  if (value.revealDelay) out.revealDelay = value.revealDelay;
  if (value.revealEasing) out.revealEasing = value.revealEasing;
  const tablet = cleanBuilderNodeStyleValue(value.responsive?.tablet);
  const mobile = cleanBuilderNodeStyleValue(value.responsive?.mobile);
  if (tablet || mobile) {
    out.responsive = {};
    if (tablet) out.responsive.tablet = tablet;
    if (mobile) out.responsive.mobile = mobile;
  }
  const containerTablet = cleanBuilderNodeStyleValue(
    value.containerQueries?.tablet,
  );
  const containerMobile = cleanBuilderNodeStyleValue(
    value.containerQueries?.mobile,
  );
  if (containerTablet || containerMobile) {
    out.containerQueries = {};
    if (containerTablet) out.containerQueries.tablet = containerTablet;
    if (containerMobile) out.containerQueries.mobile = containerMobile;
  }
  const hover = cleanHoverStyle(value.hover);
  if (hover) out.hover = hover;
  // Wave 3 · 3D — preserve per-state style overrides (focus/active).
  const focusStyle = cleanHoverStyle(value.stateStyles?.focus);
  const activeStyle = cleanHoverStyle(value.stateStyles?.active);
  if (focusStyle || activeStyle) {
    out.stateStyles = {};
    if (focusStyle) out.stateStyles.focus = focusStyle;
    if (activeStyle) out.stateStyles.active = activeStyle;
  }
  // Wave 3 · 3B — preserve the linked style-class reference through every style
  // patch (the allowlist above intentionally drops unknown keys; classRef must
  // survive or "Apply class" would be wiped on the next inspector edit).
  if (value.classRef) out.classRef = value.classRef;
  // Per-node custom CSS escape hatch (2026-06-09) — base-style only (no viewport
  // layer). Must survive the allow-list or it'd be wiped on the next style edit.
  if (value.customCss) out.customCss = value.customCss;
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanBuilderNodeStyleValue(
  value: BuilderNodeStyleValue | undefined,
): BuilderNodeStyleValue | undefined {
  if (!value) return undefined;
  const out: BuilderNodeStyleValue = {};
  if (value.align) out.align = value.align;
  if (value.size) out.size = value.size;
  if (value.tone) out.tone = value.tone;
  if (value.maxWidth) out.maxWidth = value.maxWidth;
  if (value.marginTop) out.marginTop = value.marginTop;
  if (value.marginBottom) out.marginBottom = value.marginBottom;
  if (value.paddingX) out.paddingX = value.paddingX;
  if (value.paddingY) out.paddingY = value.paddingY;
  if (value.background) out.background = value.background;
  if (value.radius) out.radius = value.radius;
  if (value.objectFit) out.objectFit = value.objectFit;
  if (value.objectPosition) out.objectPosition = value.objectPosition;
  if (value.aspectRatioFree) out.aspectRatioFree = value.aspectRatioFree;
  if (value.aspectRatio) out.aspectRatio = value.aspectRatio;
  if (value.visibility) out.visibility = value.visibility;
  if (value.fontFamily) out.fontFamily = value.fontFamily;
  if (value.fontSize) out.fontSize = value.fontSize;
  if (typeof value.fontWeight === "number") out.fontWeight = value.fontWeight;
  if (value.lineHeight) out.lineHeight = value.lineHeight;
  if (value.letterSpacing) out.letterSpacing = value.letterSpacing;
  if (value.textTransform) out.textTransform = value.textTransform;
  if (value.fontStyle) out.fontStyle = value.fontStyle;
  if (value.textDecoration) out.textDecoration = value.textDecoration;
  if (value.textWrap) out.textWrap = value.textWrap;
  if (value.whiteSpace) out.whiteSpace = value.whiteSpace;
  if (typeof value.lineClamp === "number") out.lineClamp = value.lineClamp;
  if (value.textColor) out.textColor = value.textColor;
  if (value.backgroundColor) out.backgroundColor = value.backgroundColor;
  if (value.borderColor) out.borderColor = value.borderColor;
  if (value.borderWidth) out.borderWidth = value.borderWidth;
  if (value.borderStyle) out.borderStyle = value.borderStyle;
  if (value.borderRadius) out.borderRadius = value.borderRadius;
  if (value.width) out.width = value.width;
  if (value.height) out.height = value.height;
  if (value.minHeight) out.minHeight = value.minHeight;
  if (value.minWidth) out.minWidth = value.minWidth;
  if (value.maxWidthFree) out.maxWidthFree = value.maxWidthFree;
  if (value.maxHeight) out.maxHeight = value.maxHeight;
  if (value.paddingTop) out.paddingTop = value.paddingTop;
  if (value.paddingRight) out.paddingRight = value.paddingRight;
  if (value.paddingBottom) out.paddingBottom = value.paddingBottom;
  if (value.paddingLeft) out.paddingLeft = value.paddingLeft;
  if (value.marginTopFree) out.marginTopFree = value.marginTopFree;
  if (value.marginRightFree) out.marginRightFree = value.marginRightFree;
  if (value.marginBottomFree) out.marginBottomFree = value.marginBottomFree;
  if (value.marginLeftFree) out.marginLeftFree = value.marginLeftFree;
  if (value.boxShadow) out.boxShadow = value.boxShadow;
  if (value.textShadow) out.textShadow = value.textShadow;
  if (value.backgroundImage) out.backgroundImage = value.backgroundImage;
  if (value.backgroundSize) out.backgroundSize = value.backgroundSize;
  if (value.backgroundPosition) out.backgroundPosition = value.backgroundPosition;
  if (value.backgroundRepeat) out.backgroundRepeat = value.backgroundRepeat;
  if (value.backgroundClip) out.backgroundClip = value.backgroundClip;
  // Wave 3 · 3C — layered background system.
  if (value.backgroundLayers && value.backgroundLayers.length > 0) {
    out.backgroundLayers = value.backgroundLayers;
  }
  if (value.backgroundBlendMode) out.backgroundBlendMode = value.backgroundBlendMode;
  if (typeof value.opacity === "number") out.opacity = value.opacity;
  if (value.gap) out.gap = value.gap;
  if (value.containerType) out.containerType = value.containerType;
  if (value.containerName) out.containerName = value.containerName;
  if (value.position) out.position = value.position;
  if (value.top) out.top = value.top;
  if (value.right) out.right = value.right;
  if (value.bottom) out.bottom = value.bottom;
  if (value.left) out.left = value.left;
  if (value.stickyAnchor) out.stickyAnchor = value.stickyAnchor;
  if (value.stickyOffset) out.stickyOffset = value.stickyOffset;
  if (typeof value.zIndex === "number") out.zIndex = value.zIndex;
  if (value.overflow) out.overflow = value.overflow;
  if (value.rotate) out.rotate = value.rotate;
  if (value.scale) out.scale = value.scale;
  if (value.translate) out.translate = value.translate;
  if (value.transformOrigin) out.transformOrigin = value.transformOrigin;
  if (value.transitionProperty) out.transitionProperty = value.transitionProperty;
  if (value.transitionDuration) out.transitionDuration = value.transitionDuration;
  if (value.transitionTimingFunction) {
    out.transitionTimingFunction = value.transitionTimingFunction;
  }
  if (value.transitionDelay) out.transitionDelay = value.transitionDelay;
  if (value.transition) out.transition = value.transition;
  if (value.alignSelf) out.alignSelf = value.alignSelf;
  if (typeof value.flexGrow === "number") out.flexGrow = value.flexGrow;
  if (typeof value.flexShrink === "number") out.flexShrink = value.flexShrink;
  if (value.flexBasis) out.flexBasis = value.flexBasis;
  if (value.gridColumn) out.gridColumn = value.gridColumn;
  if (value.gridRow) out.gridRow = value.gridRow;
  if (typeof value.order === "number") out.order = value.order;
  if (value.filter) out.filter = value.filter;
  if (value.backdropFilter) out.backdropFilter = value.backdropFilter;
  if (value.mixBlendMode) out.mixBlendMode = value.mixBlendMode;
  if (value.justifyContent) out.justifyContent = value.justifyContent;
  if (value.alignItems) out.alignItems = value.alignItems;
  if (value.flexWrap) out.flexWrap = value.flexWrap;
  if (value.gridTemplateColumns) out.gridTemplateColumns = value.gridTemplateColumns;
  if (value.gridTemplateRows) out.gridTemplateRows = value.gridTemplateRows;
  if (value.gridAutoFlow) out.gridAutoFlow = value.gridAutoFlow;
  if (value.clipPath) out.clipPath = value.clipPath;
  if (value.maskImage) out.maskImage = value.maskImage;
  if (value.textStroke) out.textStroke = value.textStroke;
  if (value.cursor) out.cursor = value.cursor;
  if (value.userSelect) out.userSelect = value.userSelect;
  if (value.pointerEvents) out.pointerEvents = value.pointerEvents;
  if (value.scrollSnapType) out.scrollSnapType = value.scrollSnapType;
  if (value.scrollSnapAlign) out.scrollSnapAlign = value.scrollSnapAlign;
  if (value.outline) out.outline = value.outline;
  if (value.outlineOffset) out.outlineOffset = value.outlineOffset;
  if (value.accentColor) out.accentColor = value.accentColor;
  if (value.caretColor) out.caretColor = value.caretColor;
  if (value.animationPreset) out.animationPreset = value.animationPreset;
  if (value.animationDuration) out.animationDuration = value.animationDuration;
  if (value.animationDelay) out.animationDelay = value.animationDelay;
  if (value.animationTrigger) out.animationTrigger = value.animationTrigger;
  if (value.animationEasing) out.animationEasing = value.animationEasing;
  if (value.animationEasingCustom) {
    out.animationEasingCustom = value.animationEasingCustom;
  }
  if (value.parallax) out.parallax = value.parallax;
  if (value.revealOnView) out.revealOnView = value.revealOnView;
  if (value.revealDistance) out.revealDistance = value.revealDistance;
  if (value.revealDuration) out.revealDuration = value.revealDuration;
  if (value.revealDelay) out.revealDelay = value.revealDelay;
  if (value.revealEasing) out.revealEasing = value.revealEasing;
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveBuilderNodeViewportStyle(
  style: BuilderNodeStyle | undefined,
  viewport: NodeViewport,
  scope: StandaloneStyleScope = "viewport",
): BuilderNodeStyleValue | undefined {
  if (viewport === "desktop") return style;
  if (scope === "container") return style?.containerQueries?.[viewport];
  return style?.responsive?.[viewport];
}

function standaloneStylePresetsForNode(
  node: StandaloneStyleNode,
): ReadonlyArray<StandaloneStylePreset> {
  if (node.kind === "heading") {
    return [
      {
        id: "editorial-title",
        label: "Editorial title",
        hint: "Large, centered, strong width.",
        style: {
          align: "center",
          size: "xl",
          tone: "strong",
          maxWidth: "wide",
          marginTop: "m",
          marginBottom: "s",
        },
      },
      {
        id: "quiet-kicker",
        label: "Quiet kicker",
        hint: "Small muted intro label.",
        style: {
          align: "center",
          size: "sm",
          tone: "muted",
          maxWidth: "reading",
          marginBottom: "s",
        },
      },
      {
        id: "left-lead",
        label: "Left lead",
        hint: "Sharp editorial page lead.",
        style: {
          align: "left",
          size: "lg",
          tone: "strong",
          maxWidth: "reading",
          marginBottom: "m",
        },
      },
    ];
  }

  if (node.kind === "paragraph") {
    return [
      {
        id: "centered-lead",
        label: "Centered lead",
        hint: "Readable intro copy.",
        style: {
          align: "center",
          size: "lg",
          tone: "muted",
          maxWidth: "reading",
          marginBottom: "m",
        },
      },
      {
        id: "compact-note",
        label: "Compact note",
        hint: "Small supporting text.",
        style: {
          align: "left",
          size: "sm",
          tone: "muted",
          maxWidth: "narrow",
          marginTop: "s",
          marginBottom: "s",
        },
      },
      {
        id: "wide-copy",
        label: "Wide copy",
        hint: "Fuller content block.",
        style: {
          align: "left",
          size: "md",
          maxWidth: "wide",
          marginBottom: "m",
        },
      },
    ];
  }

  if (node.kind === "image") {
    return [
      {
        id: "sharp-editorial",
        label: "Sharp editorial",
        hint: "No corners, wide crop.",
        style: {
          maxWidth: "wide",
          radius: "none",
          objectFit: "cover",
          aspectRatio: "16:9",
          marginTop: "m",
          marginBottom: "m",
        },
      },
      {
        id: "portrait-card",
        label: "Portrait card",
        hint: "Tall model/profile frame.",
        style: {
          maxWidth: "narrow",
          radius: "none",
          objectFit: "cover",
          aspectRatio: "3:4",
          marginTop: "s",
          marginBottom: "m",
        },
      },
      {
        id: "full-bleed-strip",
        label: "Full strip",
        hint: "Full-width cinematic band.",
        style: {
          maxWidth: "full",
          radius: "none",
          objectFit: "cover",
          aspectRatio: "21:9",
          marginTop: "l",
          marginBottom: "l",
        },
      },
    ];
  }

  if (node.kind === "button") {
    return [
      {
        id: "primary-cta",
        label: "Primary CTA",
        hint: "Solid action button.",
        style: {
          align: "center",
          size: "md",
          radius: "none",
          paddingX: "m",
          paddingY: "s",
          marginTop: "m",
        },
        propsPatch: {
          tone: "primary",
          stateStyles: {
            hover: { tone: "secondary" },
            focus: { tone: "secondary" },
            active: { tone: "secondary" },
          },
        },
      },
      {
        id: "secondary-sharp",
        label: "Secondary sharp",
        hint: "Quiet rectangular action.",
        style: {
          align: "left",
          size: "sm",
          radius: "none",
          paddingX: "s",
          paddingY: "s",
        },
        propsPatch: {
          tone: "secondary",
          stateStyles: {
            hover: { tone: "primary" },
            focus: { tone: "primary" },
          },
        },
      },
      {
        id: "wide-action",
        label: "Wide action",
        hint: "Large centered conversion.",
        style: {
          align: "center",
          size: "lg",
          maxWidth: "reading",
          radius: "none",
          paddingX: "l",
          paddingY: "m",
          marginTop: "l",
        },
        propsPatch: {
          tone: "primary",
          stateStyles: {
            hover: { tone: "secondary" },
            active: { tone: "secondary" },
          },
        },
      },
    ];
  }

  if (
    node.kind === "container" ||
    node.kind === "split" ||
    node.kind === "card" ||
    node.kind === "cta_group"
  ) {
    return [
      {
        id: "clean-stack",
        label: "Clean stack",
        hint: "Sharp, open page rhythm.",
        style: {
          maxWidth: "wide",
          background: "none",
          radius: "none",
          paddingX: "none",
          paddingY: "none",
          marginTop: "m",
          marginBottom: "m",
        },
      },
      {
        id: "surface-band",
        label: "Surface band",
        hint: "Contained background panel.",
        style: {
          maxWidth: "wide",
          background: "surface",
          radius: "none",
          paddingX: "l",
          paddingY: "l",
          marginTop: "l",
          marginBottom: "l",
        },
      },
      {
        id: "contrast-feature",
        label: "Contrast feature",
        hint: "Dark feature moment.",
        style: {
          maxWidth: "full",
          background: "contrast",
          radius: "none",
          paddingX: "l",
          paddingY: "l",
          marginTop: "l",
          marginBottom: "l",
        },
      },
    ];
  }

  if (node.kind === "spacer" || node.kind === "divider") {
    return [
      {
        id: "micro-gap",
        label: "Micro gap",
        hint: "Tight separation.",
        style: { marginTop: "s", marginBottom: "s" },
      },
      {
        id: "section-gap",
        label: "Section gap",
        hint: "Large breathing room.",
        style: { marginTop: "l", marginBottom: "l" },
      },
    ];
  }

  return [
    {
      id: "sharp-contained",
      label: "Sharp contained",
      hint: "Safe editorial default.",
      style: {
        maxWidth: "wide",
        radius: "none",
        marginTop: "m",
        marginBottom: "m",
      },
    },
    {
      id: "surface-contained",
      label: "Surface contained",
      hint: "Adds background and padding.",
      style: {
        maxWidth: "wide",
        background: "surface",
        radius: "none",
        paddingX: "m",
        paddingY: "m",
        marginTop: "m",
        marginBottom: "m",
      },
    },
  ];
}

function buttonStateTone(
  node: Extract<BuilderNode, { kind: "button" }>,
  state: "hover" | "focus" | "active" | "disabled",
): string {
  return node.props.stateStyles?.[state]?.tone ?? "";
}

const VIEWPORT_SCOPE_LABEL: Record<NodeViewport, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export function StylePanel({
  sectionTypeKey,
  draftProps,
  selectedBuilderNodeId,
  onPatch,
}: StylePanelProps) {
  // WAVE 4.4 — the kit primitives translate their own props; these are the
  // handful of strings this panel renders into raw JSX itself.
  const { t } = useInspectorT();
  const {
    pageId,
    patchBuilderNodeProps,
    reportMutationError,
    detachComponentInstance,
    undo,
    redo,
    // Job #2 — the canvas device switcher is the single source of truth for the
    // active breakpoint. The Style panel's viewport scope follows it (and the
    // in-panel switcher pushes back), so the operator can never preview Mobile
    // while silently editing Desktop rules.
    device,
    setDevice,
    tenantId,
  } = useEditContext();
  // WS2 — tree + history-depth VALUES from their micro-stores (builder-tree-bridge
  // / history-bridge), so an edit/undo no longer re-renders this panel via the
  // value memo. canUndo/canRedo gate the in-panel undo/redo buttons.
  const builderTree = useBuilderTree();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  // W2-C4 — reusable style presets + named/linked style CLASSES are power-user
  // controls; they surface only when Advanced is ON. Per-node styling, theme
  // inheritance, and all per-tenant token/brand editing stay at the default
  // level, so a tenant fully brands their site without Advanced.
  const { advanced } = useAdvancedMode();
  // #3b — resolved component-default map for the inherit/override inspector.
  // Prefers the operator's working draft (published to the bridge by the Theme
  // drawer's Components tab) so the panel matches the live canvas preview; null
  // when no draft is active (the panel then shows the global-token source).
  const draftComponentDefaults = useComponentDefaultsPreview();
  const [nodeStyleClipboard, setNodeStyleClipboard] =
    useState<NodeStyleClipboard | null>(null);
  const [standaloneStyleClipboard, setStandaloneStyleClipboard] =
    useState<StandaloneStyleClipboard | null>(null);
  const [recentNodeActions, setRecentNodeActions] = useState<
    ReadonlyArray<NodeStyleActionEntry>
  >([]);
  const [resetConfirmTarget, setResetConfirmTarget] =
    useState<ResetConfirmTarget>(null);
  const [presetDeleteConfirmTarget, setPresetDeleteConfirmTarget] =
    useState<PresetDeleteConfirmTarget>(null);
  const [nodeStylePresetName, setNodeStylePresetName] = useState("");
  // INS-3: inline rename state (replaces window.prompt).
  const [renamePresetTarget, setRenamePresetTarget] = useState<StoredNodeStylePreset | null>(null);
  // INS-3: inline import state (replaces window.prompt for JSON import).
  const [importPresetsOpen, setImportPresetsOpen] = useState(false);
  const [importPresetsError, setImportPresetsError] = useState<string | null>(null);
  const [storedNodeStylePresets, setStoredNodeStylePresets] = useState<
    ReadonlyArray<StoredNodeStylePreset>
  >([]);
  const nodeActionIdRef = useRef(1);
  const presetFallbackIdRef = useRef(1);
  const standaloneStyleDraftRef = useRef<{
    nodeId: string | null;
    style: BuilderNodeStyle | undefined;
  }>({ nodeId: null, style: undefined });
  const standalonePatchChainRef = useRef<Promise<void>>(Promise.resolve());
  // W5-T5 — image crop entry point from the style panel.
  const [imageCropOpen, setImageCropOpen] = useState(false);
  const [imageCropSaving, setImageCropSaving] = useState(false);
  const [imageCropError, setImageCropError] = useState<string | null>(null);
  const presentation =
    (draftProps.presentation as Record<string, unknown> | undefined) ?? {};
  const present = (key: string): string =>
    (presentation[key] as string | undefined) ?? "";
  const root = (key: string): string =>
    (draftProps[key] as string | undefined) ?? "";

  /**
   * Toggle pattern for presentation fields: clicking the active value
   * clears it back to `undefined` (= inherit theme default).
   */
  function setOrToggleP(key: string, next: string) {
    const current = present(key);
    onPatch({
      __presentation: { [key]: current === next ? undefined : next },
    });
  }

  function setOrToggleRoot(key: string, next: string) {
    const current = root(key);
    onPatch({ [key]: current === next ? undefined : next });
  }

  const nodePresentationRaw =
    draftProps.nodePresentation && typeof draftProps.nodePresentation === "object"
      ? (draftProps.nodePresentation as Record<string, NodePresentation>)
      : null;
  const selectedNodeRole = useMemo(
    () => resolveNodeRole(sectionTypeKey, selectedBuilderNodeId),
    [sectionTypeKey, selectedBuilderNodeId],
  );
  const selectedStandaloneStyleNode: StandaloneStyleNode | null = useMemo(() => {
    const node = resolveStandaloneBuilderNodeForContent(
      builderTree,
      selectedBuilderNodeId,
    );
    // section_embed IS a style node now (wrapper-level `style`); the resolver
    // already excludes the structural `section` shell, so just return it.
    return node ?? null;
  }, [builderTree, selectedBuilderNodeId]);
  // INS-1 — per-prop lock affordance. A locked `style.*` path renders a
  // Style-tab banner mirroring the Content tab; the patch chokepoint above
  // strips the locked leaf. Shared kit scope filter, no surfaceKind branch.
  const styleLockedPaths = styleLockedPathsOf(
    selectedStandaloneStyleNode?.lockedProps,
  );
  // Linked-component instance marker (Living Components Phase 2) — present only
  // on a container tagged instanceOf. Drives the Detach affordance.
  const selectedInstanceComponentId =
    selectedStandaloneStyleNode?.kind === "container"
      ? (selectedStandaloneStyleNode.props.instanceOf ?? null)
      : null;
  // Job #2 — viewport scope SYNCED to the canvas device. We seed the local
  // state from `device` and keep it mirrored via an effect, so opening the panel
  // (or switching the canvas viewport) lands the inspector on the matching
  // breakpoint. The in-panel switcher (`selectViewport`) writes BOTH this state
  // and `setDevice`, so the canvas frame follows the inspector too. The local
  // state is retained (rather than reading `device` directly) so the dozens of
  // existing `selectedViewport` reads keep working and a future "decouple"
  // affordance can diverge them without a wide refactor.
  // W5-T6 — freeform nodes have no wide/compact viewport; map those section
  // breakpoints to the nearest node viewport (wide→desktop, compact→mobile) so
  // the inspector still lands somewhere sensible when the canvas is on a
  // custom tier.
  const mappedViewport: NodeViewport =
    device === "wide" ? "desktop" : device === "compact" ? "mobile" : device;
  const [selectedViewport, setSelectedViewport] =
    useState<NodeViewport>(mappedViewport);
  useEffect(() => {
    setSelectedViewport((prev) =>
      prev === mappedViewport ? prev : mappedViewport,
    );
  }, [mappedViewport]);
  const builderBreakpoints = useBuilderBreakpoints();
  const viewportSegmentOptions = useMemo(
    (): ReadonlyArray<SegmentedOption<NodeViewport>> =>
      VIEWPORT_OPTIONS.map((opt) => ({
        ...opt,
        label: breakpointLabelForDevice(opt.value, builderBreakpoints),
      })),
    [builderBreakpoints],
  );
  const canvasBreakpointHint =
    device === "wide" || device === "compact"
      ? `Canvas: ${breakpointLabelForDevice(device, builderBreakpoints)} (${naturalWidthForDevice(device, builderBreakpoints)}px) maps to ${VIEWPORT_SCOPE_LABEL[mappedViewport]} overrides.`
      : null;
  const [selectedStandaloneStyleScope, setSelectedStandaloneStyleScope] =
    useState<StandaloneStyleScope>("viewport");
  // Wave 3 · 3D — which interaction state the hover/state editor is targeting.
  // "default" = the existing hover style (legacy); "focus" / "active" = the new
  // stateStyles.focus / stateStyles.active buckets.
  const [selectedInteractionState, setSelectedInteractionState] = useState<
    "default" | "focus" | "active"
  >("default");
  const effectiveStandaloneStyleScope: StandaloneStyleScope =
    selectedViewport === "desktop" ? "viewport" : selectedStandaloneStyleScope;
  const selectedNodeLabel = nodeRoleLabel(selectedNodeRole);
  const selectedNodeIsButton =
    selectedNodeRole === "primaryCta" ||
    selectedNodeRole === "secondaryCta" ||
    selectedNodeRole === "footerCta";
  const selectedNodePresentation =
    selectedNodeRole && nodePresentationRaw
      ? (nodePresentationRaw[selectedNodeRole] ?? null)
      : null;
  const selectedNodeViewportPresentation: NodePresentationValue | null =
    selectedNodePresentation
      ? selectedViewport === "desktop"
        ? selectedNodePresentation
        : selectedNodePresentation.breakpoints?.[selectedViewport] ?? null
      : null;
  const marginHorizontalMode = resolveHorizontalMode(
    selectedNodeViewportPresentation,
    "margin",
  );
  const paddingHorizontalMode = resolveHorizontalMode(
    selectedNodeViewportPresentation,
    "padding",
  );
  const hasSelectedViewportOverrides =
    selectedViewport !== "desktop" &&
    Boolean(selectedNodePresentation?.breakpoints?.[selectedViewport]);
  const selectedViewportOverrideCount = countDefinedViewportKeys(
    selectedViewport === "desktop"
      ? selectedNodePresentation
      : selectedNodePresentation?.breakpoints?.[selectedViewport],
  );
  const desktopDefinedCount = countDefinedViewportKeys(selectedNodePresentation);
  const inheritedDesktopCount =
    selectedViewport === "desktop"
      ? 0
      : Math.max(0, desktopDefinedCount - selectedViewportOverrideCount);
  const hasSelectedNodeOverrides = Boolean(selectedNodePresentation);
  const desktopNodeBase = buildDesktopNodePresentationBase(selectedNodePresentation);
  const canCopyDesktopToViewport =
    selectedViewport !== "desktop" && Boolean(desktopNodeBase);
  const canCopyDesktopToAllViewports =
    selectedViewport === "desktop" && Boolean(desktopNodeBase);
  const selectedSpacingPreset = detectSpacingPreset(selectedNodeViewportPresentation);
  const selectedWidthPreset = detectWidthPreset(selectedNodeViewportPresentation);
  const siblingViewport: NodeViewport | null =
    selectedViewport === "tablet"
      ? "mobile"
      : selectedViewport === "mobile"
        ? "tablet"
        : null;
  const canCopyToSiblingViewport =
    Boolean(selectedNodeRole) &&
    Boolean(siblingViewport) &&
    Boolean(selectedNodeViewportPresentation);
  const ctaMirrorTargetRole: EditableNodeRole | null =
    selectedNodeRole === "primaryCta"
      ? "secondaryCta"
      : selectedNodeRole === "secondaryCta"
        ? "primaryCta"
        : null;
  const canMirrorCtaRole =
    Boolean(selectedNodeRole) &&
    Boolean(ctaMirrorTargetRole) &&
    Boolean(
      ctaMirrorTargetRole &&
      EDITABLE_ROLES_BY_SECTION[sectionTypeKey]?.includes(ctaMirrorTargetRole),
    );
  const canCopyNodeStyle = Boolean(selectedNodeRole && selectedNodePresentation);
  const canPasteNodeStyle = Boolean(selectedNodeRole && nodeStyleClipboard?.full);
  const canPasteViewportStyle = Boolean(
    selectedNodeRole && nodeStyleClipboard?.viewport,
  );
  const canClearClipboard = Boolean(nodeStyleClipboard);
  const selectedRoleGroup = resolveRoleGroup(selectedNodeRole);
  const selectedSectionRoles = EDITABLE_ROLES_BY_SECTION[sectionTypeKey] ?? [];
  const broadcastRoleTargets =
    selectedRoleGroup && selectedNodeRole
      ? selectedSectionRoles.filter((role) => {
          if (role === selectedNodeRole) return false;
          return selectedRoleGroup === "text"
            ? TEXT_ROLES.has(role)
            : CTA_ROLES.has(role);
        })
      : [];
  const canBroadcastRoleStyle = Boolean(
    selectedNodeRole &&
      selectedNodePresentation &&
      broadcastRoleTargets.length > 0,
  );
  const canBroadcastRoleViewportStyle = Boolean(
    selectedNodeRole &&
      selectedNodeViewportPresentation &&
      broadcastRoleTargets.length > 0,
  );
  const roleGroupMembers =
    selectedRoleGroup === "text"
      ? selectedSectionRoles.filter((role) => TEXT_ROLES.has(role))
      : selectedRoleGroup === "cta"
        ? selectedSectionRoles.filter((role) => CTA_ROLES.has(role))
        : [];
  const canResetRoleGroup = Boolean(
    selectedRoleGroup &&
      roleGroupMembers.some((role) =>
        Boolean((nodePresentationRaw ?? {})[role]),
      ),
  );
  const canBroadcastRoleType = Boolean(
    selectedNodeRole &&
      selectedNodeViewportPresentation &&
      broadcastRoleTargets.length > 0 &&
      hasSubsetValue(
        pickViewportSubset(selectedNodeViewportPresentation, "typography"),
      ),
  );
  const canBroadcastRoleSpacing = Boolean(
    selectedNodeRole &&
      selectedNodeViewportPresentation &&
      broadcastRoleTargets.length > 0 &&
      hasSubsetValue(pickViewportSubset(selectedNodeViewportPresentation, "spacing")),
  );
  const canPasteViewportType = Boolean(
    selectedNodeRole &&
      nodeStyleClipboard?.viewport &&
      hasSubsetValue(pickViewportSubset(nodeStyleClipboard.viewport, "typography")),
  );
  const canPasteViewportSpacing = Boolean(
    selectedNodeRole &&
      nodeStyleClipboard?.viewport &&
      hasSubsetValue(pickViewportSubset(nodeStyleClipboard.viewport, "spacing")),
  );
  const selectedStandaloneStylePresets = useMemo(
    () =>
      selectedStandaloneStyleNode
        ? standaloneStylePresetsForNode(selectedStandaloneStyleNode)
        : [],
    [selectedStandaloneStyleNode],
  );
  const selectedStandaloneFullStyle =
    selectedStandaloneStyleNode?.props.style;
  // #3b — per-field inherit/override rows for the selected node. Resolved off
  // the node's BASE style (not a responsive layer — inherit/override is a
  // base-level concept) against the draft component-default map. Empty for kinds
  // with no themable surface, so the panel self-hides.
  const nodeInheritRows = useMemo(
    () =>
      selectedStandaloneStyleNode
        ? buildFieldInheritRows(
            selectedStandaloneStyleNode.kind,
            selectedStandaloneFullStyle,
            draftComponentDefaults,
          )
        : [],
    [
      selectedStandaloneStyleNode,
      selectedStandaloneFullStyle,
      draftComponentDefaults,
    ],
  );
  // Job #33 — does the Typography / Spacing group carry a tablet/mobile override
  // (any responsive or container-query bucket)? Drives the per-group "Responsive"
  // dot so the difference is visible even while editing the desktop base.
  const typographyHasResponsiveOverride = styleGroupHasResponsiveOverride(
    selectedStandaloneFullStyle,
    FREEFORM_TYPOGRAPHY_STYLE_KEYS,
  );
  const spacingHasResponsiveOverride = styleGroupHasResponsiveOverride(
    selectedStandaloneFullStyle,
    FREEFORM_SPACING_STYLE_KEYS,
  );
  const selectedStandaloneViewportStyle = resolveBuilderNodeViewportStyle(
    selectedStandaloneFullStyle,
    selectedViewport,
    effectiveStandaloneStyleScope,
  );
  const selectedStandaloneViewportOverrideCount = Object.keys(
    selectedStandaloneViewportStyle ?? {},
  ).length;
  const canResetSelectedStandaloneViewport =
    selectedViewport === "desktop"
      ? Boolean(selectedStandaloneFullStyle)
      : effectiveStandaloneStyleScope === "container"
        ? Boolean(selectedStandaloneFullStyle?.containerQueries?.[selectedViewport])
        : Boolean(selectedStandaloneFullStyle?.responsive?.[selectedViewport]);
  const canCopyStandaloneDesktopToViewport =
    selectedViewport !== "desktop" &&
    Boolean(cleanBuilderNodeStyleValue(selectedStandaloneFullStyle));

  function cleanNodePresentation(
    value: NodePresentation | undefined,
  ): NodePresentation | undefined {
    if (!value) return undefined;
    const cleaned: NodePresentation = {};
    if (value.align) cleaned.align = value.align;
    if (
      typeof value.maxWidthPx === "number" &&
      Number.isFinite(value.maxWidthPx)
    ) {
      cleaned.maxWidthPx = value.maxWidthPx;
    }
    if (
      typeof value.marginTopPx === "number" &&
      Number.isFinite(value.marginTopPx)
    ) {
      cleaned.marginTopPx = value.marginTopPx;
    }
    if (
      typeof value.marginBottomPx === "number" &&
      Number.isFinite(value.marginBottomPx)
    ) {
      cleaned.marginBottomPx = value.marginBottomPx;
    }
    if (
      typeof value.marginInlinePx === "number" &&
      Number.isFinite(value.marginInlinePx)
    ) {
      cleaned.marginInlinePx = value.marginInlinePx;
    }
    if (
      typeof value.marginLeftPx === "number" &&
      Number.isFinite(value.marginLeftPx)
    ) {
      cleaned.marginLeftPx = value.marginLeftPx;
    }
    if (
      typeof value.marginRightPx === "number" &&
      Number.isFinite(value.marginRightPx)
    ) {
      cleaned.marginRightPx = value.marginRightPx;
    }
    if (
      typeof value.paddingTopPx === "number" &&
      Number.isFinite(value.paddingTopPx)
    ) {
      cleaned.paddingTopPx = value.paddingTopPx;
    }
    if (
      typeof value.paddingBottomPx === "number" &&
      Number.isFinite(value.paddingBottomPx)
    ) {
      cleaned.paddingBottomPx = value.paddingBottomPx;
    }
    if (
      typeof value.paddingInlinePx === "number" &&
      Number.isFinite(value.paddingInlinePx)
    ) {
      cleaned.paddingInlinePx = value.paddingInlinePx;
    }
    if (
      typeof value.paddingLeftPx === "number" &&
      Number.isFinite(value.paddingLeftPx)
    ) {
      cleaned.paddingLeftPx = value.paddingLeftPx;
    }
    if (
      typeof value.paddingRightPx === "number" &&
      Number.isFinite(value.paddingRightPx)
    ) {
      cleaned.paddingRightPx = value.paddingRightPx;
    }
    if (value.size) cleaned.size = value.size;
    if (value.tone) cleaned.tone = value.tone;
    if (value.visibility) cleaned.visibility = value.visibility;
    if (value.fontFamily) cleaned.fontFamily = value.fontFamily;
    if (typeof value.fontSizePx === "number" && Number.isFinite(value.fontSizePx)) {
      cleaned.fontSizePx = value.fontSizePx;
    }
    if (typeof value.fontWeight === "number" && Number.isFinite(value.fontWeight)) {
      cleaned.fontWeight = value.fontWeight;
    }
    if (
      typeof value.letterSpacingPx === "number" &&
      Number.isFinite(value.letterSpacingPx)
    ) {
      cleaned.letterSpacingPx = value.letterSpacingPx;
    }
    if (
      typeof value.lineHeightPct === "number" &&
      Number.isFinite(value.lineHeightPct)
    ) {
      cleaned.lineHeightPct = value.lineHeightPct;
    }
    if (value.textTransform) cleaned.textTransform = value.textTransform;
    if (value.textWrap) cleaned.textWrap = value.textWrap;
    if (value.whiteSpace) cleaned.whiteSpace = value.whiteSpace;
    if (typeof value.lineClamp === "number") cleaned.lineClamp = value.lineClamp;
    if (value.textColor) cleaned.textColor = value.textColor;
    if (value.backgroundColor) cleaned.backgroundColor = value.backgroundColor;
    if (value.borderColor) cleaned.borderColor = value.borderColor;
    if (
      typeof value.borderWidthPx === "number" &&
      Number.isFinite(value.borderWidthPx)
    ) {
      cleaned.borderWidthPx = value.borderWidthPx;
    }
    if (value.borderStyle) cleaned.borderStyle = value.borderStyle;
    const cleanBreakpoint = (
      breakpoint: NodePresentationValue | undefined,
    ): NodePresentationValue | undefined => {
      if (!breakpoint) return undefined;
      const out: NodePresentationValue = {};
      if (breakpoint.align) out.align = breakpoint.align;
      if (
        typeof breakpoint.maxWidthPx === "number" &&
        Number.isFinite(breakpoint.maxWidthPx)
      ) {
        out.maxWidthPx = breakpoint.maxWidthPx;
      }
      if (
        typeof breakpoint.marginTopPx === "number" &&
        Number.isFinite(breakpoint.marginTopPx)
      ) {
        out.marginTopPx = breakpoint.marginTopPx;
      }
      if (
        typeof breakpoint.marginBottomPx === "number" &&
        Number.isFinite(breakpoint.marginBottomPx)
      ) {
        out.marginBottomPx = breakpoint.marginBottomPx;
      }
      if (
        typeof breakpoint.marginInlinePx === "number" &&
        Number.isFinite(breakpoint.marginInlinePx)
      ) {
        out.marginInlinePx = breakpoint.marginInlinePx;
      }
      if (
        typeof breakpoint.marginLeftPx === "number" &&
        Number.isFinite(breakpoint.marginLeftPx)
      ) {
        out.marginLeftPx = breakpoint.marginLeftPx;
      }
      if (
        typeof breakpoint.marginRightPx === "number" &&
        Number.isFinite(breakpoint.marginRightPx)
      ) {
        out.marginRightPx = breakpoint.marginRightPx;
      }
      if (
        typeof breakpoint.paddingTopPx === "number" &&
        Number.isFinite(breakpoint.paddingTopPx)
      ) {
        out.paddingTopPx = breakpoint.paddingTopPx;
      }
      if (
        typeof breakpoint.paddingBottomPx === "number" &&
        Number.isFinite(breakpoint.paddingBottomPx)
      ) {
        out.paddingBottomPx = breakpoint.paddingBottomPx;
      }
      if (
        typeof breakpoint.paddingInlinePx === "number" &&
        Number.isFinite(breakpoint.paddingInlinePx)
      ) {
        out.paddingInlinePx = breakpoint.paddingInlinePx;
      }
      if (
        typeof breakpoint.paddingLeftPx === "number" &&
        Number.isFinite(breakpoint.paddingLeftPx)
      ) {
        out.paddingLeftPx = breakpoint.paddingLeftPx;
      }
      if (
        typeof breakpoint.paddingRightPx === "number" &&
        Number.isFinite(breakpoint.paddingRightPx)
      ) {
        out.paddingRightPx = breakpoint.paddingRightPx;
      }
      if (breakpoint.size) out.size = breakpoint.size;
      if (breakpoint.tone) out.tone = breakpoint.tone;
      if (breakpoint.visibility) out.visibility = breakpoint.visibility;
      if (breakpoint.fontFamily) out.fontFamily = breakpoint.fontFamily;
      if (
        typeof breakpoint.fontSizePx === "number" &&
        Number.isFinite(breakpoint.fontSizePx)
      ) {
        out.fontSizePx = breakpoint.fontSizePx;
      }
      if (
        typeof breakpoint.fontWeight === "number" &&
        Number.isFinite(breakpoint.fontWeight)
      ) {
        out.fontWeight = breakpoint.fontWeight;
      }
      if (
        typeof breakpoint.letterSpacingPx === "number" &&
        Number.isFinite(breakpoint.letterSpacingPx)
      ) {
        out.letterSpacingPx = breakpoint.letterSpacingPx;
      }
      if (
        typeof breakpoint.lineHeightPct === "number" &&
        Number.isFinite(breakpoint.lineHeightPct)
      ) {
        out.lineHeightPct = breakpoint.lineHeightPct;
      }
      if (breakpoint.textTransform) out.textTransform = breakpoint.textTransform;
      if (breakpoint.textWrap) out.textWrap = breakpoint.textWrap;
      if (breakpoint.whiteSpace) out.whiteSpace = breakpoint.whiteSpace;
      if (typeof breakpoint.lineClamp === "number") {
        out.lineClamp = breakpoint.lineClamp;
      }
      if (breakpoint.textColor) out.textColor = breakpoint.textColor;
      if (breakpoint.backgroundColor) {
        out.backgroundColor = breakpoint.backgroundColor;
      }
      if (breakpoint.borderColor) out.borderColor = breakpoint.borderColor;
      if (
        typeof breakpoint.borderWidthPx === "number" &&
        Number.isFinite(breakpoint.borderWidthPx)
      ) {
        out.borderWidthPx = breakpoint.borderWidthPx;
      }
      if (breakpoint.borderStyle) out.borderStyle = breakpoint.borderStyle;
      return Object.keys(out).length > 0 ? out : undefined;
    };
    const tablet = cleanBreakpoint(value.breakpoints?.tablet);
    const mobile = cleanBreakpoint(value.breakpoints?.mobile);
    if (tablet || mobile) {
      cleaned.breakpoints = {};
      if (tablet) cleaned.breakpoints.tablet = tablet;
      if (mobile) cleaned.breakpoints.mobile = mobile;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  function patchSelectedNodePresentation(patch: Partial<NodePresentationValue>) {
    if (!selectedNodeRole) return;
    const baseNodePresentation = nodePresentationRaw ?? {};
    const currentForRole =
      (baseNodePresentation[selectedNodeRole] as NodePresentation | undefined) ?? {};
    const nextForRole: NodePresentation = {
      ...currentForRole,
    };
    if (selectedViewport === "desktop") {
      if ("align" in patch) nextForRole.align = patch.align;
      if ("maxWidthPx" in patch) nextForRole.maxWidthPx = patch.maxWidthPx;
      if ("marginTopPx" in patch) nextForRole.marginTopPx = patch.marginTopPx;
      if ("marginBottomPx" in patch) {
        nextForRole.marginBottomPx = patch.marginBottomPx;
      }
      if ("marginInlinePx" in patch) {
        nextForRole.marginInlinePx = patch.marginInlinePx;
      }
      if ("marginLeftPx" in patch) nextForRole.marginLeftPx = patch.marginLeftPx;
      if ("marginRightPx" in patch) {
        nextForRole.marginRightPx = patch.marginRightPx;
      }
      if ("paddingTopPx" in patch) nextForRole.paddingTopPx = patch.paddingTopPx;
      if ("paddingBottomPx" in patch) {
        nextForRole.paddingBottomPx = patch.paddingBottomPx;
      }
      if ("paddingInlinePx" in patch) {
        nextForRole.paddingInlinePx = patch.paddingInlinePx;
      }
      if ("paddingLeftPx" in patch) {
        nextForRole.paddingLeftPx = patch.paddingLeftPx;
      }
      if ("paddingRightPx" in patch) {
        nextForRole.paddingRightPx = patch.paddingRightPx;
      }
      if ("size" in patch) nextForRole.size = patch.size;
      if ("tone" in patch) nextForRole.tone = patch.tone;
      if ("visibility" in patch) nextForRole.visibility = patch.visibility;
      if ("fontFamily" in patch) nextForRole.fontFamily = patch.fontFamily;
      if ("fontSizePx" in patch) nextForRole.fontSizePx = patch.fontSizePx;
      if ("fontWeight" in patch) nextForRole.fontWeight = patch.fontWeight;
      if ("letterSpacingPx" in patch) {
        nextForRole.letterSpacingPx = patch.letterSpacingPx;
      }
      if ("lineHeightPct" in patch) {
        nextForRole.lineHeightPct = patch.lineHeightPct;
      }
      if ("textTransform" in patch) {
        nextForRole.textTransform = patch.textTransform;
      }
      if ("textColor" in patch) nextForRole.textColor = patch.textColor;
      if ("backgroundColor" in patch) {
        nextForRole.backgroundColor = patch.backgroundColor;
      }
      if ("borderColor" in patch) nextForRole.borderColor = patch.borderColor;
      if ("borderWidthPx" in patch) {
        nextForRole.borderWidthPx = patch.borderWidthPx;
      }
      if ("borderStyle" in patch) nextForRole.borderStyle = patch.borderStyle;
    } else {
      const currentViewport = nextForRole.breakpoints?.[selectedViewport] ?? {};
      const nextViewport: NodePresentationValue = {
        ...currentViewport,
        ...patch,
      };
      nextForRole.breakpoints = {
        ...nextForRole.breakpoints,
        [selectedViewport]: nextViewport,
      };
    }
    const cleanedForRole = cleanNodePresentation(nextForRole);
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    if (!cleanedForRole) {
      delete nextNodePresentation[selectedNodeRole];
    } else {
      nextNodePresentation[selectedNodeRole] = cleanedForRole;
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
  }

  function patchNodeRoleByKey(
    role: string,
    patch: Partial<NodePresentation>,
  ) {
    const baseNodePresentation = nodePresentationRaw ?? {};
    const currentForRole =
      (baseNodePresentation[role] as NodePresentation | undefined) ?? {};
    setNodeRolePresentation(role as EditableNodeRole, {
      ...currentForRole,
      ...patch,
    });
  }

  function setNodeRolePresentation(
    role: EditableNodeRole,
    value: NodePresentation | undefined,
  ) {
    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    const cleanedForRole = cleanNodePresentation(value);
    if (!cleanedForRole) {
      delete nextNodePresentation[role];
    } else {
      nextNodePresentation[role] = cleanedForRole;
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
  }

  function resetSelectedViewportOverrides() {
    if (!selectedNodeRole || selectedViewport === "desktop") return;
    const baseNodePresentation = nodePresentationRaw ?? {};
    const currentForRole =
      (baseNodePresentation[selectedNodeRole] as NodePresentation | undefined) ?? {};
    if (!currentForRole.breakpoints?.[selectedViewport]) return;

    const nextForRole: NodePresentation = {
      ...currentForRole,
    };
    const nextBreakpoints = {
      ...(nextForRole.breakpoints ?? {}),
    };
    delete nextBreakpoints[selectedViewport];
    if (Object.keys(nextBreakpoints).length === 0) {
      delete nextForRole.breakpoints;
    } else {
      nextForRole.breakpoints = nextBreakpoints;
    }

    const cleanedForRole = cleanNodePresentation(nextForRole);
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    if (!cleanedForRole) {
      delete nextNodePresentation[selectedNodeRole];
    } else {
      nextNodePresentation[selectedNodeRole] = cleanedForRole;
    }

    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(`Reset ${selectedViewport} overrides`);
  }

  function resetSelectedNodeOverrides() {
    if (!selectedNodeRole) return;
    const baseNodePresentation = nodePresentationRaw ?? {};
    if (!baseNodePresentation[selectedNodeRole]) return;
    setNodeRolePresentation(selectedNodeRole, undefined);
    recordNodeAction("Reset block style");
  }

  function copyDesktopToSelectedViewport() {
    if (
      !selectedNodeRole ||
      selectedViewport === "desktop" ||
      !desktopNodeBase
    ) {
      return;
    }

    const baseNodePresentation = nodePresentationRaw ?? {};
    const currentForRole =
      (baseNodePresentation[selectedNodeRole] as NodePresentation | undefined) ?? {};
    const nextForRole: NodePresentation = {
      ...currentForRole,
      breakpoints: {
        ...currentForRole.breakpoints,
        [selectedViewport]: {
          ...desktopNodeBase,
        },
      },
    };

    const cleanedForRole = cleanNodePresentation(nextForRole);
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    if (!cleanedForRole) {
      delete nextNodePresentation[selectedNodeRole];
    } else {
      nextNodePresentation[selectedNodeRole] = cleanedForRole;
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
  }

  function copyDesktopToAllBreakpoints() {
    if (!selectedNodeRole || !desktopNodeBase) {
      return;
    }

    const baseNodePresentation = nodePresentationRaw ?? {};
    const currentForRole =
      (baseNodePresentation[selectedNodeRole] as NodePresentation | undefined) ?? {};
    const nextForRole: NodePresentation = {
      ...currentForRole,
      breakpoints: {
        ...currentForRole.breakpoints,
        tablet: {
          ...desktopNodeBase,
        },
        mobile: {
          ...desktopNodeBase,
        },
      },
    };

    const cleanedForRole = cleanNodePresentation(nextForRole);
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    if (!cleanedForRole) {
      delete nextNodePresentation[selectedNodeRole];
    } else {
      nextNodePresentation[selectedNodeRole] = cleanedForRole;
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
  }

  function applySpacingPreset(preset: SpacingPreset) {
    if (preset === "") {
      patchSelectedNodePresentation({
        marginTopPx: undefined,
        marginBottomPx: undefined,
        paddingTopPx: undefined,
        paddingBottomPx: undefined,
      });
      return;
    }
    if (preset === "tight") {
      patchSelectedNodePresentation({
        marginTopPx: 8,
        marginBottomPx: 8,
        paddingTopPx: 8,
        paddingBottomPx: 8,
      });
      return;
    }
    if (preset === "balanced") {
      patchSelectedNodePresentation({
        marginTopPx: 16,
        marginBottomPx: 16,
        paddingTopPx: 12,
        paddingBottomPx: 12,
      });
      return;
    }
    patchSelectedNodePresentation({
      marginTopPx: 28,
      marginBottomPx: 28,
      paddingTopPx: 18,
      paddingBottomPx: 18,
    });
  }

  function applyWidthPreset(preset: WidthPreset) {
    if (preset === "") {
      patchSelectedNodePresentation({ maxWidthPx: undefined });
      return;
    }
    if (preset === "narrow") {
      patchSelectedNodePresentation({ maxWidthPx: 360 });
      return;
    }
    if (preset === "reading") {
      patchSelectedNodePresentation({ maxWidthPx: 540 });
      return;
    }
    if (preset === "wide") {
      patchSelectedNodePresentation({ maxWidthPx: 760 });
      return;
    }
    patchSelectedNodePresentation({ maxWidthPx: 960 });
  }

  function copySelectedViewportToSibling() {
    if (!selectedNodeRole || !siblingViewport || !selectedNodeViewportPresentation) {
      return;
    }

    const baseNodePresentation = nodePresentationRaw ?? {};
    const currentForRole =
      (baseNodePresentation[selectedNodeRole] as NodePresentation | undefined) ?? {};
    const nextForRole: NodePresentation = {
      ...currentForRole,
      breakpoints: {
        ...currentForRole.breakpoints,
        [siblingViewport]: {
          ...selectedNodeViewportPresentation,
        },
      },
    };

    const cleanedForRole = cleanNodePresentation(nextForRole);
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    if (!cleanedForRole) {
      delete nextNodePresentation[selectedNodeRole];
    } else {
      nextNodePresentation[selectedNodeRole] = cleanedForRole;
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
  }

  function mirrorCtaRoleStyle() {
    if (!selectedNodeRole || !ctaMirrorTargetRole) return;
    const baseNodePresentation = nodePresentationRaw ?? {};
    const sourceForRole =
      (baseNodePresentation[selectedNodeRole] as NodePresentation | undefined) ?? undefined;
    if (!sourceForRole) {
      setNodeRolePresentation(ctaMirrorTargetRole, undefined);
      recordNodeAction("Mirrored CTA style (clear target)");
      return;
    }
    const mirrored: NodePresentation = {
      ...sourceForRole,
      breakpoints: sourceForRole.breakpoints
        ? {
            ...sourceForRole.breakpoints,
            tablet: sourceForRole.breakpoints.tablet
              ? { ...sourceForRole.breakpoints.tablet }
              : undefined,
            mobile: sourceForRole.breakpoints.mobile
              ? { ...sourceForRole.breakpoints.mobile }
              : undefined,
          }
        : undefined,
    };
    setNodeRolePresentation(ctaMirrorTargetRole, mirrored);
    recordNodeAction("Mirrored CTA style");
  }

  function copyNodeStyleToClipboard() {
    if (!selectedNodeRole || !selectedNodePresentation) return;
    const full = cleanNodePresentation(cloneNodePresentation(selectedNodePresentation));
    if (!full) return;
    setNodeStyleClipboard({
      role: selectedNodeRole,
      full,
      viewport: selectedNodeViewportPresentation
        ? { ...selectedNodeViewportPresentation }
        : null,
      viewportSource: selectedViewport,
    });
    recordNodeAction("Copied block style");
  }

  function pasteClipboardNodeStyle() {
    if (!selectedNodeRole || !nodeStyleClipboard?.full) return;
    const cloned = cloneNodePresentation(nodeStyleClipboard.full);
    setNodeRolePresentation(selectedNodeRole, cloned);
    recordNodeAction("Pasted full block style");
  }

  function pasteClipboardViewportStyle() {
    if (!selectedNodeRole || !nodeStyleClipboard?.viewport) return;
    const viewportPatch = {
      ...nodeStyleClipboard.viewport,
    };
    if (selectedViewport === "desktop") {
      setNodeRolePresentation(selectedNodeRole, {
        ...(selectedNodePresentation ?? {}),
        ...viewportPatch,
      });
      recordNodeAction("Pasted device style (desktop)");
      return;
    }
    const nextForRole: NodePresentation = {
      ...(selectedNodePresentation ?? {}),
      breakpoints: {
        ...(selectedNodePresentation?.breakpoints ?? {}),
        [selectedViewport]: viewportPatch,
      },
    };
    setNodeRolePresentation(selectedNodeRole, nextForRole);
    recordNodeAction(`Pasted device style (${selectedViewport})`);
  }

  function clearNodeStyleClipboard() {
    setNodeStyleClipboard(null);
    recordNodeAction("Cleared style clipboard");
  }

  function saveCurrentNodeStylePreset() {
    if (!selectedNodePresentation) return;
    const name = nodeStylePresetName.trim();
    if (!name) return;
    const cleaned = cleanNodePresentation(
      cloneNodePresentation(selectedNodePresentation),
    );
    if (!cleaned) return;
    setStoredNodeStylePresets((prev) => {
      const index = prev.findIndex(
        (entry) => entry.name.toLowerCase() === name.toLowerCase(),
      );
      const existingId = index === -1 ? null : prev[index]?.id ?? null;
      const baseId = normalizePresetNameToId(name);
      let candidateId = existingId ?? baseId;
      if (!existingId) {
        let suffix = 2;
        while (prev.some((entry) => entry.id === candidateId)) {
          candidateId = `${baseId}-${suffix}`;
          suffix += 1;
        }
        if (!candidateId) {
          candidateId = `preset-${presetFallbackIdRef.current}`;
          presetFallbackIdRef.current += 1;
        }
      }
      const preset: StoredNodeStylePreset = {
        id: candidateId,
        name,
        value: cleaned as ConcreteNodePresentation,
      };
      if (index === -1) {
        return [preset, ...prev].slice(0, 12);
      }
      const next = [...prev];
      next[index] = preset;
      return next;
    });
    setNodeStylePresetName("");
    recordNodeAction(`Saved preset "${name}"`);
  }

  function applyNodeStylePreset(preset: StoredNodeStylePreset) {
    if (!selectedNodeRole) return;
    setNodeRolePresentation(selectedNodeRole, cloneNodePresentation(preset.value));
    recordNodeAction(`Applied preset "${preset.name}"`);
  }

  function applyNodeStylePresetToGroup(preset: StoredNodeStylePreset) {
    if (broadcastRoleTargets.length === 0) return;
    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    for (const target of broadcastRoleTargets) {
      const cleaned = cleanNodePresentation(cloneNodePresentation(preset.value));
      if (!cleaned) {
        delete nextNodePresentation[target];
      } else {
        nextNodePresentation[target] = cleaned;
      }
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(
      `Applied preset "${preset.name}" to ${
        selectedRoleGroup === "text" ? "text" : "CTA"
      } nodes`,
    );
  }

  function applyNodeStylePresetSubset(
    preset: StoredNodeStylePreset,
    kind: ViewportSubsetKind,
  ) {
    if (!selectedNodeRole) return;
    const presetViewport = resolveViewportPresentationForValue(
      preset.value,
      selectedViewport,
    );
    if (!presetViewport) return;
    const subset = pickViewportSubset(presetViewport, kind);
    if (!hasSubsetValue(subset)) return;
    if (selectedViewport === "desktop") {
      setNodeRolePresentation(selectedNodeRole, {
        ...(selectedNodePresentation ?? {}),
        ...subset,
      });
      recordNodeAction(`Applied preset ${kind} "${preset.name}" (desktop)`);
      return;
    }
    const nextForRole: NodePresentation = {
      ...(selectedNodePresentation ?? {}),
      breakpoints: {
        ...(selectedNodePresentation?.breakpoints ?? {}),
        [selectedViewport]: {
          ...(selectedNodePresentation?.breakpoints?.[selectedViewport] ?? {}),
          ...subset,
        },
      },
    };
    setNodeRolePresentation(selectedNodeRole, nextForRole);
    recordNodeAction(
      `Applied preset ${kind} "${preset.name}" (${selectedViewport})`,
    );
  }

  function applyNodeStylePresetSubsetToGroup(
    preset: StoredNodeStylePreset,
    kind: ViewportSubsetKind,
  ) {
    if (broadcastRoleTargets.length === 0) return;
    const presetViewport = resolveViewportPresentationForValue(
      preset.value,
      selectedViewport,
    );
    if (!presetViewport) return;
    const subset = pickViewportSubset(presetViewport, kind);
    if (!hasSubsetValue(subset)) return;

    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };

    for (const target of broadcastRoleTargets) {
      const currentTarget =
        (baseNodePresentation[target] as NodePresentation | undefined) ?? {};
      const nextForRole: NodePresentation =
        selectedViewport === "desktop"
          ? {
              ...currentTarget,
              ...subset,
            }
          : {
              ...currentTarget,
              breakpoints: {
                ...(currentTarget.breakpoints ?? {}),
                [selectedViewport]: {
                  ...(currentTarget.breakpoints?.[selectedViewport] ?? {}),
                  ...subset,
                },
              },
            };
      const cleaned = cleanNodePresentation(nextForRole);
      if (!cleaned) {
        delete nextNodePresentation[target];
      } else {
        nextNodePresentation[target] = cleaned;
      }
    }

    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(
      `Applied preset ${kind} "${preset.name}" to ${
        selectedRoleGroup === "text" ? "text" : "CTA"
      } nodes`,
    );
  }

  function presetHasSubset(
    preset: StoredNodeStylePreset,
    kind: ViewportSubsetKind,
  ): boolean {
    const presetViewport = resolveViewportPresentationForValue(
      preset.value,
      selectedViewport,
    );
    if (!presetViewport) return false;
    return hasSubsetValue(pickViewportSubset(presetViewport, kind));
  }

  function removeNodeStylePreset(presetId: string) {
    setPresetDeleteConfirmTarget(null);
    setStoredNodeStylePresets((prev) => prev.filter((entry) => entry.id !== presetId));
    recordNodeAction("Deleted preset");
  }

  function confirmThenDeletePreset(presetId: string) {
    if (presetDeleteConfirmTarget === presetId) {
      removeNodeStylePreset(presetId);
      return;
    }
    setPresetDeleteConfirmTarget(presetId);
  }

  function duplicateNodeStylePreset(preset: StoredNodeStylePreset) {
    const cloneNameBase = `${preset.name} copy`;
    setStoredNodeStylePresets((prev) => {
      const takenIds = new Set(prev.map((entry) => entry.id));
      const cloneName = prev.some(
        (entry) => entry.name.toLowerCase() === cloneNameBase.toLowerCase(),
      )
        ? `${preset.name} copy ${prev.length + 1}`
        : cloneNameBase;
      const id = resolveUniquePresetId(normalizePresetNameToId(cloneName), takenIds);
      const nextPreset: StoredNodeStylePreset = {
        id,
        name: cloneName,
        value: cloneNodePresentation(preset.value),
      };
      return [nextPreset, ...prev].slice(0, 12);
    });
    recordNodeAction(`Cloned preset "${preset.name}"`);
  }

  function renameNodeStylePreset(preset: StoredNodeStylePreset) {
    // INS-3: opens inline rename overlay (replaces window.prompt).
    setRenamePresetTarget(preset);
  }

  function commitRenameNodeStylePreset(nextName: string) {
    const preset = renamePresetTarget;
    setRenamePresetTarget(null);
    if (!preset) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === preset.name) return;
    setStoredNodeStylePresets((prev) => {
      const next = [...prev];
      const index = next.findIndex((entry) => entry.id === preset.id);
      if (index < 0) return prev;
      next[index] = {
        ...next[index],
        name: trimmed,
      };
      return next;
    });
    recordNodeAction(`Renamed preset to "${trimmed}"`);
  }

  async function exportNodeStylePresetsJson() {
    if (storedNodeStylePresets.length === 0) return;
    const payload = JSON.stringify(storedNodeStylePresets, null, 2);
    if (typeof window === "undefined") return;
    try {
      if ("clipboard" in navigator && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        recordNodeAction("Copied presets JSON to clipboard");
        return;
      }
    } catch {
      // Clipboard not available — silently skip (the operator can use Export→clipboard manually).
    }
    // Clipboard unavailable — open inline import overlay pre-filled so user can copy from textarea.
    setImportPresetsOpen(true);
    recordNodeAction("Opened presets JSON");
  }

  function importNodeStylePresetsJson() {
    // INS-3: opens the inline import textarea (replaces window.prompt).
    setImportPresetsError(null);
    setImportPresetsOpen(true);
  }

  function commitImportNodeStylePresetsJson(raw: string) {
    setImportPresetsOpen(false);
    setImportPresetsError(null);
    if (!raw.trim()) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setImportPresetsError(
        "That isn't valid JSON. Paste the presets array you exported from this panel.",
      );
      return;
    }
    if (!Array.isArray(parsed)) {
      setImportPresetsError("Paste a JSON array of presets. Use Export from this panel first.");
      return;
    }

    let importedCount = 0;
    setStoredNodeStylePresets((prev) => {
      const next = [...prev];
      const taken = new Set(next.map((entry) => entry.id));
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const maybeName = (entry as { name?: unknown }).name;
        const maybeValue = (entry as { value?: unknown }).value;
        if (typeof maybeName !== "string" || !maybeName.trim()) continue;
        if (!maybeValue || typeof maybeValue !== "object") continue;

        const cleaned = cleanNodePresentation(
          cloneNodePresentation(maybeValue as ConcreteNodePresentation),
        );
        if (!cleaned) continue;

        const existingIndex = next.findIndex(
          (preset) => preset.name.toLowerCase() === maybeName.trim().toLowerCase(),
        );
        if (existingIndex >= 0) {
          const existingId = next[existingIndex]?.id ?? "";
          next[existingIndex] = {
            id: existingId || resolveUniquePresetId(normalizePresetNameToId(maybeName), taken),
            name: maybeName.trim(),
            value: cleaned as ConcreteNodePresentation,
          };
          importedCount += 1;
          continue;
        }

        const requestedIdRaw = (entry as { id?: unknown }).id;
        const requestedId =
          typeof requestedIdRaw === "string" && requestedIdRaw.trim()
            ? requestedIdRaw.trim()
            : normalizePresetNameToId(maybeName);
        const uniqueId = resolveUniquePresetId(requestedId, taken);
        taken.add(uniqueId);
        next.unshift({
          id: uniqueId,
          name: maybeName.trim(),
          value: cleaned as ConcreteNodePresentation,
        });
        importedCount += 1;
      }
      return next.slice(0, 12);
    });

    if (importedCount > 0) {
      recordNodeAction(`Imported ${importedCount} preset${importedCount === 1 ? "" : "s"}`);
      return;
    }
    setImportPresetsError("No valid presets found in payload.");
  }

  function broadcastSelectedRoleStyle() {
    if (!selectedNodeRole || !selectedNodePresentation) return;
    if (broadcastRoleTargets.length === 0) return;

    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };

    for (const target of broadcastRoleTargets) {
      const clonedSource = cloneNodePresentation(selectedNodePresentation);
      const cleaned = cleanNodePresentation(clonedSource);
      if (!cleaned) {
        delete nextNodePresentation[target];
      } else {
        nextNodePresentation[target] = cleaned;
      }
    }

    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(
      `Applied full style to ${selectedRoleGroup === "text" ? "text" : "CTA"} nodes`,
    );
  }

  function broadcastSelectedRoleViewportStyle() {
    if (!selectedNodeRole || !selectedNodeViewportPresentation) return;
    if (broadcastRoleTargets.length === 0) return;

    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    const viewportPatch = {
      ...selectedNodeViewportPresentation,
    };

    for (const target of broadcastRoleTargets) {
      const currentTarget =
        (baseNodePresentation[target] as NodePresentation | undefined) ?? {};
      const nextForRole: NodePresentation =
        selectedViewport === "desktop"
          ? {
              ...currentTarget,
              ...viewportPatch,
            }
          : {
              ...currentTarget,
              breakpoints: {
                ...(currentTarget.breakpoints ?? {}),
                [selectedViewport]: {
                  ...(currentTarget.breakpoints?.[selectedViewport] ?? {}),
                  ...viewportPatch,
                },
              },
            };
      const cleaned = cleanNodePresentation(nextForRole);
      if (!cleaned) {
        delete nextNodePresentation[target];
      } else {
        nextNodePresentation[target] = cleaned;
      }
    }

    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(
      `Applied ${selectedViewport} style to ${
        selectedRoleGroup === "text" ? "text" : "CTA"
      } nodes`,
    );
  }

  function resetRoleGroupStyles() {
    if (!selectedRoleGroup || roleGroupMembers.length === 0) return;
    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };
    for (const role of roleGroupMembers) {
      delete nextNodePresentation[role];
    }
    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(
      `Reset ${selectedRoleGroup === "text" ? "text" : "CTA"} group styles`,
    );
  }

  function pasteClipboardViewportSubset(kind: ViewportSubsetKind) {
    if (!selectedNodeRole || !nodeStyleClipboard?.viewport) return;
    const subset = pickViewportSubset(nodeStyleClipboard.viewport, kind);
    if (!hasSubsetValue(subset)) return;
    if (selectedViewport === "desktop") {
      setNodeRolePresentation(selectedNodeRole, {
        ...(selectedNodePresentation ?? {}),
        ...subset,
      });
      recordNodeAction(`Pasted ${kind} (desktop)`);
      return;
    }
    const nextForRole: NodePresentation = {
      ...(selectedNodePresentation ?? {}),
      breakpoints: {
        ...(selectedNodePresentation?.breakpoints ?? {}),
        [selectedViewport]: {
          ...(selectedNodePresentation?.breakpoints?.[selectedViewport] ?? {}),
          ...subset,
        },
      },
    };
    setNodeRolePresentation(selectedNodeRole, nextForRole);
    recordNodeAction(`Pasted ${kind} (${selectedViewport})`);
  }

  function broadcastSelectedRoleViewportSubset(kind: ViewportSubsetKind) {
    if (!selectedNodeRole || !selectedNodeViewportPresentation) return;
    if (broadcastRoleTargets.length === 0) return;
    const subset = pickViewportSubset(selectedNodeViewportPresentation, kind);
    if (!hasSubsetValue(subset)) return;

    const baseNodePresentation = nodePresentationRaw ?? {};
    const nextNodePresentation: Record<string, unknown> = {
      ...baseNodePresentation,
    };

    for (const target of broadcastRoleTargets) {
      const currentTarget =
        (baseNodePresentation[target] as NodePresentation | undefined) ?? {};
      const nextForRole: NodePresentation =
        selectedViewport === "desktop"
          ? {
              ...currentTarget,
              ...subset,
            }
          : {
              ...currentTarget,
              breakpoints: {
                ...(currentTarget.breakpoints ?? {}),
                [selectedViewport]: {
                  ...(currentTarget.breakpoints?.[selectedViewport] ?? {}),
                  ...subset,
                },
              },
            };
      const cleaned = cleanNodePresentation(nextForRole);
      if (!cleaned) {
        delete nextNodePresentation[target];
      } else {
        nextNodePresentation[target] = cleaned;
      }
    }

    onPatch({
      nodePresentation:
        Object.keys(nextNodePresentation).length > 0
          ? nextNodePresentation
          : undefined,
    });
    recordNodeAction(
      `Applied ${kind} to ${selectedRoleGroup === "text" ? "text" : "CTA"} nodes`,
    );
  }

  function setOrToggleNode(
    key: keyof NodePresentationValue,
    next: string,
  ) {
    const current = (selectedNodeViewportPresentation?.[key] as string | undefined) ?? "";
    const value = current === next ? undefined : next;
    if (key === "align") {
      patchSelectedNodePresentation({
        align: value as NodePresentationValue["align"],
      });
      return;
    }
    if (key === "size") {
      patchSelectedNodePresentation({
        size: value as NodePresentationValue["size"],
      });
      return;
    }
    if (key === "tone") {
      patchSelectedNodePresentation({
        tone: value as NodePresentationValue["tone"],
      });
      return;
    }
    if (key === "visibility") {
      patchSelectedNodePresentation({
        visibility: value as NodePresentationValue["visibility"],
      });
    }
  }

  function setHorizontalMode(
    kind: "margin" | "padding",
    mode: HorizontalSpacingMode,
  ) {
    if (kind === "margin") {
      patchSelectedNodePresentation({
        marginInlinePx:
          mode === "custom"
            ? undefined
            : selectedNodeViewportPresentation?.marginInlinePx,
        marginLeftPx: mode === "linked" ? undefined : selectedNodeViewportPresentation?.marginLeftPx,
        marginRightPx:
          mode === "linked" ? undefined : selectedNodeViewportPresentation?.marginRightPx,
      });
      return;
    }
    patchSelectedNodePresentation({
      paddingInlinePx:
        mode === "custom"
          ? undefined
          : selectedNodeViewportPresentation?.paddingInlinePx,
      paddingLeftPx:
        mode === "linked" ? undefined : selectedNodeViewportPresentation?.paddingLeftPx,
      paddingRightPx:
        mode === "linked" ? undefined : selectedNodeViewportPresentation?.paddingRightPx,
    });
  }

  const backgroundValue = present("background");
  const backgroundColorCustom = present("backgroundColorCustom");
  const customCss = present("customCss");
  const dividerValue = present("dividerTop");
  const moodValue = root("mood");
  const overlayValue = root("overlay");
  const layoutValue = root("layout");
  const videoBackground = present("videoBackground");
  const videoPoster = present("videoPoster");
  const videoOverlayRaw = (presentation as Record<string, unknown>).videoOverlay;
  const videoOverlay = typeof videoOverlayRaw === "number" ? videoOverlayRaw : 0;

  // Freeform-node free-color popover: one shared instance keyed by which field
  // is being edited, so the three swatches (text / fill / border) never stack
  // overlapping popovers.
  const [nodeColorField, setNodeColorField] = useState<{
    field: "textColor" | "backgroundColor" | "borderColor";
    anchor: HTMLButtonElement;
  } | null>(null);
  const [nodeFontPickerOpen, setNodeFontPickerOpen] = useState(false);
  // Curated-role free-color popover: same single-instance-keyed-by-field pattern
  // as the freeform nodeColorField, so the role's three swatches never stack.
  const [roleColorField, setRoleColorField] = useState<{
    field: "textColor" | "backgroundColor" | "borderColor";
    anchor: HTMLButtonElement;
  } | null>(null);
  const [roleFontPickerOpen, setRoleFontPickerOpen] = useState(false);
  function recordNodeAction(label: string) {
    const nextId = nodeActionIdRef.current;
    nodeActionIdRef.current += 1;
    setRecentNodeActions((prev) =>
      [
        {
          id: nextId,
          label,
        },
        ...prev,
      ].slice(0, 6),
    );
  }

  function patchSelectedStandaloneNodeProps(patch: Record<string, unknown>) {
    if (!selectedStandaloneStyleNode) return;
    const nodeId = selectedStandaloneStyleNode.id;
    const label = standaloneNodeLabel(selectedStandaloneStyleNode);
    // INS-1 — honor admin per-prop locks in the Style tab, mirroring the Content
    // tab's commitPatch. `patchBuilderNodeProps` (and the whole-tree
    // `enforceLockedPropsOnTree` backstop) re-strip server-trustedly; this client
    // mirror gives instant feedback + a clear "locked" message instead of a
    // silent no-op when an operator drags a locked color/spacing control. Nested
    // locks (`style.textColor`) restore just that leaf and let the rest through.
    const guarded = stripLockedKeysFromPatch(
      patch,
      selectedStandaloneStyleNode.props as Record<string, unknown>,
      selectedStandaloneStyleNode.lockedProps,
    );
    if (Object.keys(guarded).length === 0 && Object.keys(patch).length > 0) {
      reportMutationError(
        "That style is locked by the platform admin and can’t be changed.",
      );
      return;
    }
    standalonePatchChainRef.current = standalonePatchChainRef.current
      .catch(() => {
        // Keep the queue alive after a failed save attempt.
      })
      .then(async () => {
        const result = await patchBuilderNodeProps(nodeId, guarded);
        if (!result.ok) return;
        recordNodeAction(`Updated ${label}`);
      });
  }

  function selectViewport(next: NodeViewport) {
    setSelectedViewport(next);
    if (next === "desktop") setSelectedStandaloneStyleScope("viewport");
    // Job #2 — push the choice to the canvas device so the preview frame +
    // this panel all read the same breakpoint. The effect above keeps
    // `selectedViewport` mirrored on the way back.
    if (device !== next) setDevice(next);
  }

  function selectStandaloneStyleScope(next: StandaloneStyleScope) {
    setSelectedStandaloneStyleScope(next);
    if (next === "container" && selectedViewport === "desktop") {
      setSelectedViewport("tablet");
      // Keep the canvas in sync when switching to a container-query scope flips
      // the active viewport off desktop.
      if (device !== "tablet") setDevice("tablet");
    }
  }

  function patchSelectedStandaloneStyle(patch: Partial<BuilderNodeStyleValue>) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;

    // Thirty style keys have no breakpoint lane in the renderer. Written into
    // `responsive[viewport]` they validate, save, and read back into the field
    // on reload — and emit nothing. The control reports success and the page
    // never changes, which is the one kind of feedback an operator cannot
    // argue with and cannot debug.
    //
    // So route those keys to the BASE style instead: the setting takes effect
    // (for every screen size, the honest scope for a key with no per-screen
    // lane) rather than disappearing. Hover and the transition escape already
    // work exactly this way — see patchSelectedBaseStyle below.
    if (selectedViewport !== "desktop") {
      const desktopOnly: Record<string, unknown> = {};
      const scoped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        (isResponsivePlumbedStyleKey(key) ? scoped : desktopOnly)[key] = value;
      }
      if (Object.keys(desktopOnly).length > 0) {
        patchSelectedBaseStyle(desktopOnly as Partial<BuilderNodeStyle>);
        if (Object.keys(scoped).length === 0) return;
        patch = scoped as Partial<BuilderNodeStyleValue>;
      }
    }

    const nextStyle =
      selectedViewport === "desktop"
        ? cleanBuilderNodeStyle({
            ...currentStyle,
            ...patch,
          })
        : effectiveStandaloneStyleScope === "container"
          ? cleanBuilderNodeStyle({
              ...currentStyle,
              containerQueries: {
                ...(currentStyle?.containerQueries ?? {}),
                [selectedViewport]: cleanBuilderNodeStyleValue({
                  ...(currentStyle?.containerQueries?.[selectedViewport] ?? {}),
                  ...patch,
                }),
              },
            })
        : cleanBuilderNodeStyle({
            ...currentStyle,
            responsive: {
              ...(currentStyle?.responsive ?? {}),
              [selectedViewport]: cleanBuilderNodeStyleValue({
                ...(currentStyle?.responsive?.[selectedViewport] ?? {}),
                ...patch,
              }),
            },
          });
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps({ style: nextStyle });
  }

  // Patch top-level (non-viewport) style keys regardless of the active viewport.
  // Used for layers that aren't breakpoint-scoped — hover + the transition escape.
  function patchSelectedBaseStyle(patch: Partial<BuilderNodeStyle>) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const nextStyle = cleanBuilderNodeStyle({
      ...currentStyle,
      ...patch,
    });
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps({ style: nextStyle });
  }

  // Wave 3 · 3B — REPLACE the selected block's whole style object (not merge).
  // Used by the linked-style-classes bar to write/clear `classRef` and to
  // flatten a class on unlink. Keeps the draft ref in sync so a following field
  // edit merges onto the new style, mirroring patchSelectedBaseStyle.
  function setSelectedStandaloneStyleObject(style: BuilderNodeStyle | undefined) {
    if (!selectedStandaloneStyleNode) return;
    const nextStyle = cleanBuilderNodeStyle(style);
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps({ style: nextStyle });
  }

  // Merge a partial hover override into the single hover layer (base, not nested
  // under a viewport — hover is a pointer interaction, not a breakpoint).
  function patchSelectedHoverStyle(patch: Partial<BuilderNodeHoverStyle>) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    patchSelectedBaseStyle({
      hover: {
        ...(currentStyle?.hover ?? {}),
        ...patch,
      },
    });
  }

  // Wave 3 · 3D — patch a focus-visible or active state override. Merges onto
  // the existing stateStyles object (same pattern as patchSelectedHoverStyle).
  function patchSelectedStateStyle(
    stateKey: "focus" | "active",
    patch: Partial<BuilderNodeHoverStyle>,
  ) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    patchSelectedBaseStyle({
      stateStyles: {
        ...(currentStyle?.stateStyles ?? {}),
        [stateKey]: {
          ...(currentStyle?.stateStyles?.[stateKey] ?? {}),
          ...patch,
        },
      },
    });
  }

  function setOrToggleStandaloneStyle(
    key: keyof BuilderNodeStyleValue,
    next: string,
  ) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const current = resolveBuilderNodeViewportStyle(
      currentStyle,
      selectedViewport,
      effectiveStandaloneStyleScope,
    )?.[key];
    patchSelectedStandaloneStyle({
      [key]: current === next ? undefined : next,
    } as Partial<BuilderNodeStyleValue>);
  }

  function resetSelectedStandaloneStyle() {
    if (!selectedStandaloneStyleNode) return;
    if (selectedViewport === "desktop") {
      standaloneStyleDraftRef.current = {
        nodeId: selectedStandaloneStyleNode.id,
        style: undefined,
      };
      patchSelectedStandaloneNodeProps({ style: undefined });
      return;
    }
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    if (effectiveStandaloneStyleScope === "container") {
      const nextContainerQueries = {
        ...(currentStyle?.containerQueries ?? {}),
      };
      delete nextContainerQueries[selectedViewport];
      const nextStyle = cleanBuilderNodeStyle({
        ...currentStyle,
        containerQueries: nextContainerQueries,
      });
      standaloneStyleDraftRef.current = {
        nodeId: selectedStandaloneStyleNode.id,
        style: nextStyle ? { ...nextStyle } : undefined,
      };
      patchSelectedStandaloneNodeProps({ style: nextStyle });
      return;
    }
    const nextResponsive = {
      ...(currentStyle?.responsive ?? {}),
    };
    delete nextResponsive[selectedViewport];
    const nextStyle = cleanBuilderNodeStyle({
      ...currentStyle,
      responsive: nextResponsive,
    });
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps({ style: nextStyle });
  }

  function applyStandaloneStylePreset(preset: StandaloneStylePreset) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const nextStyle =
      selectedViewport === "desktop"
        ? cleanBuilderNodeStyle({
            ...currentStyle,
            ...(preset.style ?? {}),
          })
        : effectiveStandaloneStyleScope === "container"
          ? cleanBuilderNodeStyle({
              ...currentStyle,
              containerQueries: {
                ...(currentStyle?.containerQueries ?? {}),
                [selectedViewport]: cleanBuilderNodeStyleValue({
                  ...(currentStyle?.containerQueries?.[selectedViewport] ?? {}),
                  ...(preset.style ?? {}),
                }),
              },
            })
        : cleanBuilderNodeStyle({
            ...currentStyle,
            responsive: {
              ...(currentStyle?.responsive ?? {}),
              [selectedViewport]: cleanBuilderNodeStyleValue({
                ...(currentStyle?.responsive?.[selectedViewport] ?? {}),
                ...(preset.style ?? {}),
              }),
            },
          });
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps({
      ...(preset.propsPatch ?? {}),
      style: nextStyle,
    });
  }

  function copySelectedStandaloneStyle() {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const cleanedStyle = cleanBuilderNodeStyleValue(
      resolveBuilderNodeViewportStyle(
        currentStyle,
        selectedViewport,
        effectiveStandaloneStyleScope,
      ),
    );
    const clipboard: StandaloneStyleClipboard = {
      kind: selectedStandaloneStyleNode.kind,
      label: standaloneNodeLabel(selectedStandaloneStyleNode),
      viewport: selectedViewport,
      style: cleanedStyle ? { ...cleanedStyle } : undefined,
    };

    if (selectedStandaloneStyleNode.kind === "button") {
      if (selectedStandaloneStyleNode.props.tone) {
        clipboard.buttonTone = selectedStandaloneStyleNode.props.tone;
      }
      if (selectedStandaloneStyleNode.props.stateStyles) {
        clipboard.buttonStateStyles = {
          ...selectedStandaloneStyleNode.props.stateStyles,
        };
      }
    }

    if (
      !clipboard.style &&
      !clipboard.buttonTone &&
      !clipboard.buttonStateStyles
    ) {
      recordNodeAction("Nothing to copy");
      return;
    }

    setStandaloneStyleClipboard(clipboard);
    recordNodeAction(`Copied ${clipboard.label} style`);
  }

  function pasteStandaloneStyle() {
    if (!selectedStandaloneStyleNode || !standaloneStyleClipboard) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const nextStyle =
      selectedViewport === "desktop"
        ? cleanBuilderNodeStyle({
            ...currentStyle,
            ...(standaloneStyleClipboard.style ?? {}),
          })
        : effectiveStandaloneStyleScope === "container"
          ? cleanBuilderNodeStyle({
              ...currentStyle,
              containerQueries: {
                ...(currentStyle?.containerQueries ?? {}),
                [selectedViewport]: cleanBuilderNodeStyleValue({
                  ...(currentStyle?.containerQueries?.[selectedViewport] ?? {}),
                  ...(standaloneStyleClipboard.style ?? {}),
                }),
              },
            })
        : cleanBuilderNodeStyle({
            ...currentStyle,
            responsive: {
              ...(currentStyle?.responsive ?? {}),
              [selectedViewport]: cleanBuilderNodeStyleValue({
                ...(currentStyle?.responsive?.[selectedViewport] ?? {}),
                ...(standaloneStyleClipboard.style ?? {}),
              }),
            },
          });
    const patch: Record<string, unknown> = {
      style: nextStyle,
    };

    if (
      selectedStandaloneStyleNode.kind === "button" &&
      standaloneStyleClipboard.kind === "button"
    ) {
      patch.tone = standaloneStyleClipboard.buttonTone;
      patch.stateStyles = standaloneStyleClipboard.buttonStateStyles;
    }

    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps(patch);
    recordNodeAction(`Pasted ${standaloneStyleClipboard.label} style`);
  }

  function clearStandaloneStyleClipboard() {
    setStandaloneStyleClipboard(null);
    recordNodeAction("Cleared block style clipboard");
  }

  function copyStandaloneDesktopStyleToViewport() {
    if (!selectedStandaloneStyleNode || selectedViewport === "desktop") return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const desktopStyle = cleanBuilderNodeStyleValue(currentStyle);
    if (!desktopStyle) return;
    const nextStyle = cleanBuilderNodeStyle({
      ...currentStyle,
      [effectiveStandaloneStyleScope === "container"
        ? "containerQueries"
        : "responsive"]: {
        ...((effectiveStandaloneStyleScope === "container"
          ? currentStyle?.containerQueries
          : currentStyle?.responsive) ?? {}),
        [selectedViewport]: {
          ...desktopStyle,
        },
      },
    });
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: nextStyle ? { ...nextStyle } : undefined,
    };
    patchSelectedStandaloneNodeProps({ style: nextStyle });
    recordNodeAction(`Copied desktop style to ${selectedViewport}`);
  }

  function setButtonTone(
    key: "tone" | "hover" | "focus" | "active" | "disabled",
    next: string,
  ) {
    if (!selectedStandaloneStyleNode || selectedStandaloneStyleNode.kind !== "button") {
      return;
    }
    if (key === "tone") {
      patchSelectedStandaloneNodeProps({
        tone:
          selectedStandaloneStyleNode.props.tone === next
            ? undefined
            : next || undefined,
      });
      return;
    }
    const current = selectedStandaloneStyleNode.props.stateStyles ?? {};
    const nextTone = buttonStateTone(selectedStandaloneStyleNode, key);
    const nextStateStyles = {
      ...current,
      [key]: nextTone === next || !next ? undefined : { tone: next },
    };
    const cleaned = Object.fromEntries(
      Object.entries(nextStateStyles).filter(([, value]) => Boolean(value)),
    );
    patchSelectedStandaloneNodeProps({
      stateStyles: Object.keys(cleaned).length > 0 ? cleaned : undefined,
    });
  }
  useEffect(() => {
    if (!resetConfirmTarget) return;
    const timer = window.setTimeout(() => {
      setResetConfirmTarget(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [resetConfirmTarget]);
  useEffect(() => {
    if (!presetDeleteConfirmTarget) return;
    const timer = window.setTimeout(() => {
      setPresetDeleteConfirmTarget(null);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [presetDeleteConfirmTarget]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(NODE_STYLE_PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReadonlyArray<StoredNodeStylePreset>;
      if (!Array.isArray(parsed)) return;
      const clean = parsed
        .filter((entry) => entry && typeof entry.name === "string" && entry.value)
        .slice(0, 12);
      setStoredNodeStylePresets(clean);
    } catch {
      setStoredNodeStylePresets([]);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        NODE_STYLE_PRESET_STORAGE_KEY,
        JSON.stringify(storedNodeStylePresets),
      );
    } catch {
      // Ignore storage write failures (private mode/quota); presets stay in-memory.
    }
  }, [storedNodeStylePresets]);
  useEffect(() => {
    if (!selectedStandaloneStyleNode) {
      standaloneStyleDraftRef.current = { nodeId: null, style: undefined };
      return;
    }
    standaloneStyleDraftRef.current = {
      nodeId: selectedStandaloneStyleNode.id,
      style: selectedStandaloneStyleNode.props.style
        ? { ...selectedStandaloneStyleNode.props.style }
        : undefined,
    };
  }, [selectedStandaloneStyleNode]);

  function confirmThenRunReset(target: Exclude<ResetConfirmTarget, null>, run: () => void) {
    if (resetConfirmTarget === target) {
      setResetConfirmTarget(null);
      run();
      return;
    }
    setResetConfirmTarget(target);
  }

  // D1 (Inspector Reset P2) — one scope per panel. The blocks that write the
  // parent SECTION's `draftProps.presentation` render only when the section
  // itself is the selection; with a node selected the panel shows node-scoped
  // controls exclusively.
  const isSectionScope = !selectedNodeRole && !selectedStandaloneStyleNode;

  return (
    <InspectorBody>
      {/* Viewport scope is shown in the dock InspectorViewportRail (synced to canvas device). */}
      {selectedStandaloneStyleNode ? (
        <LockedFieldsBanner paths={styleLockedPaths} noun="styles" />
      ) : null}
      {selectedNodeRole && selectedNodeLabel ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <InspectorLabelWithInfo
              label={t("Selected block")}
              info="Device is controlled by the device rail above (synced to the canvas)."
              className={SECTION_TITLE}
            />
            <span className={INHERIT_HINT}>{selectedNodeLabel}</span>
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
                <div className="flex items-center justify-between gap-2">
                  <span className={FIELD_LABEL}>Device</span>
                  <div className="flex items-center gap-3">
                    {canCopyDesktopToAllViewports ? (
                      <button
                        type="button"
                        onClick={copyDesktopToAllBreakpoints}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Copy to all
                      </button>
                    ) : null}
                    {canCopyDesktopToViewport ? (
                      <button
                        type="button"
                        onClick={copyDesktopToSelectedViewport}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Copy desktop
                      </button>
                    ) : null}
                    {canCopyToSiblingViewport ? (
                      <button
                        type="button"
                        onClick={copySelectedViewportToSibling}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Copy to {siblingViewport}
                      </button>
                    ) : null}
                    {canMirrorCtaRole ? (
                      <button
                        type="button"
                        onClick={mirrorCtaRoleStyle}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Mirror CTA
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title="Undo"
                      aria-label="Undo"
                      onClick={() => {
                        void undo();
                        recordNodeAction("Undo");
                      }}
                      disabled={!canUndo}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em] transition-colors hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: CHROME.muted,
                        padding: 0,
                      }}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      title="Redo"
                      aria-label="Redo"
                      onClick={() => {
                        void redo();
                        recordNodeAction("Redo");
                      }}
                      disabled={!canRedo}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em] transition-colors hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: CHROME.muted,
                        padding: 0,
                      }}
                    >
                      Redo
                    </button>
                    {canCopyNodeStyle ? (
                      <button
                        type="button"
                        onClick={copyNodeStyleToClipboard}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Copy block
                      </button>
                    ) : null}
                    {canPasteNodeStyle ? (
                      <button
                        type="button"
                        onClick={pasteClipboardNodeStyle}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          nodeStyleClipboard
                            ? `Paste from ${nodeRoleLabel(nodeStyleClipboard.role) ?? "block"}`
                            : undefined
                        }
                      >
                        Paste block
                      </button>
                    ) : null}
                    {canPasteViewportStyle ? (
                      <button
                        type="button"
                        onClick={pasteClipboardViewportStyle}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          nodeStyleClipboard
                            ? `Paste ${nodeStyleClipboard.viewportSource} device only`
                            : undefined
                        }
                      >
                        Paste device
                      </button>
                    ) : null}
                    {canPasteViewportType ? (
                      <button
                        type="button"
                        onClick={() => pasteClipboardViewportSubset("typography")}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title="Paste device typography only"
                      >
                        Paste type
                      </button>
                    ) : null}
                    {canPasteViewportSpacing ? (
                      <button
                        type="button"
                        onClick={() => pasteClipboardViewportSubset("spacing")}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title="Paste device spacing only"
                      >
                        Paste spacing
                      </button>
                    ) : null}
                    {canBroadcastRoleStyle ? (
                      <button
                        type="button"
                        onClick={broadcastSelectedRoleStyle}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          selectedRoleGroup === "text"
                            ? "Apply style to all text blocks in this section"
                            : "Apply style to all CTA blocks in this section"
                        }
                      >
                        Apply to {selectedRoleGroup === "text" ? "text" : "CTAs"}
                      </button>
                    ) : null}
                    {canBroadcastRoleType ? (
                      <button
                        type="button"
                        onClick={() =>
                          broadcastSelectedRoleViewportSubset("typography")
                        }
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          selectedRoleGroup === "text"
                            ? `Apply ${selectedViewport} typography to all text blocks`
                            : `Apply ${selectedViewport} typography to all CTA blocks`
                        }
                      >
                        Apply type
                      </button>
                    ) : null}
                    {canBroadcastRoleSpacing ? (
                      <button
                        type="button"
                        onClick={() => broadcastSelectedRoleViewportSubset("spacing")}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          selectedRoleGroup === "text"
                            ? `Apply ${selectedViewport} spacing to all text blocks`
                            : `Apply ${selectedViewport} spacing to all CTA blocks`
                        }
                      >
                        Apply spacing
                      </button>
                    ) : null}
                    {canBroadcastRoleViewportStyle ? (
                      <button
                        type="button"
                        onClick={broadcastSelectedRoleViewportStyle}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          selectedRoleGroup === "text"
                            ? `Apply ${selectedViewport} style to all text blocks`
                            : `Apply ${selectedViewport} style to all CTA blocks`
                        }
                      >
                        Apply {selectedViewport}
                      </button>
                    ) : null}
                    {canResetRoleGroup ? (
                      <button
                        type="button"
                        onClick={() =>
                          confirmThenRunReset("group", resetRoleGroupStyles)
                        }
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={
                          resetConfirmTarget === "group"
                            ? DESTRUCTIVE_CONFIRM_STYLE
                            : {
                                background: "transparent",
                                border: "none",
                                color: CHROME.muted,
                                padding: 0,
                              }
                        }
                        title={
                          selectedRoleGroup === "text"
                            ? "Reset all text-block styles in this section"
                            : "Reset all CTA-block styles in this section"
                        }
                      >
                        {resetConfirmTarget === "group"
                          ? "Confirm reset"
                          : `Reset ${selectedRoleGroup === "text" ? "text" : "CTAs"}`}
                      </button>
                    ) : null}
                    {canClearClipboard ? (
                      <button
                        type="button"
                        onClick={clearNodeStyleClipboard}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Clear copy
                      </button>
                    ) : null}
                    {hasSelectedViewportOverrides ? (
                      <button
                        type="button"
                        onClick={resetSelectedViewportOverrides}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Reset {selectedViewport}
                      </button>
                    ) : null}
                    {hasSelectedNodeOverrides ? (
                      <button
                        type="button"
                        onClick={() =>
                          confirmThenRunReset("node", resetSelectedNodeOverrides)
                        }
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={
                          resetConfirmTarget === "node"
                            ? DESTRUCTIVE_CONFIRM_STYLE
                            : {
                                background: "transparent",
                                border: "none",
                                color: CHROME.muted,
                                padding: 0,
                              }
                        }
                      >
                        {resetConfirmTarget === "node" ? "Confirm reset" : "Reset block"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {selectedViewport !== "desktop" ? (
                  <p className={HINT}>
                    {`Editing ${selectedViewport}: ${selectedViewportOverrideCount} override${
                      selectedViewportOverrideCount === 1 ? "" : "s"
                    }.`}
                  </p>
                ) : null}
                {selectedViewport !== "desktop" ? (
                  <span className={INHERIT_HINT}>
                    {selectedViewportOverrideCount > 0
                      ? `${selectedViewportOverrideCount} field${
                          selectedViewportOverrideCount === 1 ? "" : "s"
                        } overridden on ${selectedViewport}; ${inheritedDesktopCount} inheriting desktop.`
                      : `No ${selectedViewport} overrides yet, all fields inherit desktop.`}
                  </span>
                ) : null}
                {nodeStyleClipboard ? (
                  <span className={INHERIT_HINT}>
                    Copied: {nodeRoleLabel(nodeStyleClipboard.role) ?? "Node"} (
                    {nodeStyleClipboard.viewportSource})
                  </span>
                ) : null}
                {recentNodeActions.length > 0 ? (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className={FIELD_LABEL}>Recent actions</span>
                    {recentNodeActions.slice(0, 4).map((entry) => (
                      <span key={entry.id} className={INHERIT_HINT}>
                        {entry.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-col gap-1 pt-1">
                  <span className={FIELD_LABEL}>Style presets</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nodeStylePresetName}
                      onChange={(e) => setNodeStylePresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveCurrentNodeStylePreset();
                        }
                      }}
                      placeholder="Preset name"
                      className="w-full px-2"
                      style={{
                        height: 28,
                        fontSize: 12,
                        background: CHROME.surface2,
                        border: `1px solid ${CHROME.lineMid}`,
                        borderRadius: 6,
                        color: CHROME.ink,
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={saveCurrentNodeStylePreset}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: CHROME.muted,
                        padding: 0,
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void importNodeStylePresetsJson();
                      }}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: CHROME.muted,
                        padding: 0,
                      }}
                    >
                      Import
                    </button>
                    {storedNodeStylePresets.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          void exportNodeStylePresetsJson();
                        }}
                        className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        Export
                      </button>
                    ) : null}
                  </div>
                  {importPresetsOpen ? (
                    <ImportPresetsOverlay
                      error={importPresetsError}
                      onConfirm={commitImportNodeStylePresetsJson}
                      onCancel={() => { setImportPresetsOpen(false); setImportPresetsError(null); }}
                    />
                  ) : null}
                  {storedNodeStylePresets.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {storedNodeStylePresets.slice(0, 4).map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className={INHERIT_HINT}>{preset.name}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => applyNodeStylePreset(preset)}
                              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: CHROME.muted,
                                padding: 0,
                              }}
                            >
                              Apply
                            </button>
                            {presetHasSubset(preset, "typography") ? (
                              <button
                                type="button"
                                onClick={() =>
                                  applyNodeStylePresetSubset(preset, "typography")
                                }
                                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: CHROME.muted,
                                  padding: 0,
                                }}
                              >
                                Type
                              </button>
                            ) : null}
                            {presetHasSubset(preset, "spacing") ? (
                              <button
                                type="button"
                                onClick={() =>
                                  applyNodeStylePresetSubset(preset, "spacing")
                                }
                                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: CHROME.muted,
                                  padding: 0,
                                }}
                              >
                                Space
                              </button>
                            ) : null}
                            {broadcastRoleTargets.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => applyNodeStylePresetToGroup(preset)}
                                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: CHROME.muted,
                                  padding: 0,
                                }}
                              >
                                Group
                              </button>
                            ) : null}
                            {broadcastRoleTargets.length > 0 &&
                            presetHasSubset(preset, "typography") ? (
                              <button
                                type="button"
                                onClick={() =>
                                  applyNodeStylePresetSubsetToGroup(
                                    preset,
                                    "typography",
                                  )
                                }
                                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: CHROME.muted,
                                  padding: 0,
                                }}
                              >
                                T+G
                              </button>
                            ) : null}
                            {broadcastRoleTargets.length > 0 &&
                            presetHasSubset(preset, "spacing") ? (
                              <button
                                type="button"
                                onClick={() =>
                                  applyNodeStylePresetSubsetToGroup(
                                    preset,
                                    "spacing",
                                  )
                                }
                                className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: CHROME.muted,
                                  padding: 0,
                                }}
                              >
                                S+G
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => renameNodeStylePreset(preset)}
                              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: CHROME.muted,
                                padding: 0,
                              }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateNodeStylePreset(preset)}
                              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: CHROME.muted,
                                padding: 0,
                              }}
                            >
                              Clone
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmThenDeletePreset(preset.id)}
                              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                              style={
                                presetDeleteConfirmTarget === preset.id
                                  ? DESTRUCTIVE_CONFIRM_STYLE
                                  : {
                                      background: "transparent",
                                      border: "none",
                                      color: CHROME.muted,
                                      padding: 0,
                                    }
                              }
                            >
                              {presetDeleteConfirmTarget === preset.id
                                ? "Confirm"
                                : "Delete"}
                            </button>
                          </div>
                        </div>
                      ))}
                      {renamePresetTarget ? (
                        <InlineNameInput
                          mode="text"
                          title={`Rename preset "${renamePresetTarget.name}"`}
                          defaultValue={renamePresetTarget.name}
                          placeholder="Preset name…"
                          confirmLabel="Rename"
                          onConfirm={commitRenameNodeStylePreset}
                          onCancel={() => setRenamePresetTarget(null)}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <span className={INHERIT_HINT}>
                      Save frequently used styles for reuse.
                    </span>
                  )}
                </div>
              </div>
              <SegmentedField
                label="Visibility"
                value={(selectedNodeViewportPresentation?.visibility as string | undefined) ?? ""}
                onChange={(next) => setOrToggleNode("visibility", next)}
                options={VISIBILITY_OPTIONS}
              />
              <SegmentedField
                label="Align"
                value={(selectedNodeViewportPresentation?.align as string | undefined) ?? ""}
                onChange={(next) => setOrToggleNode("align", next)}
                options={ALIGN_OPTIONS}
              />
              {!selectedNodeIsButton ? (
                <div className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Max width (px)</span>
                  <NumberUnit
                    units={["px"]}
                    defaultUnit="px"
                    min={120}
                    max={1200}
                    placeholder="Default"
                    value={pxLength(selectedNodeViewportPresentation?.maxWidthPx)}
                    onChange={(next) =>
                      patchSelectedNodePresentation({
                        maxWidthPx: next ? Math.round(next.value) : undefined,
                      })
                    }
                  />
                  <Segmented
                    fullWidth
                    compact
                    value={selectedWidthPreset ?? ""}
                    onChange={(next) => applyWidthPreset(next as WidthPreset)}
                    options={WIDTH_PRESET_OPTIONS}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Margin top (px)"
                  units={["px"]}
                  defaultUnit="px"
                  min={0}
                  max={240}
                  placeholder="Default"
                  value={pxLength(selectedNodeViewportPresentation?.marginTopPx)}
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      marginTopPx: next ? Math.round(next.value) : undefined,
                    })
                  }
                />
                <NumberField
                  label="Margin bottom (px)"
                  units={["px"]}
                  defaultUnit="px"
                  min={0}
                  max={240}
                  placeholder="Default"
                  value={pxLength(selectedNodeViewportPresentation?.marginBottomPx)}
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      marginBottomPx: next ? Math.round(next.value) : undefined,
                    })
                  }
                />
              </div>
              <SegmentedField
                label="Quick spacing"
                value={selectedSpacingPreset ?? ""}
                onChange={(next) => applySpacingPreset(next as SpacingPreset)}
                options={SPACING_PRESET_OPTIONS}
                hint="Fast-start spacing preset for this device."
              />
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Margin horizontal</span>
                <Segmented
                  fullWidth
                  compact
                  value={marginHorizontalMode}
                  onChange={(next) =>
                    setHorizontalMode(
                      "margin",
                      next as HorizontalSpacingMode,
                    )}
                  options={HORIZONTAL_MODE_OPTIONS}
                />
                {marginHorizontalMode === "linked" ? (
                  <NumberUnit
                    units={["px"]}
                    defaultUnit="px"
                    min={0}
                    max={200}
                    placeholder="Default"
                    value={pxLength(selectedNodeViewportPresentation?.marginInlinePx)}
                    onChange={(next) =>
                      patchSelectedNodePresentation({
                        marginInlinePx: next ? Math.round(next.value) : undefined,
                        marginLeftPx: undefined,
                        marginRightPx: undefined,
                      })
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberUnit
                      units={["px"]}
                      defaultUnit="px"
                      min={0}
                      max={200}
                      placeholder="Left"
                      value={pxLength(selectedNodeViewportPresentation?.marginLeftPx)}
                      onChange={(next) =>
                        patchSelectedNodePresentation({
                          marginLeftPx: next ? Math.round(next.value) : undefined,
                          marginInlinePx: undefined,
                        })
                      }
                    />
                    <NumberUnit
                      units={["px"]}
                      defaultUnit="px"
                      min={0}
                      max={200}
                      placeholder="Right"
                      value={pxLength(selectedNodeViewportPresentation?.marginRightPx)}
                      onChange={(next) =>
                        patchSelectedNodePresentation({
                          marginRightPx: next ? Math.round(next.value) : undefined,
                          marginInlinePx: undefined,
                        })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Pad top (px)"
                    units={["px"]}
                    defaultUnit="px"
                    min={0}
                    max={160}
                    placeholder="Default"
                    value={pxLength(selectedNodeViewportPresentation?.paddingTopPx)}
                    onChange={(next) =>
                      patchSelectedNodePresentation({
                        paddingTopPx: next ? Math.round(next.value) : undefined,
                      })
                    }
                  />
                  <NumberField
                    label="Pad bottom (px)"
                    units={["px"]}
                    defaultUnit="px"
                    min={0}
                    max={160}
                    placeholder="Default"
                    value={pxLength(selectedNodeViewportPresentation?.paddingBottomPx)}
                    onChange={(next) =>
                      patchSelectedNodePresentation({
                        paddingBottomPx: next ? Math.round(next.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Padding horizontal</span>
                  <Segmented
                    fullWidth
                    compact
                    value={paddingHorizontalMode}
                    onChange={(next) =>
                      setHorizontalMode(
                        "padding",
                        next as HorizontalSpacingMode,
                      )}
                    options={HORIZONTAL_MODE_OPTIONS}
                  />
                  {paddingHorizontalMode === "linked" ? (
                    <NumberUnit
                      units={["px"]}
                      defaultUnit="px"
                      min={0}
                      max={120}
                      placeholder="Default"
                      value={pxLength(selectedNodeViewportPresentation?.paddingInlinePx)}
                      onChange={(next) =>
                        patchSelectedNodePresentation({
                          paddingInlinePx: next ? Math.round(next.value) : undefined,
                          paddingLeftPx: undefined,
                          paddingRightPx: undefined,
                        })
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <NumberUnit
                        units={["px"]}
                        defaultUnit="px"
                        min={0}
                        max={120}
                        placeholder="Left"
                        value={pxLength(selectedNodeViewportPresentation?.paddingLeftPx)}
                        onChange={(next) =>
                          patchSelectedNodePresentation({
                            paddingLeftPx: next ? Math.round(next.value) : undefined,
                            paddingInlinePx: undefined,
                          })
                        }
                      />
                      <NumberUnit
                        units={["px"]}
                        defaultUnit="px"
                        min={0}
                        max={120}
                        placeholder="Right"
                        value={pxLength(selectedNodeViewportPresentation?.paddingRightPx)}
                        onChange={(next) =>
                          patchSelectedNodePresentation({
                            paddingRightPx: next ? Math.round(next.value) : undefined,
                            paddingInlinePx: undefined,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
              {/* Box-model diagram — collapsible visual shortcut for the spacing fields above */}
              <details
                data-node-presentation-control="box-model"
              >
                <summary
                  className="flex items-center justify-between select-none"
                  style={{ cursor: "pointer", outline: "none", listStyle: "none" }}
                >
                  <span className={FIELD_LABEL}>Box model</span>
                  <span style={{ color: CHROME.muted, fontSize: 9 }}>›</span>
                </summary>
                <div className="mt-2">
                  <BoxModel
                    margin={{
                      top: selectedNodeViewportPresentation?.marginTopPx ?? null,
                      right: selectedNodeViewportPresentation?.marginRightPx
                        ?? selectedNodeViewportPresentation?.marginInlinePx
                        ?? null,
                      bottom: selectedNodeViewportPresentation?.marginBottomPx ?? null,
                      left: selectedNodeViewportPresentation?.marginLeftPx
                        ?? selectedNodeViewportPresentation?.marginInlinePx
                        ?? null,
                    }}
                    padding={{
                      top: selectedNodeViewportPresentation?.paddingTopPx ?? null,
                      right: selectedNodeViewportPresentation?.paddingRightPx
                        ?? selectedNodeViewportPresentation?.paddingInlinePx
                        ?? null,
                      bottom: selectedNodeViewportPresentation?.paddingBottomPx ?? null,
                      left: selectedNodeViewportPresentation?.paddingLeftPx
                        ?? selectedNodeViewportPresentation?.paddingInlinePx
                        ?? null,
                    }}
                    maxMargin={240}
                    maxPadding={160}
                    onChangeMargin={(side, value) => {
                      if (side === "top") patchSelectedNodePresentation({ marginTopPx: value ?? undefined });
                      else if (side === "bottom") patchSelectedNodePresentation({ marginBottomPx: value ?? undefined });
                      else if (side === "left") patchSelectedNodePresentation({ marginLeftPx: value ?? undefined, marginInlinePx: undefined });
                      else if (side === "right") patchSelectedNodePresentation({ marginRightPx: value ?? undefined, marginInlinePx: undefined });
                    }}
                    onChangePadding={(side, value) => {
                      if (side === "top") patchSelectedNodePresentation({ paddingTopPx: value ?? undefined });
                      else if (side === "bottom") patchSelectedNodePresentation({ paddingBottomPx: value ?? undefined });
                      else if (side === "left") patchSelectedNodePresentation({ paddingLeftPx: value ?? undefined, paddingInlinePx: undefined });
                      else if (side === "right") patchSelectedNodePresentation({ paddingRightPx: value ?? undefined, paddingInlinePx: undefined });
                    }}
                  />
                </div>
              </details>
              <SegmentedField
                label="Size"
                value={(selectedNodeViewportPresentation?.size as string | undefined) ?? ""}
                onChange={(next) => setOrToggleNode("size", next)}
                options={SIZE_OPTIONS}
              />
              {!selectedNodeIsButton ? (
                <SegmentedField
                  label="Tone"
                  value={(selectedNodeViewportPresentation?.tone as string | undefined) ?? ""}
                  onChange={(next) => setOrToggleNode("tone", next)}
                  options={TONE_OPTIONS}
                />
              ) : null}

              <div
                className="flex flex-col gap-2 border-t pt-3"
                data-node-presentation-control="typography"
                style={{ borderColor: CHROME.line }}
              >
                <div className="flex items-end justify-between gap-2">
                  <span className={FIELD_LABEL}>Font</span>
                  <button
                    type="button"
                    data-node-presentation-control="fontFamily-toggle"
                    onClick={() => setRoleFontPickerOpen((v) => !v)}
                    className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: CHROME.muted,
                      padding: 0,
                    }}
                  >
                    {roleFontPickerOpen ? "Close" : "Change"}
                  </button>
                </div>
                <span
                  className="truncate text-[11px]"
                  style={{
                    color: selectedNodeViewportPresentation?.fontFamily
                      ? CHROME.ink
                      : CHROME.muted2,
                    fontFamily:
                      selectedNodeViewportPresentation?.fontFamily || undefined,
                  }}
                >
                  {selectedNodeViewportPresentation?.fontFamily
                    ? selectedNodeViewportPresentation.fontFamily
                        .split(",")[0]
                        .replace(/["']/g, "")
                    : "Theme default"}
                </span>
                {roleFontPickerOpen ? (
                  <GoogleFontPicker
                    slot={selectedNodeRole === "copy" ? "body" : "heading"}
                    value={selectedNodeViewportPresentation?.fontFamily ?? ""}
                    onChange={(next) =>
                      patchSelectedNodePresentation({
                        fontFamily: next || undefined,
                      })
                    }
                  />
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="flex flex-col gap-1.5"
                    data-node-presentation-control="fontSizePx"
                  >
                    <span className={FIELD_LABEL}>Size</span>
                    <NumberUnit
                      units={["px"]}
                      defaultUnit="px"
                      min={8}
                      max={240}
                      placeholder="Theme"
                      value={pxLength(selectedNodeViewportPresentation?.fontSizePx)}
                      onChange={(next) =>
                        patchSelectedNodePresentation({
                          fontSizePx: next ? Math.round(next.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <NumberField
                    dataPresentationControl="lineHeightPct"
                    label="Line height"
                    units={["%"]}
                    defaultUnit="%"
                    min={80}
                    max={300}
                    step={10}
                    placeholder="Theme"
                    value={pctLength(
                      selectedNodeViewportPresentation?.lineHeightPct,
                    )}
                    onChange={(next) =>
                      patchSelectedNodePresentation({
                        lineHeightPct: next
                          ? Math.round(next.value)
                          : undefined,
                      })
                    }
                  />
                </div>

                <NumberField
                  dataPresentationControl="letterSpacingPx"
                  label="Letter spacing"
                  units={["px"]}
                  defaultUnit="px"
                  step={0.5}
                  min={-5}
                  max={30}
                  placeholder="Theme"
                  value={pxLength(
                    selectedNodeViewportPresentation?.letterSpacingPx,
                  )}
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      letterSpacingPx: next ? next.value : undefined,
                    })
                  }
                />

                <SegmentedField
                  dataPresentationControl="fontWeight"
                  label="Weight"
                  value={
                    selectedNodeViewportPresentation?.fontWeight
                      ? String(selectedNodeViewportPresentation.fontWeight)
                      : ""
                  }
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      fontWeight: next ? Number(next) : undefined,
                    })
                  }
                  options={BUILDER_NODE_FONT_WEIGHT_OPTIONS}
                />

                <SegmentedField
                  dataPresentationControl="textTransform"
                  label="Transform"
                  value={selectedNodeViewportPresentation?.textTransform ?? ""}
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      textTransform:
                        (next || undefined) as NodePresentationValue["textTransform"],
                    })
                  }
                  options={BUILDER_NODE_TEXT_TRANSFORM_OPTIONS}
                />

                <SegmentedField
                  dataPresentationControl="textWrap"
                  label="Text wrap"
                  value={selectedNodeViewportPresentation?.textWrap ?? ""}
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      textWrap:
                        (next || undefined) as NodePresentationValue["textWrap"],
                    })
                  }
                  options={BUILDER_NODE_TEXT_WRAP_OPTIONS}
                />

                <SegmentedField
                  dataPresentationControl="whiteSpace"
                  label="Whitespace"
                  value={selectedNodeViewportPresentation?.whiteSpace ?? ""}
                  onChange={(next) =>
                    patchSelectedNodePresentation({
                      whiteSpace:
                        (next || undefined) as NodePresentationValue["whiteSpace"],
                    })
                  }
                  options={BUILDER_NODE_WHITE_SPACE_OPTIONS}
                />

                <div
                  className="flex flex-col gap-1.5"
                  data-node-presentation-control="lineClamp"
                >
                  <span className={FIELD_LABEL}>Truncate to lines</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    placeholder="Off"
                    className="px-2"
                    style={{
                      height: 30,
                      width: "100%",
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    value={
                      typeof selectedNodeViewportPresentation?.lineClamp ===
                      "number"
                        ? selectedNodeViewportPresentation.lineClamp
                        : ""
                    }
                    onChange={(e) => {
                      const raw = e.currentTarget.value.trim();
                      const n = raw ? Math.round(Number(raw)) : NaN;
                      patchSelectedNodePresentation({
                        lineClamp:
                          Number.isFinite(n) && n >= 1 ? n : undefined,
                      });
                    }}
                  />
                </div>
              </div>

              <div
                className="flex flex-col gap-2 border-t pt-3"
                data-node-presentation-control="color"
                style={{ borderColor: CHROME.line }}
              >
                <span className={FIELD_LABEL}>Color &amp; border</span>

                <div
                  className="flex items-center justify-between gap-2"
                  data-node-presentation-control="textColor"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Text
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedNodeViewportPresentation?.textColor ? (
                      <button
                        type="button"
                        onClick={() =>
                          patchSelectedNodePresentation({ textColor: undefined })
                        }
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
                    ) : null}
                    <button
                      type="button"
                      aria-label="Pick text color"
                      onClick={(e) => {
                        const btn = e.currentTarget;
                        setRoleColorField((prev) =>
                          prev?.field === "textColor"
                            ? null
                            : { field: "textColor", anchor: btn },
                        );
                      }}
                      className="cursor-pointer"
                      style={inspectorColorSwatchStyle(
                        Boolean(selectedNodeViewportPresentation?.textColor),
                        colorSwatchDisplay(
                          selectedNodeViewportPresentation?.textColor,
                        ),
                        { border: `1px solid ${CHROME.lineMid}` },
                      )}
                    />
                  </div>
                </div>

                <div
                  className="flex items-center justify-between gap-2"
                  data-node-presentation-control="backgroundColor"
                >
                  <span className="text-[11px]" style={{ color: CHROME.muted }}>
                    Fill
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedNodeViewportPresentation?.backgroundColor ? (
                      <button
                        type="button"
                        onClick={() =>
                          patchSelectedNodePresentation({
                            backgroundColor: undefined,
                          })
                        }
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
                    ) : null}
                    <button
                      type="button"
                      aria-label="Pick fill color"
                      onClick={(e) => {
                        const btn = e.currentTarget;
                        setRoleColorField((prev) =>
                          prev?.field === "backgroundColor"
                            ? null
                            : { field: "backgroundColor", anchor: btn },
                        );
                      }}
                      className="cursor-pointer"
                      style={inspectorColorSwatchStyle(
                        Boolean(selectedNodeViewportPresentation?.backgroundColor),
                        colorSwatchDisplay(
                          selectedNodeViewportPresentation?.backgroundColor,
                        ),
                        { border: `1px solid ${CHROME.lineMid}` },
                      )}
                    />
                  </div>
                </div>

                <div
                  className="flex flex-col gap-1.5"
                  data-node-presentation-control="border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color: CHROME.muted }}>
                      Border
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedNodeViewportPresentation?.borderColor ? (
                        <button
                          type="button"
                          onClick={() =>
                            patchSelectedNodePresentation({
                              borderColor: undefined,
                            })
                          }
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
                      ) : null}
                      <button
                        type="button"
                        aria-label="Pick border color"
                        onClick={(e) => {
                          const btn = e.currentTarget;
                          setRoleColorField((prev) =>
                            prev?.field === "borderColor"
                              ? null
                              : { field: "borderColor", anchor: btn },
                          );
                        }}
                        className="cursor-pointer"
                        style={inspectorColorSwatchStyle(
                          Boolean(selectedNodeViewportPresentation?.borderColor),
                          colorSwatchDisplay(
                            selectedNodeViewportPresentation?.borderColor,
                          ),
                          { border: `1px solid ${CHROME.lineMid}` },
                        )}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberUnit
                      units={["px"]}
                      defaultUnit="px"
                      placeholder="Width"
                      min={0}
                      max={24}
                      value={pxLength(
                        selectedNodeViewportPresentation?.borderWidthPx,
                      )}
                      onChange={(next) =>
                        patchSelectedNodePresentation({
                          borderWidthPx: next
                            ? Math.round(next.value)
                            : undefined,
                        })
                      }
                    />
                    <Segmented
                      fullWidth
                      compact
                      value={selectedNodeViewportPresentation?.borderStyle ?? ""}
                      onChange={(next) =>
                        patchSelectedNodePresentation({
                          borderStyle:
                            (next || undefined) as NodePresentationValue["borderStyle"],
                        })
                      }
                      options={BUILDER_NODE_BORDER_STYLE_OPTIONS}
                    />
                  </div>
                </div>

                <ColorPickerPopover
                  open={roleColorField !== null}
                  anchor={roleColorField?.anchor ?? null}
                  themeTokens={BUILDER_NODE_THEME_COLOR_TOKENS}
                  value={
                    (roleColorField
                      ? selectedNodeViewportPresentation?.[roleColorField.field]
                      : undefined) || "#111111"
                  }
                  onChange={(next) => {
                    if (!roleColorField) return;
                    patchSelectedNodePresentation({
                      [roleColorField.field]: next,
                    } as Partial<NodePresentationValue>);
                  }}
                  onClose={() => setRoleColorField(null)}
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {!selectedNodeRole && selectedStandaloneStyleNode ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <InspectorLabelWithInfo
              label={t("Selected block")}
              info={t(
                "Device is controlled by the device rail above the inspector (synced to the canvas).",
              )}
              className={SECTION_TITLE}
            />
            <div className="flex items-center gap-2">
              {styleLockedPaths.length > 0 ? <LockBadge /> : null}
              <span className={INHERIT_HINT}>
                {standaloneNodeLabel(selectedStandaloneStyleNode)}
              </span>
            </div>
          </div>
          <div
            className="flex flex-col gap-3"
            data-builder-node-style-panel={selectedStandaloneStyleNode.kind}
          >
            <p className={HINT}>
              {selectedViewport !== "desktop"
                ? `${t(
                    selectedStandaloneViewportOverrideCount === 1
                      ? "Editing {device} overrides: {count} field set."
                      : "Editing {device} overrides: {count} fields set.",
                  )
                    .replace("{device}", t(selectedViewport))
                    .replace(
                      "{count}",
                      String(selectedStandaloneViewportOverrideCount),
                    )}`
                : ""}
            </p>
            {selectedViewport !== "desktop" ? (
                <button
                  type="button"
                  data-builder-node-style-copy-desktop=""
                  onClick={copyStandaloneDesktopStyleToViewport}
                  disabled={!canCopyStandaloneDesktopToViewport}
                  className="text-[10px] font-semibold uppercase tracking-[0.10em]"
                  style={{
                    alignSelf: "flex-start",
                    background: "transparent",
                    border: "none",
                    color: canCopyStandaloneDesktopToViewport
                      ? CHROME.muted
                      // D6 — disabled must read disabled; muted2 was a ~4%
                      // luminance shift from the enabled tone.
                      : CHROME.muted3,
                    cursor: canCopyStandaloneDesktopToViewport
                      ? "pointer"
                      : "not-allowed",
                    padding: 0,
                  }}
                >
                  {t("Copy desktop to {device}").replace(
                    "{device}",
                    t(selectedViewport),
                  )}
                </button>
              ) : null}

            {["container", "split", "card", "cta_group"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div
                className="flex flex-col gap-2 border-t pt-3"
                data-builder-node-style-control="containerQueries"
                style={{ borderColor: CHROME.line }}
              >
                <span className={FIELD_LABEL}>{t("Query container")}</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneFullStyle?.containerType ?? ""}
                  onChange={(next) =>
                    patchSelectedBaseStyle({
                      containerType:
                        (next || undefined) as BuilderNodeStyleValue["containerType"],
                    })
                  }
                  options={BUILDER_NODE_CONTAINER_TYPE_OPTIONS}
                />
                <input
                  type="text"
                  className="px-2"
                  style={{
                    height: 30,
                    width: "100%",
                    fontSize: 12,
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  placeholder="container name"
                  value={selectedStandaloneFullStyle?.containerName ?? ""}
                  onChange={(e) =>
                    patchSelectedBaseStyle({
                      containerName: e.target.value.trim() || undefined,
                    })
                  }
                />
              </div>
            ) : null}

            {selectedInstanceComponentId && selectedBuilderNodeId ? (
              <div
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5"
                data-builder-node-linked-instance=""
                style={{
                  background: CHROME.surface,
                  border: `1px solid ${CHROME.line}`,
                }}
              >
                <span
                  className="text-[10.5px] font-semibold"
                  style={{ color: CHROME.muted }}
                >
                  ⟳ Linked instance
                </span>
                <button
                  type="button"
                  data-builder-node-detach-instance=""
                  className="cursor-pointer text-[10.5px] font-semibold"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: CHROME.ink,
                    padding: 0,
                  }}
                  onClick={() => {
                    void detachComponentInstance(selectedBuilderNodeId);
                  }}
                >
                  Detach
                </button>
              </div>
            ) : null}

            {selectedInstanceComponentId && selectedBuilderNodeId ? (
              <>
                <InstanceVariantPicker
                  instanceNodeId={selectedBuilderNodeId}
                  componentId={selectedInstanceComponentId}
                />
                <InstanceOverridesPanel
                instanceNodeId={selectedBuilderNodeId}
                componentId={selectedInstanceComponentId}
                overrides={
                  selectedStandaloneStyleNode?.kind === "container"
                    ? selectedStandaloneStyleNode.props.instanceOverrides
                    : undefined
                }
                />
              </>
            ) : null}

            {advanced ? (
              <>
                <StylePresetsBar
                  pageId={pageId}
                  currentStyle={selectedStandaloneFullStyle ?? undefined}
                  onApply={(style) => patchSelectedBaseStyle(style)}
                />

                <LinkedStyleClassesBar
                  pageId={pageId}
                  currentStyle={selectedStandaloneFullStyle ?? undefined}
                  onSetStyle={(style) => setSelectedStandaloneStyleObject(style)}
                />
              </>
            ) : null}

            {/* #3b — per-field Inherit / Override (Figma/Webflow-style). Writes
                route through patchSelectedBaseStyle, the SAME base-style chain
                the color/size rows use — inherit = clear the literal (cascade
                default shows), override = seed the resolved value to edit. */}
            <NodeThemeInheritancePanel
              rows={nodeInheritRows}
              onInherit={(field) =>
                patchSelectedBaseStyle({ [field]: undefined })
              }
              onOverride={(field, seedValue) =>
                patchSelectedBaseStyle({
                  [field]: seedValue || undefined,
                })
              }
            />

            {/* Mockup annotation C — quick styles are the front door, and now
                they look like it. The thumbnails are derived from each
                preset's own style object; see QuickStyleCards. */}
            <QuickStyleCards
              presets={selectedStandaloneStylePresets}
              onApply={applyStandaloneStylePreset}
              scopeLabel={selectedViewport}
            />

            {/* ── D4: the group stack ─────────────────────────────────────
                Was SIX hardcoded section mounts, every one of them rendered
                for every selection — including "Typography" holding a lone
                Align control on a container and an "Appearance" a divider
                cannot use. The stack now asks `styleGroupsForKind` which of
                Text / Layout & spacing / Appearance this kind gets, renders
                them in D4's order with the first one open, and ends at ONE
                Advanced that absorbs position, motion, states, visibility and
                custom CSS. See style-panel/group-recipes.ts. ── */}
            <StyleGroupStack
              nodeColorField={nodeColorField}
              nodeFontPickerOpen={nodeFontPickerOpen}
              patchSelectedBaseStyle={patchSelectedBaseStyle}
              patchSelectedHoverStyle={patchSelectedHoverStyle}
              patchSelectedStandaloneStyle={patchSelectedStandaloneStyle}
              patchSelectedStateStyle={patchSelectedStateStyle}
              selectedInteractionState={selectedInteractionState}
              selectedStandaloneFullStyle={selectedStandaloneFullStyle}
              selectedStandaloneStyleNode={selectedStandaloneStyleNode}
              selectedStandaloneViewportStyle={selectedStandaloneViewportStyle}
              selectedViewport={selectedViewport}
              setNodeColorField={setNodeColorField}
              setNodeFontPickerOpen={setNodeFontPickerOpen}
              setOrToggleStandaloneStyle={setOrToggleStandaloneStyle}
              setSelectedInteractionState={setSelectedInteractionState}
              spacingHasResponsiveOverride={spacingHasResponsiveOverride}
              typographyHasResponsiveOverride={typographyHasResponsiveOverride}
            />
            {/* ── end D4 group stack ── */}

            {/* Fit + focal point need a REPLACED element (img/video) to act
                on, so they stay media-gated. The ratio controls used to live
                in here too — they now apply to every kind and sit below. */}
            {selectedStandaloneStyleNode.kind === "image" ||
            selectedStandaloneStyleNode.kind === "video" ? (
              <>
                <SegmentedField
                  dataControl="objectFit"
                  label="Image fit"
                  value={selectedStandaloneViewportStyle?.objectFit ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("objectFit", next)}
                  options={BUILDER_NODE_FIT_OPTIONS}
                />
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="objectPosition">
                  <span className={FIELD_LABEL}>Focal point</span>
                  <input
                    type="text"
                    className="px-2"
                    style={{
                      height: 30,
                      fontSize: 12,
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    placeholder="center · top · 50% 20%"
                    value={selectedStandaloneViewportStyle?.objectPosition ?? ""}
                    onChange={(e) =>
                      patchSelectedStandaloneStyle({
                        objectPosition: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </div>
                {/* W5-T5 — Crop entry point from the style panel. */}
                {selectedStandaloneStyleNode.kind === "image" &&
                selectedStandaloneStyleNode.props.src ? (
                  <div
                    className="flex flex-col gap-1.5 border-t pt-3"
                    data-builder-node-style-control="crop"
                    style={{ borderColor: CHROME.line }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setImageCropError(null);
                        setImageCropOpen(true);
                      }}
                      className="cursor-pointer text-left"
                      style={{
                        height: 32,
                        background: CHROME.surface2,
                        border: `1px solid ${CHROME.controlBorder}`,
                        borderRadius: 7,
                        color: CHROME.ink,
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "0 10px",
                      }}
                    >
                      Crop image…
                    </button>
                    {imageCropError ? (
                      <span style={{ fontSize: 11, color: CHROME.rose }}>
                        {imageCropError}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Ratio applies to EVERY kind. It was media-gated here while
                the renderer's tablet/mobile lanes already honored it on any
                node — so a container could be shaped on mobile but not on
                desktop. The renderer now emits it at base for all kinds and
                the control follows. A ratio is how a card keeps its shape
                when its children are absolutely positioned. */}
            <SegmentedField
              dataControl="aspectRatio"
              label="Ratio"
              value={selectedStandaloneViewportStyle?.aspectRatio ?? ""}
              onChange={(next) => setOrToggleStandaloneStyle("aspectRatio", next)}
              options={BUILDER_NODE_RATIO_OPTIONS}
            />
            <div className="flex flex-col gap-1.5" data-builder-node-style-control="aspectRatioFree">
              <span className={FIELD_LABEL}>Custom ratio</span>
              <input
                type="text"
                className="px-2"
                style={{
                  height: 30,
                  fontSize: 12,
                  background: CHROME.surface2,
                  border: `1px solid ${CHROME.controlBorder}`,
                  borderRadius: 7,
                  color: CHROME.ink,
                  outline: "none",
                }}
                placeholder="1.85 · 16 / 9 · 2 / 3"
                value={selectedStandaloneViewportStyle?.aspectRatioFree ?? ""}
                onChange={(e) =>
                  patchSelectedStandaloneStyle({
                    aspectRatioFree: e.target.value.trim() || undefined,
                  })
                }
              />
            </div>

            {selectedStandaloneStyleNode.kind === "button" ? (
              <div className="flex flex-col gap-2" data-builder-node-style-control="buttonStates">
                <span className={FIELD_LABEL}>Button states</span>
                <div data-builder-node-style-control="button-tone">
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneStyleNode.props.tone ?? ""}
                    onChange={(next) => setButtonTone("tone", next)}
                    options={BUILDER_BUTTON_TONE_OPTIONS}
                  />
                </div>
                {(["hover", "focus", "active", "disabled"] as const).map((state) => (
                  <div
                    key={state}
                    className="flex flex-col gap-1.5"
                    data-builder-node-style-control={`button-${state}`}
                  >
                    <span className={INHERIT_HINT}>{state}</span>
                    <Segmented
                      fullWidth
                      compact
                      value={buttonStateTone(selectedStandaloneStyleNode, state)}
                      onChange={(next) => setButtonTone(state, next)}
                      options={BUILDER_BUTTON_TONE_OPTIONS}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {/* D4 — the loose "Visibility" block and the loose "Custom CSS"
                <details> that used to sit here, BELOW every accordion and
                therefore outside every group, moved into the one Advanced
                group (style-panel/groups/AdvancedGroup.tsx). Being loose was
                not only a hierarchy problem: nothing loose registers with the
                D5 "Find a setting" filter, so searching "hide" or "css" could
                never reach them. */}

            {/* Mockup annotation F — ONE footer row for the panel's
                whole-object actions. Replaces the "Reuse style" card (Copy /
                Paste / Clear as uppercase micro-buttons) plus the unrelated
                grey "Reset … style" text link that sat beneath it: the same
                category of action wearing two control languages.

                Reset is armed by the SAME `confirmThenRunReset` the role
                branch uses, so the destructive confirm has one implementation
                rather than two — and this reset, which previously fired on the
                first click with no confirm at all, now cannot. */}
            <StyleFooterRow
              onCopy={copySelectedStandaloneStyle}
              onPaste={pasteStandaloneStyle}
              onReset={() =>
                confirmThenRunReset("node", resetSelectedStandaloneStyle)
              }
              canPaste={Boolean(standaloneStyleClipboard)}
              canReset={canResetSelectedStandaloneViewport}
              resetArmed={resetConfirmTarget === "node"}
              clipboardLabel={
                standaloneStyleClipboard
                  ? `${standaloneStyleClipboard.label} / ${standaloneStyleClipboard.viewport}`
                  : null
              }
              scopeLabel={selectedViewport}
            />
          </div>
        </section>
      ) : null}
      {!selectedNodeRole && !selectedStandaloneStyleNode ? (
        <SectionStyleMockupPanel
          sectionTypeKey={sectionTypeKey}
          draftProps={draftProps}
          presentation={presentation}
          onPatch={onPatch}
          onPresentationPatch={(patch) => onPatch({ __presentation: patch })}
          onNodePresentationPatch={patchNodeRoleByKey}
          backgroundValue={backgroundValue}
          backgroundColorCustom={backgroundColorCustom}
          moodValue={moodValue}
          onSetBackground={(value) => setOrToggleP("background", value)}
          onSetBackgroundCustom={(value) =>
            onPatch({ __presentation: { backgroundColorCustom: value } })
          }
          onSetMood={(value) => setOrToggleRoot("mood", value)}
        />
      ) : null}
      {/*
        ── D1: ONE SCOPE PER PANEL (Inspector Reset P2) ─────────────────────
        Everything below this line reads and writes `draftProps.presentation`
        — the parent SECTION, not the selected node. It therefore renders ONLY
        when the section itself is the selection. Before this gate, "Surface",
        "Custom color", "Advanced → Custom CSS", "Top divider" and "Video
        background" all rendered with a node selected too: changing "Surface"
        with a Container selected repainted the whole section while nothing on
        screen distinguished the two write scopes. The Surface/Custom-color
        block that used to render in NODE contexts is deleted outright — with
        the section selected, SectionStyleMockupPanel already owns surface.
      */}
      {/*
        ── Advanced (Phase A 2026-04-26) ────────────────────────────────────
        Custom CSS is now folded into a collapsible "Advanced" disclosure at
        the bottom of the Style panel. Reasoning: 90% of operators don't write
        custom CSS, and an always-visible textarea ahead of the more-common
        controls (background mode, divider, video, etc.) made the panel feel
        like an admin form, not a Style panel.

        It is NOT hidden in the way a power-user feature would be hidden —
        it has its own labelled disclosure with a clear "Custom CSS" title
        and the existing scoped-to-this-section warning. An operator who has
        custom CSS set sees the row marker (•) so they know the field is in
        use even before opening the disclosure. Opening it preserves the
        original Clear button + textarea + hint — no behavior changes.
        Convergence-plan §1 / DEMOTE bucket.
      */}
      {isSectionScope ? (
      <>
      <details
        open={Boolean(customCss)}
        className="flex flex-col gap-2"
      >
        <summary
          className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: CHROME.muted }}
        >
          Advanced
          {customCss ? (
            <span
              aria-hidden
              style={{
                marginLeft: 8,
                width: 6,
                height: 6,
                background: CHROME.blue,
                borderRadius: 999,
                display: "inline-block",
                verticalAlign: "middle",
              }}
            />
          ) : null}
        </summary>
        <section className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className={`${SECTION_TITLE} inline-flex items-center gap-1.5`}>
              Custom CSS
              <InspectorInfoTip
                title="Custom CSS"
                content={
                  <>
                    Per-section escape hatch. Wrapped in{" "}
                    <code>[data-section-id]</code> so it can&apos;t leak across
                    sections. Use <code>&amp;</code> to nest. Use sparingly, most
                    visual changes belong in Layout, Style, or the Theme drawer.
                  </>
                }
              />
            </div>
            {customCss ? (
              <button
                type="button"
                onClick={() =>
                  onPatch({ __presentation: { customCss: undefined } })
                }
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
            ) : null}
          </div>
          <CssEditorWithHints
            value={customCss}
            onValueChange={(next) =>
              onPatch({
                __presentation: { customCss: next || undefined },
              })
            }
            placeholder={
              "/* Scoped to this section. Modern CSS supported. */\n.site-section-headline {\n  letter-spacing: -0.02em;\n}"
            }
            rows={6}
            ariaLabel="Custom CSS for this section"
          />
        </section>
      </details>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      {/* QA 2026-05-13 — Style tab grouping. Top Divider, Video
          Background are rarely touched; collapse them by default so
          the high-traffic surfaces (Surface, Hero Treatment with the
          Mood/Overlay/Layout chips) sit higher in the visible scroll.
          Auto-expand when the field is actually set (`dividerValue`
          / `videoBackground`) so the operator can find their config
          again on revisit. */}
      <details
        open={Boolean(dividerValue)}
        className="flex flex-col gap-3"
      >
        <summary
          className="flex cursor-pointer items-center justify-between"
          style={{ listStyle: "none" }}
        >
          <div className={SECTION_TITLE}>Top divider</div>
          {!dividerValue ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </summary>
        <section className="flex flex-col gap-3">
        {/* Thumbnail gallery: each tile previews the divider treatment so
            the operator picks by sight. Includes "None" as a dashed
            placeholder so the empty state is itself a visible choice. */}
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
        >
          {PRESENTATION_OPTIONS.dividerTop.map((opt) => {
            const active = dividerValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOrToggleP("dividerTop", opt.value)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-md py-2 transition-all"
                style={{
                  // Sprint 3.2.1 — active divider option uses the same
                  // soft white-pill+hairline+shadow pattern as the rest
                  // of the inspector's selected-chip family. Was using
                  // CHROME.ink for the active border, which created yet
                  // another "ring of black" inside the same drawer.
                  background: active ? CHROME.surface : CHROME.paper,
                  border: active
                    ? `1px solid ${CHROME.lineStrong}`
                    : `1px solid ${CHROME.line}`,
                  boxShadow: active
                    ? "0 1px 3px rgba(0,0,0,0.08)"
                    : "none",
                  cursor: "pointer",
                }}
              >
                <DividerPreview kind={opt.value} />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: active ? CHROME.ink : CHROME.muted }}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
        </section>
      </details>

      {/* ── Video background (Phase 5 — motion + backgrounds) ────────── */}
      <details
        open={Boolean(videoBackground)}
        className="flex flex-col gap-2"
      >
        <summary
          className="flex cursor-pointer items-center justify-between"
          style={{ listStyle: "none" }}
        >
          <div className={SECTION_TITLE}>Video background</div>
          {videoBackground ? null : (
            <span className={INHERIT_HINT}>None</span>
          )}
        </summary>
        <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE} style={{ display: "none" }}>Video background</div>
          {videoBackground ? (
            <button
              type="button"
              onClick={() =>
                onPatch({
                  __presentation: {
                    videoBackground: undefined,
                    videoPoster: undefined,
                    videoOverlay: undefined,
                  },
                })
              }
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
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Video URL</span>
          <input
            type="url"
            value={videoBackground}
            onChange={(e) =>
              onPatch({
                __presentation: { videoBackground: e.target.value || undefined },
              })
            }
            placeholder="https://… (mp4 / webm)"
            className="w-full px-2"
            style={{
              height: 30,
              fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              background: CHROME.surface2,
              border: `1px solid ${CHROME.controlBorder}`,
              borderRadius: 7,
              color: CHROME.ink,
              outline: "none",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Poster image (fallback)</span>
          <input
            type="url"
            value={videoPoster}
            onChange={(e) =>
              onPatch({
                __presentation: { videoPoster: e.target.value || undefined },
              })
            }
            placeholder="https://…"
            className="w-full px-2"
            style={{
              height: 30,
              fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              background: CHROME.surface2,
              border: `1px solid ${CHROME.controlBorder}`,
              borderRadius: 7,
              color: CHROME.ink,
              outline: "none",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Dark overlay ({Math.round(videoOverlay * 100)}%)</span>
          <DebouncedRangeInput
            min={0}
            max={100}
            step={5}
            value={Math.round(videoOverlay * 100)}
            onCommit={(next) => {
              const v = next / 100;
              onPatch({
                __presentation: { videoOverlay: v > 0 ? v : undefined },
              });
            }}
            className="w-full cursor-pointer"
          />
          <span className="text-[10.5px] text-stone-500">
            For text legibility over busy footage.
          </span>
        </div>
        </section>
      </details>
      </>
      ) : null}

      {/* W5-T5 — Image crop modal triggered from the image-node inspector */}
      {imageCropOpen &&
      selectedStandaloneStyleNode?.kind === "image" &&
      selectedStandaloneStyleNode.props.src ? (
        <ImageCropModal
          src={selectedStandaloneStyleNode.props.src}
          name="image"
          saving={imageCropSaving}
          error={imageCropError}
          onSave={async (file: File) => {
            setImageCropSaving(true);
            setImageCropError(null);
            try {
              const result = await uploadCmsMedia({ file, tenantId, kind: "image" });
              if (!result.ok || !result.item?.publicUrl) {
                setImageCropError("Couldn't save the cropped image. Try again.");
                setImageCropSaving(false);
                return;
              }
              await patchBuilderNodeProps(selectedStandaloneStyleNode.id, {
                src: result.item.publicUrl,
                mediaId: result.item.id ?? undefined,
              });
              setImageCropOpen(false);
              setImageCropError(null);
            } catch {
              setImageCropError("Couldn't save the cropped image. Try again.");
            } finally {
              setImageCropSaving(false);
            }
          }}
          onClose={() => {
            if (imageCropSaving) return;
            setImageCropOpen(false);
            setImageCropError(null);
          }}
        />
      ) : null}

      {/* ── Hero treatment (only when section is a hero) ─────────────── */}
      {sectionTypeKey === "hero" && !selectedNodeRole && !selectedStandaloneStyleNode ? (
        <section className="flex flex-col gap-3">
          <div className={SECTION_TITLE}>Hero treatment</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className={FIELD_LABEL}>Overlay</span>
              {!overlayValue ? (
                <span className={INHERIT_HINT}>Theme default</span>
              ) : null}
            </div>
            <Segmented
              fullWidth
              compact
              value={overlayValue}
              onChange={(next) => setOrToggleRoot("overlay", next)}
              options={HERO_OVERLAY_OPTIONS}
            />
          </div>
        </section>
      ) : null}
    </InspectorBody>
  );
}
