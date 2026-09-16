/**
 * dsl.ts — tiny node factories for authoring Looks and business components.
 *
 * Every factory returns a plain `BuilderNode` the registry already accepts.
 * Nothing here is a new node kind. Three markers are the only convention:
 *
 *   text: "{{copy.home.hero.headline}}"   → resolved from the Look's copy table
 *   src:  "look://image/hero"             → resolved by the image resolver
 *   anchorId: "slot-catalogue"            → replaced by a business component
 *
 * All three are resolved by `instantiateSite` BEFORE `validateBuilderNodeTree`,
 * and a leftover marker is a compose failure, never a rendered box (D-TPL-4).
 *
 * COLOUR: no literals. Bands use theme-paired `style.background`
 * (`surface` | `muted` | `accent` | `contrast`) and text uses `token:color.*`
 * refs, so the owner's palette recolours every Look (D-TPL-10).
 */

import type {
  BuilderNode,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node/types";

import {
  IMAGE_MARKER_PREFIX,
  slotAnchorId,
  type ImageSlotKey,
  type SlotId,
} from "./types";

type Style = BuilderNodeStyleValue & Record<string, unknown>;

let counter = 0;
/** Deterministic-enough authoring ids; `instantiateSite` re-mints them. */
export function tplId(kind: string): string {
  counter += 1;
  return `tpl-${kind}-${counter}`;
}

export const copy = (key: string): string => `{{copy.${key}}}`;

// ── Layout ──────────────────────────────────────────────────────────────────

export function stack(
  children: BuilderNode[],
  style: Style = {},
  extra: Partial<{ align: "start" | "center" | "end" | "stretch"; gap: "s" | "m" | "l"; layerLabel: string }> = {},
): BuilderNode {
  return {
    id: tplId("container"),
    kind: "container",
    props: { layout: "stack", gap: extra.gap ?? "m", align: extra.align, layerLabel: extra.layerLabel, style },
    children,
  };
}

export function row(
  children: BuilderNode[],
  style: Style = {},
  extra: Partial<{ align: "start" | "center" | "end" | "stretch"; gap: "s" | "m" | "l" }> = {},
): BuilderNode {
  return {
    id: tplId("container"),
    kind: "container",
    props: {
      layout: "row",
      gap: extra.gap ?? "m",
      align: extra.align ?? "center",
      style,
      responsive: { mobile: { layout: "stack" } },
    },
    children,
  };
}

export function grid(
  children: BuilderNode[],
  columns: 2 | 3 | 4,
  style: Style = {},
  gap: "s" | "m" | "l" = "m",
): BuilderNode {
  return {
    id: tplId("container"),
    kind: "container",
    props: {
      layout: "grid",
      columns,
      gap,
      style,
      responsive: {
        tablet: { columns: columns > 2 ? 2 : columns },
        mobile: { columns: 1 },
      },
    },
    children,
  };
}

export function split(
  left: BuilderNode,
  right: BuilderNode,
  ratio: "50-50" | "40-60" | "60-40" | "30-70" | "70-30" = "50-50",
  style: Style = {},
): BuilderNode {
  return {
    id: tplId("split"),
    kind: "split",
    props: { ratio, gap: "l", collapseOnMobile: true, style },
    children: [left, right],
  };
}

/**
 * A full-width page band: the OUTER container paints the theme-paired
 * background edge to edge; the INNER container holds the content at the
 * chosen max width. Two nodes on purpose: one node cannot be both full-bleed
 * and boxed.
 */
export function band(
  children: BuilderNode[],
  opts: Partial<{
    background: "none" | "surface" | "muted" | "accent" | "contrast";
    paddingY: "s" | "m" | "l" | "xl";
    maxWidth: "narrow" | "reading" | "wide" | "full";
    align: "start" | "center" | "end" | "stretch";
    gap: "s" | "m" | "l";
    layerLabel: string;
    style: Style;
  }> = {},
): BuilderNode {
  const inner = stack(
    children,
    {
      maxWidth: opts.maxWidth ?? "wide",
      paddingX: "m",
      width: "100%",
      // A band with a minimum height centres its content vertically.
      ...(opts.style?.minHeight ? { justifyContent: "center" } : {}),
      ...(opts.style ?? {}),
    },
    { align: opts.align ?? "start", gap: opts.gap ?? "l" },
  );
  return stack(
    [inner],
    {
      paddingY: opts.paddingY ?? "xl",
      maxWidth: "full",
      maxWidthFree: "100%",
      width: "100%",
      background: opts.background ?? "none",
    },
    { align: "center", gap: "m", layerLabel: opts.layerLabel },
  );
}

/** Root-level slot container; `instantiateSite` splices a component here. */
export function slot(id: SlotId): BuilderNode {
  const node = {
    id: tplId("slot"),
    kind: "container",
    anchorId: slotAnchorId(id),
    // `anchorId` on props is the validator's landing zone (validate.ts carries
    // it onto the base); the node type only declares the mirror.
    props: { layout: "stack", layerLabel: `Slot ${id}`, style: {}, anchorId: slotAnchorId(id) },
    children: [],
  };
  return node as unknown as BuilderNode;
}

// ── Text ────────────────────────────────────────────────────────────────────

export function h(level: 1 | 2 | 3 | 4, text: string, style: Style = {}): BuilderNode {
  return { id: tplId("heading"), kind: "heading", props: { text, level, style } };
}

export function p(text: string, style: Style = {}): BuilderNode {
  return { id: tplId("paragraph"), kind: "paragraph", props: { text, style } };
}

export function eyebrow(text: string): BuilderNode {
  return p(text, { size: "sm", tone: "muted", textTransform: "uppercase", letterSpacing: "0.12em" });
}

export function btn(
  label: string,
  href: string,
  tone: "primary" | "secondary" = "primary",
  style: Style = {},
): BuilderNode {
  return { id: tplId("button"), kind: "button", props: { label, href, tone, style } };
}

export function ctas(buttons: BuilderNode[], align: "start" | "center" | "end" = "start"): BuilderNode {
  return {
    id: tplId("cta_group"),
    kind: "cta_group",
    props: { layout: "row", gap: "m", align, style: {} },
    children: buttons,
  };
}

export function divider(): BuilderNode {
  return { id: tplId("divider"), kind: "divider", props: { style: {} } };
}

export function spacer(size: "s" | "m" | "l" = "m"): BuilderNode {
  return { id: tplId("spacer"), kind: "spacer", props: { size, style: {} } };
}

// ── Media ───────────────────────────────────────────────────────────────────

export function img(slotKey: ImageSlotKey, style: Style = {}, priority = false): BuilderNode {
  return {
    id: tplId("image"),
    kind: "image",
    props: {
      src: `${IMAGE_MARKER_PREFIX}${slotKey}`,
      alt: "",
      priority: priority || undefined,
      style: { objectFit: "cover", ...style },
    },
  };
}

export function masonry(children: BuilderNode[], columns: 2 | 3 | 4 = 3): BuilderNode {
  return {
    id: tplId("masonry"),
    kind: "masonry",
    props: { columns, gap: "m", style: {} },
    children,
  };
}

// ── Cards ───────────────────────────────────────────────────────────────────

export function card(children: BuilderNode[], variant: "elevated" | "outline" | "ghost" = "outline", style: Style = {}): BuilderNode {
  return { id: tplId("card"), kind: "card", props: { variant, style: { paddingX: "m", paddingY: "m", ...style } }, children };
}
