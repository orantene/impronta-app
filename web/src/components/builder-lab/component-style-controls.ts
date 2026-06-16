/**
 * Builder Lab → Site Defaults → Component Styles — the CURATED control surface
 * for the per-component default-style cascade (`default_component_styles`).
 *
 * The full builder-node style schema has 100+ props (free-text dimensions, raw
 * CSS escapes, per-breakpoint layers …). Exposing all of them per kind would be
 * an unusable wall. A platform DEFAULT only needs a small, safe base — the kind
 * of thing an operator sets once ("all headings are Ink + center", "all cards
 * have a soft radius") — and every node can still override any single prop in
 * the inspector.
 *
 * So this module defines a CURATED subset: a handful of CLOSED-ENUM style props
 * (no free text → nothing to validate client-side, and every value round-trips
 * cleanly through `builderNodeStyleValueSchema` / `normalizeComponentStyleDefaults`).
 * Each control declares which kinds it applies to, so the editor offers the
 * right fields per kind rather than a raw JSON blob.
 *
 * This is a pure-data + pure-logic module (no React, no heavy registry import)
 * so it stays client-safe and unit-testable. The kind labels mirror
 * BUILDER_NODE_REGISTRY[kind].label but are inlined to avoid pulling the heavy
 * zod registry into the client bundle.
 */

import type { BuilderNodeKind, BuilderNodeStyle } from "@/lib/site-admin/builder-node/types";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

/** "Unset" sentinel for a curated select (renders as "— (theme default)"). */
export const UNSET = "" as const;

/**
 * One curated style control: a closed-enum style prop with a human label, the
 * option set, and the kinds it applies to. `prop` is a key of BuilderNodeStyle
 * whose schema value is one of `options` — so the value is always schema-valid.
 */
export type StyleControl = {
  /** The BuilderNodeStyle key this control writes. */
  prop: keyof BuilderNodeStyle;
  label: string;
  /** Closed option set (schema enum values). */
  options: ReadonlyArray<string>;
  /** Optional friendlier labels per option (keyed by option value). */
  optionLabels?: Readonly<Record<string, string>>;
  /** Which node kinds this control applies to. */
  appliesTo: ReadonlyArray<BuilderNodeKind>;
};

// Kind groups reused across controls. Text-bearing leaf kinds vs box/surface kinds.
const TEXT_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "heading",
  "paragraph",
  "button",
  "rich_text",
];
const BOX_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "section",
  "container",
  "split",
  "card",
  "cta_group",
  "accordion",
  "tabs",
  "carousel",
  "masonry",
  "image",
];
const SPACING_KINDS: ReadonlyArray<BuilderNodeKind> = [
  "section",
  "container",
  "split",
  "card",
  "cta_group",
  "heading",
  "paragraph",
  "button",
  "rich_text",
  "image",
  "divider",
];

/**
 * The curated controls, in display order. All option sets are closed enums from
 * `builderNodeStyleValueSchema`, so any selected value is always schema-valid.
 */
export const STYLE_CONTROLS: ReadonlyArray<StyleControl> = [
  {
    prop: "align",
    label: "Align",
    options: ["left", "center", "right"],
    appliesTo: TEXT_KINDS,
  },
  {
    prop: "tone",
    label: "Tone",
    options: ["default", "muted", "strong"],
    appliesTo: TEXT_KINDS,
  },
  {
    prop: "size",
    label: "Size",
    options: ["sm", "md", "lg", "xl"],
    appliesTo: ["heading", "paragraph", "button", "icon"],
  },
  {
    prop: "textTransform",
    label: "Text case",
    options: ["none", "uppercase", "lowercase", "capitalize"],
    appliesTo: TEXT_KINDS,
  },
  {
    prop: "background",
    label: "Background",
    options: ["none", "surface", "contrast"],
    optionLabels: { none: "none", surface: "surface", contrast: "contrast" },
    appliesTo: BOX_KINDS,
  },
  {
    prop: "radius",
    label: "Corner radius",
    options: ["none", "sm", "md", "lg", "pill"],
    appliesTo: BOX_KINDS,
  },
  {
    prop: "paddingY",
    label: "Padding (Y)",
    options: ["none", "s", "m", "l"],
    appliesTo: BOX_KINDS,
  },
  {
    prop: "paddingX",
    label: "Padding (X)",
    options: ["none", "s", "m", "l"],
    appliesTo: BOX_KINDS,
  },
  {
    prop: "marginTop",
    label: "Margin top",
    options: ["none", "s", "m", "l"],
    appliesTo: SPACING_KINDS,
  },
  {
    prop: "marginBottom",
    label: "Margin bottom",
    options: ["none", "s", "m", "l"],
    appliesTo: SPACING_KINDS,
  },
];

/**
 * Kinds that have at least one curated control, in a sensible authoring order
 * (layout/surface first, then text, then media/leaf). Each carries its display
 * label (mirrors BUILDER_NODE_REGISTRY labels). Kinds with NO curated control
 * (spacer, divider-only-spacing edge cases, embeds, code, nav, form, …) are
 * omitted from the curated editor — their defaults are rarely useful and would
 * need the raw escape hatches this editor intentionally doesn't surface.
 */
export const STYLEABLE_KINDS: ReadonlyArray<{ kind: BuilderNodeKind; label: string }> = [
  { kind: "section", label: "Section" },
  { kind: "container", label: "Container" },
  { kind: "split", label: "Split" },
  { kind: "card", label: "Card" },
  { kind: "cta_group", label: "CTA group" },
  { kind: "accordion", label: "Accordion" },
  { kind: "tabs", label: "Tabs" },
  { kind: "carousel", label: "Carousel" },
  { kind: "masonry", label: "Masonry" },
  { kind: "heading", label: "Heading" },
  { kind: "paragraph", label: "Paragraph" },
  { kind: "rich_text", label: "Rich text" },
  { kind: "button", label: "Button" },
  { kind: "icon", label: "Icon" },
  { kind: "image", label: "Image" },
  { kind: "divider", label: "Divider" },
];

/** The controls that apply to a given kind, in declaration order. */
export function controlsForKind(kind: BuilderNodeKind): ReadonlyArray<StyleControl> {
  return STYLE_CONTROLS.filter((c) => c.appliesTo.includes(kind));
}

/**
 * Count of props set on a kind's default (used for the "N set" badge). Only
 * curated props are counted — a value present but equal to UNSET is not a value.
 */
export function setCountForKind(
  styles: ComponentStyleDefaults,
  kind: BuilderNodeKind,
): number {
  const entry = styles[kind];
  if (!entry) return 0;
  let n = 0;
  for (const c of controlsForKind(kind)) {
    const v = (entry as Record<string, unknown>)[c.prop as string];
    if (typeof v === "string" && v.length > 0) n += 1;
  }
  return n;
}

/**
 * Immutably set (or CLEAR) one curated prop on a kind's default and return the
 * next ComponentStyleDefaults. Clearing the last prop drops the kind entry
 * entirely (keeps the map minimal — matches `normalizeComponentStyleDefaults`,
 * which skips empty entries). Pure: never mutates `styles`.
 */
export function setComponentStyleProp(
  styles: ComponentStyleDefaults,
  kind: BuilderNodeKind,
  prop: keyof BuilderNodeStyle,
  value: string,
): ComponentStyleDefaults {
  const prev = (styles[kind] ?? {}) as Record<string, unknown>;
  const nextEntry: Record<string, unknown> = { ...prev };
  if (value === UNSET) {
    delete nextEntry[prop as string];
  } else {
    nextEntry[prop as string] = value;
  }

  const next: ComponentStyleDefaults = { ...styles };
  if (Object.keys(nextEntry).length === 0) {
    delete next[kind];
  } else {
    next[kind] = nextEntry as BuilderNodeStyle;
  }
  return next;
}

/** Read the current curated value of a prop on a kind (or UNSET if absent). */
export function readComponentStyleProp(
  styles: ComponentStyleDefaults,
  kind: BuilderNodeKind,
  prop: keyof BuilderNodeStyle,
): string {
  const entry = styles[kind] as Record<string, unknown> | undefined;
  const v = entry?.[prop as string];
  return typeof v === "string" ? v : UNSET;
}
