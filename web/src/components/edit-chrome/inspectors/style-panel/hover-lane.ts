/**
 * Hover v2 lane helpers.
 *
 * `BuilderNodeHoverStyle` in types.ts is still the curated color/transform
 * subset (Agent B owns that schema). The inspector writes a wider lane
 * (filter, backdrop, parent-hover) onto the same `hover` object, and
 * per-breakpoint hover onto `style.responsive.{tablet,mobile}.hover`.
 * Extra keys are preserved by the style-panel cleaner; the zod schema
 * still needs Agent B to admit them on save.
 */

import type {
  BuilderNodeHoverStyle,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";

import type { NodeViewport } from "./section-types";

export type HoverLaneStyle = BuilderNodeHoverStyle & {
  filter?: string;
  backdropFilter?: string;
  parentHover?: boolean;
};

export type StyleValueWithHover = BuilderNodeStyleValue & {
  hover?: HoverLaneStyle;
};

export function mergeHoverLane(
  current: HoverLaneStyle | undefined,
  patch: Partial<HoverLaneStyle>,
): HoverLaneStyle {
  return { ...(current ?? {}), ...patch };
}

export function readHoverLane(
  style: BuilderNodeStyle | undefined,
  viewport: NodeViewport,
): HoverLaneStyle | undefined {
  if (!style) return undefined;
  if (viewport === "desktop") return style.hover as HoverLaneStyle | undefined;
  const bucket = style.responsive?.[viewport] as StyleValueWithHover | undefined;
  return bucket?.hover;
}

export function hoverLaneHasValue(hover: HoverLaneStyle | undefined): boolean {
  if (!hover) return false;
  return Object.values(hover).some((value) => value !== undefined && value !== "");
}
