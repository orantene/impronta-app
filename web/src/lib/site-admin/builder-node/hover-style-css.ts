/**
 * Hover v2 CSS + attr/var emit.
 *
 * The base hover lane (bg/color/border/shadow/scale/translate/opacity) already
 * lives in render.tsx. This module adds the missing pieces Field Report W3
 * asked for, without widening types.ts:
 *   - filter / backdrop-filter on :hover
 *   - parent-hover (child responds when a direct parent node is hovered)
 *   - per-breakpoint hover vars consumed inside the existing tablet/mobile
 *     media queries (900px / 640px)
 */

import { resolveStyleTokenRef } from "./style-token-bindings";
import type { BuilderNodeHoverStyle, BuilderNodeStyle } from "./types";

type HoverLane = BuilderNodeHoverStyle & {
  filter?: string;
  backdropFilter?: string;
  parentHover?: boolean;
};

type ValueWithHover = { hover?: HoverLane };

function token(value: string | undefined): string | undefined {
  return resolveStyleTokenRef(value) as string | undefined;
}

function readBucketHover(
  style: BuilderNodeStyle | undefined,
  viewport: "tablet" | "mobile",
): HoverLane | undefined {
  return (style?.responsive?.[viewport] as ValueWithHover | undefined)?.hover;
}

export function hoverLaneAttrs(
  style: BuilderNodeStyle | undefined,
): Record<string, string | undefined> {
  const hover = style?.hover as HoverLane | undefined;
  const tablet = readBucketHover(style, "tablet");
  const mobile = readBucketHover(style, "mobile");
  return {
    "data-builder-style-hover-filter": hover?.filter ? "" : undefined,
    "data-builder-style-hover-backdrop-filter": hover?.backdropFilter
      ? ""
      : undefined,
    "data-builder-style-parent-hover": hover?.parentHover ? "" : undefined,
    "data-builder-style-tablet-hover-bg": tablet?.backgroundColor ? "" : undefined,
    "data-builder-style-tablet-hover-color": tablet?.color ? "" : undefined,
    "data-builder-style-tablet-hover-border-color": tablet?.borderColor
      ? ""
      : undefined,
    "data-builder-style-tablet-hover-shadow": tablet?.boxShadow ? "" : undefined,
    "data-builder-style-tablet-hover-scale": tablet?.scale ? "" : undefined,
    "data-builder-style-tablet-hover-translate": tablet?.translate
      ? ""
      : undefined,
    "data-builder-style-tablet-hover-opacity":
      typeof tablet?.opacity === "number" ? "" : undefined,
    "data-builder-style-tablet-hover-filter": tablet?.filter ? "" : undefined,
    "data-builder-style-tablet-hover-backdrop-filter": tablet?.backdropFilter
      ? ""
      : undefined,
    "data-builder-style-mobile-hover-bg": mobile?.backgroundColor ? "" : undefined,
    "data-builder-style-mobile-hover-color": mobile?.color ? "" : undefined,
    "data-builder-style-mobile-hover-border-color": mobile?.borderColor
      ? ""
      : undefined,
    "data-builder-style-mobile-hover-shadow": mobile?.boxShadow ? "" : undefined,
    "data-builder-style-mobile-hover-scale": mobile?.scale ? "" : undefined,
    "data-builder-style-mobile-hover-translate": mobile?.translate
      ? ""
      : undefined,
    "data-builder-style-mobile-hover-opacity":
      typeof mobile?.opacity === "number" ? "" : undefined,
    "data-builder-style-mobile-hover-filter": mobile?.filter ? "" : undefined,
    "data-builder-style-mobile-hover-backdrop-filter": mobile?.backdropFilter
      ? ""
      : undefined,
  };
}

export function hoverLaneVars(
  style: BuilderNodeStyle | undefined,
): Record<string, string | number | undefined> {
  const hover = style?.hover as HoverLane | undefined;
  const tablet = readBucketHover(style, "tablet");
  const mobile = readBucketHover(style, "mobile");
  return {
    "--bn-hover-filter": hover?.filter,
    "--bn-hover-backdrop-filter": hover?.backdropFilter,
    "--bn-tablet-hover-bg": token(tablet?.backgroundColor),
    "--bn-tablet-hover-color": token(tablet?.color),
    "--bn-tablet-hover-border-color": token(tablet?.borderColor),
    "--bn-tablet-hover-shadow": token(tablet?.boxShadow),
    "--bn-tablet-hover-scale": tablet?.scale,
    "--bn-tablet-hover-translate": tablet?.translate,
    "--bn-tablet-hover-opacity": tablet?.opacity,
    "--bn-tablet-hover-filter": tablet?.filter,
    "--bn-tablet-hover-backdrop-filter": tablet?.backdropFilter,
    "--bn-mobile-hover-bg": token(mobile?.backgroundColor),
    "--bn-mobile-hover-color": token(mobile?.color),
    "--bn-mobile-hover-border-color": token(mobile?.borderColor),
    "--bn-mobile-hover-shadow": token(mobile?.boxShadow),
    "--bn-mobile-hover-scale": mobile?.scale,
    "--bn-mobile-hover-translate": mobile?.translate,
    "--bn-mobile-hover-opacity": mobile?.opacity,
    "--bn-mobile-hover-filter": mobile?.filter,
    "--bn-mobile-hover-backdrop-filter": mobile?.backdropFilter,
  };
}

/** Per-viewport hover v2 rules. Folded into the existing tablet/mobile
 *  `@media` blocks in render.tsx so we do not ship a second wrapper. */
export function hoverV2ViewportRules(id: "tablet" | "mobile"): string {
  const n = ".site-builder-node";
  const h = ":is(:hover,:focus-visible)";
  const a = (k: string) => `${n}[data-builder-style-${id}-hover-${k}]${h}`;
  const v = (k: string) => `var(--bn-${id}-hover-${k})`;
  return (
    `${a("bg")}{background-color:${v("bg")}!important}` +
    `${a("color")}{color:${v("color")}!important}` +
    `${a("border-color")}{border-color:${v("border-color")}!important}` +
    `${a("shadow")}{box-shadow:${v("shadow")}!important}` +
    `${a("scale")}{scale:${v("scale")}!important}` +
    `${a("translate")}{translate:${v("translate")}!important}` +
    `${a("opacity")}{opacity:${v("opacity")}!important}` +
    `${a("filter")}{filter:${v("filter")}!important}` +
    `${a("backdrop-filter")}{backdrop-filter:${v("backdrop-filter")}!important;-webkit-backdrop-filter:${v("backdrop-filter")}!important}`
  );
}

export const HOVER_V2_CSS =
  `.site-builder-node[data-builder-style-hover-filter]:is(:hover,:focus-visible){filter:var(--bn-hover-filter)!important}` +
  `.site-builder-node[data-builder-style-hover-backdrop-filter]:is(:hover,:focus-visible){backdrop-filter:var(--bn-hover-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-hover-backdrop-filter)!important}` +
  `.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover]{background-color:var(--bn-hover-bg)!important;color:var(--bn-hover-color)!important;border-color:var(--bn-hover-border-color)!important;box-shadow:var(--bn-hover-shadow)!important;scale:var(--bn-hover-scale)!important;translate:var(--bn-hover-translate)!important;opacity:var(--bn-hover-opacity)!important;filter:var(--bn-hover-filter)!important;backdrop-filter:var(--bn-hover-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-hover-backdrop-filter)!important}`;
