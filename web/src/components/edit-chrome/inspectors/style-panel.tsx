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

import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
} from "@/lib/site-admin/sections/shared/presentation";
import {
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeRole,
  type BuilderNodeStyle,
  type BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";
import type {
  NodePresentation,
  NodePresentationValue,
} from "@/lib/site-admin/sections/shared/node-presentation";
import { resolveStandaloneBuilderNodeForContent } from "./builder-node-content-utils";

import { useEffect, useMemo, useRef, useState } from "react";

import { ColorPickerPopover } from "../kit/color-picker";
import { useEditContext } from "../edit-context";
import { Segmented, type SegmentedOption } from "../kit/segmented";
import { Swatch } from "../kit/swatch";
import { CHROME } from "../kit/tokens";

const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
const FIELD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.10em] text-zinc-500";
const HINT = "text-[10.5px] leading-tight text-zinc-500";
const INHERIT_HINT = "text-[10.5px] text-zinc-400";

// Approximate hex for each background palette token. Real tenant rendering
// uses CSS variables from token-presets.css — these swatches are inspector
// affordances only, picked to read at a glance.
const BACKGROUND_SWATCHES: Record<
  string,
  { color: string; ringTone?: "light" | "dark" }
> = {
  canvas: { color:
    "linear-gradient(135deg, #ffffff 0%, #f4efe6 50%, #ffffff 100%)" },
  ivory: { color: "#fbf7ee" },
  champagne: { color: "#ecdcb8" },
  espresso: { color: "#2a201a", ringTone: "dark" },
  blush: { color: "#f3d7d2" },
  sage: { color: "#c5d2bd" },
  "muted-surface": { color: "#ebe6dc" },
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

// Divider thumbnail — a small SVG that previews the visual treatment so
// the operator picks by appearance, not enum name.
function DividerPreview({ kind }: { kind: string }) {
  const stroke = CHROME.muted2;
  const accent = CHROME.ink;
  switch (kind) {
    case "thin-line":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line x1="2" y1="7" x2="42" y2="7" stroke={accent} strokeWidth="1" />
        </svg>
      );
    case "gradient-fade":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <defs>
            <linearGradient id="grad-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent} stopOpacity="0" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.8" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y="6" width="44" height="2" fill="url(#grad-fade)" />
        </svg>
      );
    case "decorative":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line x1="2" y1="7" x2="18" y2="7" stroke={stroke} strokeWidth="1" />
          <circle cx="22" cy="7" r="2.5" fill="none" stroke={accent} strokeWidth="1" />
          <line x1="26" y1="7" x2="42" y2="7" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case "none":
    default:
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line
            x1="2"
            y1="7"
            x2="42"
            y2="7"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        </svg>
      );
  }
}

interface StylePanelProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown>;
  selectedBuilderNodeId: string | null;
  onPatch: (patch: Record<string, unknown>) => void;
}

type EditableNodeRole = BuilderNodeRole;
type NodeViewport = "desktop" | "tablet" | "mobile";
type HorizontalSpacingMode = "linked" | "custom";

const ALIGN_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const SIZE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const BUILDER_NODE_STYLE_SIZE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "muted", label: "Muted" },
  { value: "strong", label: "Strong" },
];

const BUILDER_NODE_TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "muted", label: "Muted" },
  { value: "strong", label: "Strong" },
];

const BUILDER_NODE_WIDTH_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Auto" },
  { value: "narrow", label: "Narrow" },
  { value: "reading", label: "Read" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

const BUILDER_NODE_SPACING_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "0" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];

const BUILDER_NODE_BACKGROUND_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "surface", label: "Surface" },
  { value: "contrast", label: "Dark" },
];

const BUILDER_NODE_RADIUS_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "none", label: "Sharp" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "pill", label: "Pill" },
];

const BUILDER_NODE_FIT_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
];

const BUILDER_NODE_RATIO_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "21:9", label: "21:9" },
];

const BUILDER_BUTTON_TONE_OPTIONS: ReadonlyArray<SegmentedOption<string>> = [
  { value: "", label: "Default" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
];

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
];
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
  featured_talent: ["subheadline", "headline", "copy", "footerCta"],
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
  if (value.aspectRatio) out.aspectRatio = value.aspectRatio;
  const tablet = cleanBuilderNodeStyleValue(value.responsive?.tablet);
  const mobile = cleanBuilderNodeStyleValue(value.responsive?.mobile);
  if (tablet || mobile) {
    out.responsive = {};
    if (tablet) out.responsive.tablet = tablet;
    if (mobile) out.responsive.mobile = mobile;
  }
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
  if (value.aspectRatio) out.aspectRatio = value.aspectRatio;
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveBuilderNodeViewportStyle(
  style: BuilderNodeStyle | undefined,
  viewport: NodeViewport,
): BuilderNodeStyleValue | undefined {
  if (viewport === "desktop") return style;
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

export function StylePanel({
  sectionTypeKey,
  draftProps,
  selectedBuilderNodeId,
  onPatch,
}: StylePanelProps) {
  const {
    builderTree,
    canUndo,
    canRedo,
    patchBuilderNodeProps,
    undo,
    redo,
  } = useEditContext();
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
  const selectedStandaloneStyleNode = useMemo(
    () => resolveStandaloneBuilderNodeForContent(builderTree, selectedBuilderNodeId),
    [builderTree, selectedBuilderNodeId],
  );
  const [selectedViewport, setSelectedViewport] = useState<NodeViewport>("desktop");
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
  const selectedStandaloneViewportStyle = resolveBuilderNodeViewportStyle(
    selectedStandaloneFullStyle,
    selectedViewport,
  );
  const selectedStandaloneViewportOverrideCount = Object.keys(
    selectedStandaloneViewportStyle ?? {},
  ).length;
  const canResetSelectedStandaloneViewport =
    selectedViewport === "desktop"
      ? Boolean(selectedStandaloneFullStyle)
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
    recordNodeAction("Reset node style");
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
    recordNodeAction("Copied node style");
  }

  function pasteClipboardNodeStyle() {
    if (!selectedNodeRole || !nodeStyleClipboard?.full) return;
    const cloned = cloneNodePresentation(nodeStyleClipboard.full);
    setNodeRolePresentation(selectedNodeRole, cloned);
    recordNodeAction("Pasted full node style");
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
      recordNodeAction("Pasted viewport style (desktop)");
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
    recordNodeAction(`Pasted viewport style (${selectedViewport})`);
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
    if (typeof window === "undefined") return;
    const raw = window.prompt("Rename preset", preset.name);
    if (raw === null) return;
    const nextName = raw.trim();
    if (!nextName || nextName === preset.name) return;
    setStoredNodeStylePresets((prev) => {
      const next = [...prev];
      const index = next.findIndex((entry) => entry.id === preset.id);
      if (index < 0) return prev;
      next[index] = {
        ...next[index],
        name: nextName,
      };
      return next;
    });
    recordNodeAction(`Renamed preset to "${nextName}"`);
  }

  async function exportNodeStylePresetsJson() {
    if (storedNodeStylePresets.length === 0) return;
    const payload = JSON.stringify(storedNodeStylePresets, null, 2);
    if (typeof window === "undefined") return;
    try {
      if ("clipboard" in navigator && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        recordNodeAction("Copied presets JSON");
        return;
      }
    } catch {
      // Fall back to prompt copy flow.
    }
    window.prompt("Copy style presets JSON", payload);
    recordNodeAction("Opened presets JSON");
  }

  async function importNodeStylePresetsJson() {
    if (typeof window === "undefined") return;
    let seed = "";
    try {
      if ("clipboard" in navigator && navigator.clipboard?.readText) {
        seed = await navigator.clipboard.readText();
      }
    } catch {
      seed = "";
    }
    const raw = window.prompt("Paste style presets JSON", seed);
    if (raw === null) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      window.alert(
        "That isn't valid JSON — paste the presets array you exported from this panel.",
      );
      return;
    }
    if (!Array.isArray(parsed)) {
      window.alert("Paste a JSON array of presets — use Export from this panel first.");
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
    window.alert("No valid presets found in payload.");
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

  const [colorAnchor, setColorAnchor] = useState<HTMLButtonElement | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
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
    standalonePatchChainRef.current = standalonePatchChainRef.current
      .catch(() => {
        // Keep the queue alive after a failed save attempt.
      })
      .then(async () => {
        const result = await patchBuilderNodeProps(nodeId, patch);
        if (!result.ok) return;
        recordNodeAction(`Updated ${label}`);
      });
  }

  function patchSelectedStandaloneStyle(patch: Partial<BuilderNodeStyleValue>) {
    if (!selectedStandaloneStyleNode) return;
    const currentStyle =
      standaloneStyleDraftRef.current.nodeId === selectedStandaloneStyleNode.id
        ? standaloneStyleDraftRef.current.style
        : selectedStandaloneStyleNode.props.style;
    const nextStyle =
      selectedViewport === "desktop"
        ? cleanBuilderNodeStyle({
            ...currentStyle,
            ...patch,
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
      resolveBuilderNodeViewportStyle(currentStyle, selectedViewport),
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
      responsive: {
        ...(currentStyle?.responsive ?? {}),
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

  return (
    <div className="flex flex-col gap-6">
      {selectedNodeRole && selectedNodeLabel ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className={SECTION_TITLE}>Selected node</div>
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
                  <span className={FIELD_LABEL}>Viewport</span>
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
                      onClick={() => {
                        void undo();
                        recordNodeAction("Undo");
                      }}
                      disabled={!canUndo}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em] disabled:cursor-not-allowed disabled:opacity-40"
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
                      onClick={() => {
                        void redo();
                        recordNodeAction("Redo");
                      }}
                      disabled={!canRedo}
                      className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em] disabled:cursor-not-allowed disabled:opacity-40"
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
                        Copy node
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
                            ? `Paste from ${nodeRoleLabel(nodeStyleClipboard.role) ?? "node"}`
                            : undefined
                        }
                      >
                        Paste node
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
                            ? `Paste ${nodeStyleClipboard.viewportSource} viewport only`
                            : undefined
                        }
                      >
                        Paste viewport
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
                        title="Paste viewport typography only"
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
                        title="Paste viewport spacing only"
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
                            ? "Apply style to all text nodes in this section"
                            : "Apply style to all CTA nodes in this section"
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
                            ? `Apply ${selectedViewport} typography to all text nodes`
                            : `Apply ${selectedViewport} typography to all CTA nodes`
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
                            ? `Apply ${selectedViewport} spacing to all text nodes`
                            : `Apply ${selectedViewport} spacing to all CTA nodes`
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
                            ? `Apply ${selectedViewport} style to all text nodes`
                            : `Apply ${selectedViewport} style to all CTA nodes`
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
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                        title={
                          selectedRoleGroup === "text"
                            ? "Reset all text-node styles in this section"
                            : "Reset all CTA-node styles in this section"
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
                        style={{
                          background: "transparent",
                          border: "none",
                          color: CHROME.muted,
                          padding: 0,
                        }}
                      >
                        {resetConfirmTarget === "node" ? "Confirm reset" : "Reset node"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <Segmented
                  fullWidth
                  compact
                  value={selectedViewport}
                  onChange={(next) => setSelectedViewport(next as NodeViewport)}
                  options={VIEWPORT_OPTIONS}
                />
                {selectedViewport !== "desktop" ? (
                  <span className={INHERIT_HINT}>
                    {selectedViewportOverrideCount > 0
                      ? `${selectedViewportOverrideCount} field${
                          selectedViewportOverrideCount === 1 ? "" : "s"
                        } overridden on ${selectedViewport}; ${inheritedDesktopCount} inheriting desktop.`
                      : `No ${selectedViewport} overrides yet — all fields inherit desktop.`}
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
                              style={{
                                background: "transparent",
                                border: "none",
                                color: CHROME.muted,
                                padding: 0,
                              }}
                            >
                              {presetDeleteConfirmTarget === preset.id
                                ? "Confirm"
                                : "Delete"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className={INHERIT_HINT}>
                      Save frequently used styles for reuse.
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Visibility</span>
                <Segmented
                  fullWidth
                  compact
                  value={(selectedNodeViewportPresentation?.visibility as string | undefined) ?? ""}
                  onChange={(next) => setOrToggleNode("visibility", next)}
                  options={VISIBILITY_OPTIONS}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Align</span>
                <Segmented
                  fullWidth
                  compact
                  value={(selectedNodeViewportPresentation?.align as string | undefined) ?? ""}
                  onChange={(next) => setOrToggleNode("align", next)}
                  options={ALIGN_OPTIONS}
                />
              </div>
              {!selectedNodeIsButton ? (
                <div className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Max width (px)</span>
                  <input
                    type="number"
                    min={120}
                    max={1200}
                    value={selectedNodeViewportPresentation?.maxWidthPx ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        patchSelectedNodePresentation({ maxWidthPx: undefined });
                        return;
                      }
                      const n = Number(raw);
                      if (Number.isFinite(n) && n >= 120 && n <= 1200) {
                        patchSelectedNodePresentation({ maxWidthPx: Math.round(n) });
                      }
                    }}
                    placeholder="Default"
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
                <div className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Margin top (px)</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={selectedNodeViewportPresentation?.marginTopPx ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        patchSelectedNodePresentation({ marginTopPx: undefined });
                        return;
                      }
                      const n = Number(raw);
                      if (Number.isFinite(n) && n >= 0 && n <= 240) {
                        patchSelectedNodePresentation({ marginTopPx: Math.round(n) });
                      }
                    }}
                    placeholder="Default"
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
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Margin bottom (px)</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={selectedNodeViewportPresentation?.marginBottomPx ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        patchSelectedNodePresentation({ marginBottomPx: undefined });
                        return;
                      }
                      const n = Number(raw);
                      if (Number.isFinite(n) && n >= 0 && n <= 240) {
                        patchSelectedNodePresentation({ marginBottomPx: Math.round(n) });
                      }
                    }}
                    placeholder="Default"
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
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Quick spacing</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedSpacingPreset ?? ""}
                  onChange={(next) => applySpacingPreset(next as SpacingPreset)}
                  options={SPACING_PRESET_OPTIONS}
                />
                <span className={INHERIT_HINT}>
                  Fast-start spacing preset for this viewport.
                </span>
              </div>
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
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={selectedNodeViewportPresentation?.marginInlinePx ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        patchSelectedNodePresentation({
                          marginInlinePx: undefined,
                        });
                        return;
                      }
                      const n = Number(raw);
                      if (Number.isFinite(n) && n >= 0 && n <= 200) {
                        patchSelectedNodePresentation({
                          marginInlinePx: Math.round(n),
                          marginLeftPx: undefined,
                          marginRightPx: undefined,
                        });
                      }
                    }}
                    placeholder="Default"
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
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={selectedNodeViewportPresentation?.marginLeftPx ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          patchSelectedNodePresentation({
                            marginLeftPx: undefined,
                            marginInlinePx: undefined,
                          });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n) && n >= 0 && n <= 200) {
                          patchSelectedNodePresentation({
                            marginLeftPx: Math.round(n),
                            marginInlinePx: undefined,
                          });
                        }
                      }}
                      placeholder="Left"
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
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={selectedNodeViewportPresentation?.marginRightPx ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          patchSelectedNodePresentation({
                            marginRightPx: undefined,
                            marginInlinePx: undefined,
                          });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n) && n >= 0 && n <= 200) {
                          patchSelectedNodePresentation({
                            marginRightPx: Math.round(n),
                            marginInlinePx: undefined,
                          });
                        }
                      }}
                      placeholder="Right"
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
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <span className={FIELD_LABEL}>Pad top (px)</span>
                    <input
                      type="number"
                      min={0}
                      max={160}
                      value={selectedNodeViewportPresentation?.paddingTopPx ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          patchSelectedNodePresentation({ paddingTopPx: undefined });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n) && n >= 0 && n <= 160) {
                          patchSelectedNodePresentation({
                            paddingTopPx: Math.round(n),
                          });
                        }
                      }}
                      placeholder="Default"
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
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={FIELD_LABEL}>Pad bottom (px)</span>
                    <input
                      type="number"
                      min={0}
                      max={160}
                      value={selectedNodeViewportPresentation?.paddingBottomPx ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          patchSelectedNodePresentation({
                            paddingBottomPx: undefined,
                          });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n) && n >= 0 && n <= 160) {
                          patchSelectedNodePresentation({
                            paddingBottomPx: Math.round(n),
                          });
                        }
                      }}
                      placeholder="Default"
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
                  </div>
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
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={selectedNodeViewportPresentation?.paddingInlinePx ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          patchSelectedNodePresentation({
                            paddingInlinePx: undefined,
                          });
                          return;
                        }
                        const n = Number(raw);
                        if (Number.isFinite(n) && n >= 0 && n <= 120) {
                          patchSelectedNodePresentation({
                            paddingInlinePx: Math.round(n),
                            paddingLeftPx: undefined,
                            paddingRightPx: undefined,
                          });
                        }
                      }}
                      placeholder="Default"
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
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={selectedNodeViewportPresentation?.paddingLeftPx ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw) {
                            patchSelectedNodePresentation({
                              paddingLeftPx: undefined,
                              paddingInlinePx: undefined,
                            });
                            return;
                          }
                          const n = Number(raw);
                          if (Number.isFinite(n) && n >= 0 && n <= 120) {
                            patchSelectedNodePresentation({
                              paddingLeftPx: Math.round(n),
                              paddingInlinePx: undefined,
                            });
                          }
                        }}
                        placeholder="Left"
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
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={selectedNodeViewportPresentation?.paddingRightPx ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw) {
                            patchSelectedNodePresentation({
                              paddingRightPx: undefined,
                              paddingInlinePx: undefined,
                            });
                            return;
                          }
                          const n = Number(raw);
                          if (Number.isFinite(n) && n >= 0 && n <= 120) {
                            patchSelectedNodePresentation({
                              paddingRightPx: Math.round(n),
                              paddingInlinePx: undefined,
                            });
                          }
                        }}
                        placeholder="Right"
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
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Size</span>
                <Segmented
                  fullWidth
                  compact
                  value={(selectedNodeViewportPresentation?.size as string | undefined) ?? ""}
                  onChange={(next) => setOrToggleNode("size", next)}
                  options={SIZE_OPTIONS}
                />
              </div>
              {!selectedNodeIsButton ? (
                <div className="flex flex-col gap-1.5">
                  <span className={FIELD_LABEL}>Tone</span>
                  <Segmented
                    fullWidth
                    compact
                    value={(selectedNodeViewportPresentation?.tone as string | undefined) ?? ""}
                    onChange={(next) => setOrToggleNode("tone", next)}
                    options={TONE_OPTIONS}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {!selectedNodeRole && selectedStandaloneStyleNode ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className={SECTION_TITLE}>Selected block</div>
            <span className={INHERIT_HINT}>
              {standaloneNodeLabel(selectedStandaloneStyleNode)}
            </span>
          </div>
          <div
            className="flex flex-col gap-3 p-3"
            data-builder-node-style-panel={selectedStandaloneStyleNode.kind}
            style={{
              background: CHROME.paper,
              border: `1px solid ${CHROME.line}`,
            }}
          >
            <div
              className="flex flex-col gap-1.5"
              data-builder-node-style-control="viewport"
            >
              <div className="flex items-end justify-between gap-2">
                <span className={FIELD_LABEL}>Viewport</span>
                <span className={INHERIT_HINT}>
                  {selectedViewport === "desktop"
                    ? `${selectedStandaloneViewportOverrideCount} desktop rule${
                        selectedStandaloneViewportOverrideCount === 1 ? "" : "s"
                      }`
                    : selectedStandaloneViewportOverrideCount > 0
                      ? `${selectedStandaloneViewportOverrideCount} override${
                          selectedStandaloneViewportOverrideCount === 1 ? "" : "s"
                        }`
                      : "Inherits desktop"}
                </span>
              </div>
              <Segmented
                fullWidth
                compact
                value={selectedViewport}
                onChange={(next) => setSelectedViewport(next as NodeViewport)}
                options={VIEWPORT_OPTIONS}
              />
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
                      : CHROME.muted2,
                    cursor: canCopyStandaloneDesktopToViewport
                      ? "pointer"
                      : "not-allowed",
                    padding: 0,
                  }}
                >
                  Copy desktop to {selectedViewport}
                </button>
              ) : null}
            </div>

            {selectedStandaloneStylePresets.length > 0 ? (
              <div
                className="flex flex-col gap-2"
                data-builder-node-style-control="quick-presets"
              >
                <div className="flex items-end justify-between gap-2">
                  <span className={FIELD_LABEL}>Quick styles</span>
                  <span className={INHERIT_HINT}>
                    Applies to {selectedViewport}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {selectedStandaloneStylePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-builder-node-style-preset={preset.id}
                      onClick={() => applyStandaloneStylePreset(preset)}
                      className="cursor-pointer text-left"
                      style={{
                        background: CHROME.surface,
                        border: `1px solid ${CHROME.lineMid}`,
                        color: CHROME.ink,
                        padding: "8px 10px",
                      }}
                    >
                      <span className="block text-[11px] font-semibold">
                        {preset.label}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-tight text-zinc-500">
                        {preset.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5" data-builder-node-style-control="align">
              <span className={FIELD_LABEL}>Align</span>
              <Segmented
                fullWidth
                compact
                value={selectedStandaloneViewportStyle?.align ?? ""}
                onChange={(next) => setOrToggleStandaloneStyle("align", next)}
                options={ALIGN_OPTIONS}
              />
            </div>

            {["heading", "paragraph", "button"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="size">
                <span className={FIELD_LABEL}>Size</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.size ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("size", next)}
                  options={BUILDER_NODE_STYLE_SIZE_OPTIONS}
                />
              </div>
            ) : null}

            {["heading", "paragraph"].includes(selectedStandaloneStyleNode.kind) ? (
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="tone">
                <span className={FIELD_LABEL}>Tone</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.tone ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("tone", next)}
                  options={BUILDER_NODE_TONE_OPTIONS}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5" data-builder-node-style-control="maxWidth">
              <span className={FIELD_LABEL}>Width</span>
              <Segmented
                fullWidth
                compact
                value={selectedStandaloneViewportStyle?.maxWidth ?? ""}
                onChange={(next) => setOrToggleStandaloneStyle("maxWidth", next)}
                options={BUILDER_NODE_WIDTH_OPTIONS}
              />
            </div>

            {["container", "split", "card", "cta_group"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="background">
                <span className={FIELD_LABEL}>Background</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.background ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("background", next)}
                  options={BUILDER_NODE_BACKGROUND_OPTIONS}
                />
              </div>
            ) : null}

            {["container", "split", "card", "cta_group", "button", "image"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="radius">
                <span className={FIELD_LABEL}>Corners</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.radius ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("radius", next)}
                  options={BUILDER_NODE_RADIUS_OPTIONS}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="marginTop">
                <span className={FIELD_LABEL}>Margin top</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.marginTop ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("marginTop", next)}
                  options={BUILDER_NODE_SPACING_OPTIONS}
                />
              </div>
              <div className="flex flex-col gap-1.5" data-builder-node-style-control="marginBottom">
                <span className={FIELD_LABEL}>Bottom</span>
                <Segmented
                  fullWidth
                  compact
                  value={selectedStandaloneViewportStyle?.marginBottom ?? ""}
                  onChange={(next) => setOrToggleStandaloneStyle("marginBottom", next)}
                  options={BUILDER_NODE_SPACING_OPTIONS}
                />
              </div>
            </div>

            {["container", "split", "card", "cta_group", "button"].includes(
              selectedStandaloneStyleNode.kind,
            ) ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="paddingX">
                  <span className={FIELD_LABEL}>Padding X</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.paddingX ?? ""}
                    onChange={(next) => setOrToggleStandaloneStyle("paddingX", next)}
                    options={BUILDER_NODE_SPACING_OPTIONS}
                  />
                </div>
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="paddingY">
                  <span className={FIELD_LABEL}>Padding Y</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.paddingY ?? ""}
                    onChange={(next) => setOrToggleStandaloneStyle("paddingY", next)}
                    options={BUILDER_NODE_SPACING_OPTIONS}
                  />
                </div>
              </div>
            ) : null}

            {selectedStandaloneStyleNode.kind === "image" ? (
              <>
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="objectFit">
                  <span className={FIELD_LABEL}>Image fit</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.objectFit ?? ""}
                    onChange={(next) => setOrToggleStandaloneStyle("objectFit", next)}
                    options={BUILDER_NODE_FIT_OPTIONS}
                  />
                </div>
                <div className="flex flex-col gap-1.5" data-builder-node-style-control="aspectRatio">
                  <span className={FIELD_LABEL}>Ratio</span>
                  <Segmented
                    fullWidth
                    compact
                    value={selectedStandaloneViewportStyle?.aspectRatio ?? ""}
                    onChange={(next) => setOrToggleStandaloneStyle("aspectRatio", next)}
                    options={BUILDER_NODE_RATIO_OPTIONS}
                  />
                </div>
              </>
            ) : null}

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

            <div
              className="flex flex-col gap-2 border-t pt-3"
              data-builder-node-style-control="style-clipboard"
              style={{ borderColor: CHROME.line }}
            >
              <div className="flex items-end justify-between gap-2">
                <span className={FIELD_LABEL}>Reuse style</span>
                {standaloneStyleClipboard ? (
                  <span className={INHERIT_HINT}>
                    From {standaloneStyleClipboard.label} /
                    {" "}
                    {standaloneStyleClipboard.viewport}
                  </span>
                ) : (
                  <span className={INHERIT_HINT}>Copy once, paste anywhere</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  data-builder-node-style-copy=""
                  onClick={copySelectedStandaloneStyle}
                  className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
                  style={{
                    background: CHROME.surface,
                    border: `1px solid ${CHROME.lineMid}`,
                    color: CHROME.ink,
                    padding: "8px 6px",
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  data-builder-node-style-paste=""
                  onClick={pasteStandaloneStyle}
                  disabled={!standaloneStyleClipboard}
                  className="text-[10px] font-semibold uppercase tracking-[0.10em]"
                  style={{
                    background: standaloneStyleClipboard
                      ? CHROME.ink
                      : CHROME.surface2,
                    border: `1px solid ${
                      standaloneStyleClipboard ? CHROME.ink : CHROME.lineMid
                    }`,
                    color: standaloneStyleClipboard ? "#fff" : CHROME.muted2,
                    cursor: standaloneStyleClipboard ? "pointer" : "not-allowed",
                    padding: "8px 6px",
                  }}
                >
                  Paste
                </button>
                <button
                  type="button"
                  data-builder-node-style-clear-clipboard=""
                  onClick={clearStandaloneStyleClipboard}
                  disabled={!standaloneStyleClipboard}
                  className="text-[10px] font-semibold uppercase tracking-[0.10em]"
                  style={{
                    background: "transparent",
                    border: `1px solid ${CHROME.lineMid}`,
                    color: standaloneStyleClipboard ? CHROME.muted : CHROME.muted2,
                    cursor: standaloneStyleClipboard ? "pointer" : "not-allowed",
                    padding: "8px 6px",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            <button
              type="button"
              data-builder-node-style-reset=""
              onClick={resetSelectedStandaloneStyle}
              disabled={!canResetSelectedStandaloneViewport}
              className="text-[10px] font-semibold uppercase tracking-[0.10em]"
              style={{
                alignSelf: "flex-start",
                background: "transparent",
                border: "none",
                color: canResetSelectedStandaloneViewport
                  ? CHROME.muted
                  : CHROME.muted2,
                cursor: canResetSelectedStandaloneViewport
                  ? "pointer"
                  : "not-allowed",
                padding: 0,
              }}
            >
              Reset {selectedViewport} style
            </button>
          </div>
        </section>
      ) : null}
      {/* ── Surface ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Surface</div>
          {!backgroundValue ? (
            <span className={INHERIT_HINT}>Theme default</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className={FIELD_LABEL}>
            {PRESENTATION_FIELD_LABELS.background}
          </span>
          {/* Swatch grid: each token is a circle, active gets a ring +
              subtle scale via Swatch's built-in `active` styling. */}
          <div
            className="grid items-center gap-2.5"
            style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
          >
            {PRESENTATION_OPTIONS.background.map((opt) => {
              const swatch = BACKGROUND_SWATCHES[opt.value];
              return (
                <Swatch
                  key={opt.value}
                  color={swatch?.color ?? "#ffffff"}
                  active={backgroundValue === opt.value}
                  onClick={() => setOrToggleP("background", opt.value)}
                  size={28}
                  title={opt.label}
                />
              );
            })}
          </div>
          <span className={HINT}>
            {backgroundColorCustom
              ? `Custom color overrides the palette token.`
              : backgroundValue
                ? (PRESENTATION_OPTIONS.background.find(
                    (o) => o.value === backgroundValue,
                  )?.label ?? backgroundValue)
                : "Match canvas — follows the tenant theme."}
          </span>
        </div>
        {/* Free-color override — Phase 1 (pixel-first) escape from the
            tenant palette. Sets backgroundColorCustom which the renderer
            applies as inline `background:` and skips the data-attr so
            the swatch token is overridden. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL}>Custom color</span>
            {backgroundColorCustom ? (
              <button
                type="button"
                onClick={() =>
                  onPatch({ __presentation: { backgroundColorCustom: undefined } })
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
          <div className="flex items-center gap-2">
            <button
              ref={setColorAnchor}
              type="button"
              onClick={() => setColorOpen((v) => !v)}
              aria-label="Pick custom background color"
              className="cursor-pointer"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: `1px solid ${CHROME.lineMid}`,
                background: backgroundColorCustom || "transparent",
                backgroundImage: backgroundColorCustom
                  ? undefined
                  : "repeating-conic-gradient(#e5e0d8 0% 25%, #ffffff 0% 50%) 50% / 8px 8px",
              }}
            />
            <input
              type="text"
              value={backgroundColorCustom}
              onChange={(e) =>
                onPatch({
                  __presentation: {
                    backgroundColorCustom: e.target.value || undefined,
                  },
                })
              }
              placeholder="#— or rgba()"
              className="flex-1 px-2"
              style={{
                height: 30,
                fontSize: 12,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                background: "#faf9f6",
                border: "1px solid #e5e0d5",
                borderRadius: 7,
                color: CHROME.ink,
                outline: "none",
                transition: "border-color 150ms, box-shadow 150ms",
              }}
            />
          </div>
          <ColorPickerPopover
            open={colorOpen}
            anchor={colorAnchor}
            value={backgroundColorCustom || "#ffffff"}
            onChange={(next) =>
              onPatch({ __presentation: { backgroundColorCustom: next } })
            }
            onClose={() => setColorOpen(false)}
          />
        </div>
      </section>

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
            <div className={SECTION_TITLE}>Custom CSS</div>
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
          <textarea
            value={customCss}
            onChange={(e) =>
              onPatch({
                __presentation: { customCss: e.target.value || undefined },
              })
            }
            placeholder={
              "/* Scoped to this section. Modern CSS supported. */\n.site-section-headline {\n  letter-spacing: -0.02em;\n}"
            }
            spellCheck={false}
            rows={6}
            className="w-full px-2 py-2"
            style={{
              fontSize: 11.5,
              lineHeight: 1.45,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              background: "#faf9f6",
              border: "1px solid #e5e0d5",
              borderRadius: 7,
              color: CHROME.ink,
              outline: "none",
              resize: "vertical",
              minHeight: 110,
              transition: "border-color 150ms, box-shadow 150ms",
            }}
          />
          <span className={HINT}>
            Per-section escape hatch. Wrapped in{" "}
            <code>[data-section-id]</code> so it can&apos;t leak across
            sections. Use <code>&amp;</code> to nest. Use sparingly — most
            visual changes belong in Layout, Style, or the Theme drawer.
          </span>
        </section>
      </details>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Top divider</div>
          {!dividerValue ? (
            <span className={INHERIT_HINT}>None</span>
          ) : null}
        </div>
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

      {/* ── Video background (Phase 5 — motion + backgrounds) ────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className={SECTION_TITLE}>Video background</div>
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
              background: "#faf9f6",
              border: "1px solid #e5e0d5",
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
              background: "#faf9f6",
              border: "1px solid #e5e0d5",
              borderRadius: 7,
              color: CHROME.ink,
              outline: "none",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Dark overlay ({Math.round(videoOverlay * 100)}%)</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(videoOverlay * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              onPatch({
                __presentation: { videoOverlay: v > 0 ? v : undefined },
              });
            }}
            className="w-full cursor-pointer"
          />
          <span className="text-[10.5px] text-zinc-400">
            For text legibility over busy footage.
          </span>
        </div>
      </section>

      {/* ── Hero treatment (only when section is a hero) ─────────────── */}
      {sectionTypeKey === "hero" ? (
        <section className="flex flex-col gap-3">
          <div className={SECTION_TITLE}>Hero treatment</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className={FIELD_LABEL}>Mood</span>
              {!moodValue ? (
                <span className={INHERIT_HINT}>Theme default</span>
              ) : null}
            </div>
            <Segmented
              fullWidth
              compact
              value={moodValue}
              onChange={(next) => setOrToggleRoot("mood", next)}
              options={HERO_MOOD_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <span className={HINT}>
              {HERO_MOOD_OPTIONS.find((o) => o.value === moodValue)?.hint ??
                ""}
            </span>
          </div>
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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className={FIELD_LABEL}>Layout</span>
              {!layoutValue ? (
                <span className={INHERIT_HINT}>Centered</span>
              ) : null}
            </div>
            <Segmented
              fullWidth
              compact
              value={layoutValue}
              onChange={(next) => setOrToggleRoot("layout", next)}
              options={HERO_LAYOUT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <span
              id="hero-layout-hint"
              className={HINT}
              role="status"
              aria-live="polite"
            >
              {HERO_LAYOUT_OPTIONS.find((o) => o.value === layoutValue)?.hint ??
                ""}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
