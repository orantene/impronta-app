/**
 * canvas-z-order — pure sibling stacking math for the ⌘] / ⌘[ z-order
 * commands (no DOM, no React; codebase precedent: canvas-align-guides.ts).
 *
 * The builder's stacking escape is `style.zIndex` (integer, registry-bounded
 * to -999..999; unset renders as auto ≈ 0 with DOM order breaking ties).
 * "Bring forward" should hop the selected block JUST above the nearest
 * overlapping sibling that currently paints above it — not to the global
 * front — so repeated presses walk the stack one neighbour at a time, exactly
 * like Figma/Sketch.
 *
 * The caller (selection-layer) snapshots each OVERLAPPING sibling's effective
 * z-index and whether it comes AFTER the target in DOM order (later DOM paints
 * on top at equal z), then asks this module for the new z. `null` = no-op —
 * nothing overlapping in that direction, so the keyboard handler / menu item
 * does nothing rather than silently writing a value with no visible effect.
 */

/** Registry bounds for the style.zIndex escape (see builder-node/registry.ts). */
export const Z_ORDER_MIN = -999;
export const Z_ORDER_MAX = 999;

export type ZOrderCommand = "forward" | "backward" | "front" | "back";

/**
 * The effective z-index a node's style escape contributes: the `zIndex`
 * number when set, else 0 (auto — DOM order decides). Tolerant of the loose
 * `Record<string, unknown>` style shape the tree stores.
 */
export function effectiveZIndex(style: unknown): number {
  const z = (style as { zIndex?: unknown } | null | undefined)?.zIndex;
  return typeof z === "number" && Number.isFinite(z) ? z : 0;
}

export interface ZOrderSibling {
  /** The sibling's effective z-index (style.zIndex escape, 0 when unset). */
  z: number;
  /** True when the sibling comes AFTER the target in DOM order. */
  domAfter: boolean;
}

export interface ZOrderInput {
  /** The selected block's effective z-index (0 when unset). */
  current: number;
  /** OVERLAPPING siblings only — the caller pre-filters by rect intersection. */
  siblings: ReadonlyArray<ZOrderSibling>;
  command: ZOrderCommand;
}

/** A sibling that paints ABOVE the target under CSS stacking rules. */
function paintsAbove(sib: ZOrderSibling, current: number): boolean {
  return sib.z > current || (sib.z === current && sib.domAfter);
}

/** A sibling that paints BELOW the target. */
function paintsBelow(sib: ZOrderSibling, current: number): boolean {
  return sib.z < current || (sib.z === current && !sib.domAfter);
}

function clampZ(z: number): number {
  return Math.max(Z_ORDER_MIN, Math.min(Z_ORDER_MAX, Math.round(z)));
}

/**
 * The new z-index for a stacking command, or `null` when the command cannot
 * change anything (no overlapping sibling in that direction, or the clamp
 * lands back on the current value).
 *
 *   forward  → one above the LOWEST sibling currently painting above.
 *   backward → one below the HIGHEST sibling currently painting below.
 *   front    → one above the highest overlapping sibling.
 *   back     → one below the lowest overlapping sibling.
 */
export function computeZOrderTarget(input: ZOrderInput): number | null {
  const { current, siblings, command } = input;
  if (siblings.length === 0) return null;
  const above = siblings.filter((s) => paintsAbove(s, current));
  const below = siblings.filter((s) => paintsBelow(s, current));

  let target: number;
  switch (command) {
    case "forward": {
      if (above.length === 0) return null;
      target = clampZ(Math.min(...above.map((s) => s.z)) + 1);
      break;
    }
    case "backward": {
      if (below.length === 0) return null;
      target = clampZ(Math.max(...below.map((s) => s.z)) - 1);
      break;
    }
    case "front": {
      if (above.length === 0) return null;
      target = clampZ(Math.max(...siblings.map((s) => s.z)) + 1);
      break;
    }
    case "back": {
      if (below.length === 0) return null;
      target = clampZ(Math.min(...siblings.map((s) => s.z)) - 1);
      break;
    }
  }
  return target === current ? null : target;
}
