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

export const HOVER_V2_CSS = `
.site-builder-node[data-builder-style-hover-filter]:hover,.site-builder-node[data-builder-style-hover-filter]:focus-visible{filter:var(--bn-hover-filter)!important}
.site-builder-node[data-builder-style-hover-backdrop-filter]:hover,.site-builder-node[data-builder-style-hover-backdrop-filter]:focus-visible{backdrop-filter:var(--bn-hover-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-hover-backdrop-filter)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-bg]{background-color:var(--bn-hover-bg)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-color]{color:var(--bn-hover-color)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-border-color]{border-color:var(--bn-hover-border-color)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-shadow]{box-shadow:var(--bn-hover-shadow)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-scale]{scale:var(--bn-hover-scale)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-translate]{translate:var(--bn-hover-translate)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-opacity]{opacity:var(--bn-hover-opacity)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-filter]{filter:var(--bn-hover-filter)!important}
.site-builder-node:hover>.site-builder-node[data-builder-style-parent-hover][data-builder-style-hover-backdrop-filter]{backdrop-filter:var(--bn-hover-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-hover-backdrop-filter)!important}
@media (max-width:900px){
.site-builder-node[data-builder-style-tablet-hover-bg]:hover,.site-builder-node[data-builder-style-tablet-hover-bg]:focus-visible{background-color:var(--bn-tablet-hover-bg)!important}
.site-builder-node[data-builder-style-tablet-hover-color]:hover,.site-builder-node[data-builder-style-tablet-hover-color]:focus-visible{color:var(--bn-tablet-hover-color)!important}
.site-builder-node[data-builder-style-tablet-hover-border-color]:hover,.site-builder-node[data-builder-style-tablet-hover-border-color]:focus-visible{border-color:var(--bn-tablet-hover-border-color)!important}
.site-builder-node[data-builder-style-tablet-hover-shadow]:hover,.site-builder-node[data-builder-style-tablet-hover-shadow]:focus-visible{box-shadow:var(--bn-tablet-hover-shadow)!important}
.site-builder-node[data-builder-style-tablet-hover-scale]:hover,.site-builder-node[data-builder-style-tablet-hover-scale]:focus-visible{scale:var(--bn-tablet-hover-scale)!important}
.site-builder-node[data-builder-style-tablet-hover-translate]:hover,.site-builder-node[data-builder-style-tablet-hover-translate]:focus-visible{translate:var(--bn-tablet-hover-translate)!important}
.site-builder-node[data-builder-style-tablet-hover-opacity]:hover,.site-builder-node[data-builder-style-tablet-hover-opacity]:focus-visible{opacity:var(--bn-tablet-hover-opacity)!important}
.site-builder-node[data-builder-style-tablet-hover-filter]:hover,.site-builder-node[data-builder-style-tablet-hover-filter]:focus-visible{filter:var(--bn-tablet-hover-filter)!important}
.site-builder-node[data-builder-style-tablet-hover-backdrop-filter]:hover,.site-builder-node[data-builder-style-tablet-hover-backdrop-filter]:focus-visible{backdrop-filter:var(--bn-tablet-hover-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-tablet-hover-backdrop-filter)!important}
}
@media (max-width:640px){
.site-builder-node[data-builder-style-mobile-hover-bg]:hover,.site-builder-node[data-builder-style-mobile-hover-bg]:focus-visible{background-color:var(--bn-mobile-hover-bg)!important}
.site-builder-node[data-builder-style-mobile-hover-color]:hover,.site-builder-node[data-builder-style-mobile-hover-color]:focus-visible{color:var(--bn-mobile-hover-color)!important}
.site-builder-node[data-builder-style-mobile-hover-border-color]:hover,.site-builder-node[data-builder-style-mobile-hover-border-color]:focus-visible{border-color:var(--bn-mobile-hover-border-color)!important}
.site-builder-node[data-builder-style-mobile-hover-shadow]:hover,.site-builder-node[data-builder-style-mobile-hover-shadow]:focus-visible{box-shadow:var(--bn-mobile-hover-shadow)!important}
.site-builder-node[data-builder-style-mobile-hover-scale]:hover,.site-builder-node[data-builder-style-mobile-hover-scale]:focus-visible{scale:var(--bn-mobile-hover-scale)!important}
.site-builder-node[data-builder-style-mobile-hover-translate]:hover,.site-builder-node[data-builder-style-mobile-hover-translate]:focus-visible{translate:var(--bn-mobile-hover-translate)!important}
.site-builder-node[data-builder-style-mobile-hover-opacity]:hover,.site-builder-node[data-builder-style-mobile-hover-opacity]:focus-visible{opacity:var(--bn-mobile-hover-opacity)!important}
.site-builder-node[data-builder-style-mobile-hover-filter]:hover,.site-builder-node[data-builder-style-mobile-hover-filter]:focus-visible{filter:var(--bn-mobile-hover-filter)!important}
.site-builder-node[data-builder-style-mobile-hover-backdrop-filter]:hover,.site-builder-node[data-builder-style-mobile-hover-backdrop-filter]:focus-visible{backdrop-filter:var(--bn-mobile-hover-backdrop-filter)!important;-webkit-backdrop-filter:var(--bn-mobile-hover-backdrop-filter)!important}
}
`;
