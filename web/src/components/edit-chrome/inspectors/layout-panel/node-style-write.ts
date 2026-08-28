/**
 * Layout tab — WHERE A STACK STYLE EDIT LANDS.
 *
 * Three of the stack fundamentals (wrap, justification, and a grid's minimum
 * column width) have no prop on the node: the renderer reads them off
 * `style.flexWrap` / `style.justifyContent` / `style.gridTemplateColumns`. So
 * the Layout tab, which otherwise writes props, needs one style write, and it
 * has to land in the same bucket the Style tab's controls land in or the two
 * tabs would disagree about the same value.
 *
 * It therefore routes through `style-panel/viewport-style-patch.ts` rather
 * than reimplementing the decision. What this module adds is the cleaner pair
 * that function takes as an injection: the Style panel passes its ~340-line
 * allow-lists, which live inside a 3,000-line client component this tab has no
 * business importing. The pair below is a PRUNER, not an allow-list — it drops
 * the keys a patch cleared and collapses an emptied bucket, and carries
 * everything else through untouched. That is strictly more conservative for a
 * round-trip: a key the Style panel's allow-list has not caught up with is
 * preserved here instead of being silently dropped on an unrelated edit.
 *
 * Pure. No React.
 */

import type {
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";
import {
  splitPatchByResponsiveLane,
  styleWithViewportPatch,
} from "../style-panel/viewport-style-patch";
import type { NodeViewport } from "../style-panel/section-types";
import { tierSupportsStyleOverrides } from "./stack-model";

function prune<T extends object>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === "") continue;
    out[key] = entry;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

const CLEANERS = {
  cleanStyle: (value: BuilderNodeStyle | undefined) => prune(value),
  cleanValue: (value: BuilderNodeStyleValue | undefined) => prune(value),
};

/**
 * The next `style` for a stack patch applied while the canvas is on `device`.
 *
 * Desktop writes the base style. Tablet and mobile write `responsive[tier]`,
 * except for a key with no breakpoint lane, which routes to the base rather
 * than into a bucket that would save, read back, and render nothing. A custom
 * tier is refused outright: `custom-breakpoint-css.ts` generates container-prop
 * rules for those and no style-key rules at all, so accepting the edit would be
 * the panel reporting a success the page never shows.
 */
export function stackStyleWithPatch(
  currentStyle: BuilderNodeStyle | undefined,
  device: string,
  patch: Partial<BuilderNodeStyleValue>,
): BuilderNodeStyle | undefined | null {
  if (!tierSupportsStyleOverrides(device)) return null;
  const viewport = device as NodeViewport;

  if (viewport === "desktop") {
    return styleWithViewportPatch(currentStyle, viewport, "viewport", patch, CLEANERS);
  }

  const { scoped, desktopOnly } = splitPatchByResponsiveLane(patch);
  let next = currentStyle;
  if (Object.keys(desktopOnly).length > 0) {
    next = CLEANERS.cleanStyle({ ...next, ...desktopOnly });
  }
  if (Object.keys(scoped).length === 0) return next;
  return styleWithViewportPatch(next, viewport, "viewport", scoped, CLEANERS);
}

/** The style value in force for `device`: the tier bucket over the base. */
export function stackViewportStyle(
  style: BuilderNodeStyle | undefined,
  device: string,
): BuilderNodeStyleValue | undefined {
  if (!style) return undefined;
  if (device === "desktop" || !tierSupportsStyleOverrides(device)) return style;
  const bucket = style.responsive as Record<string, BuilderNodeStyleValue | undefined> | undefined;
  return { ...style, ...(bucket?.[device] ?? {}) };
}

/** Only what the tier bucket itself holds, for the "overridden here" dot. */
export function stackTierOverride(
  style: BuilderNodeStyle | undefined,
  device: string,
): BuilderNodeStyleValue | undefined {
  if (!style || device === "desktop" || !tierSupportsStyleOverrides(device)) {
    return undefined;
  }
  const bucket = style.responsive as Record<string, BuilderNodeStyleValue | undefined> | undefined;
  return bucket?.[device];
}
