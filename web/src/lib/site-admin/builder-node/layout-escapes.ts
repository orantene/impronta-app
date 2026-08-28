/**
 * layout-escapes — the style keys the CANVAS DRAG HANDLES can write, and the
 * "put this block back where it started" reset built on top of them.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Direct manipulation on the canvas is easy to start and hard to undo more than
 * a step or two later. The operator report: "I can have a freeform all over the
 * place moving it up and down and then I can lose it, or I can't extend it — so
 * it would be cool to have back to default arrangement or back to default size
 * before it's been edited. Then it will not be easy to lose it."
 *
 * That is a genuine trap and not only a convenience one. `commitSelectedNodeTranslate`
 * clamps a drag so ≥40px of the block stays inside its parent, which keeps the
 * block grabbable — but a block can still end up rotated, stretched past its
 * container, or nudged far from where its siblings sit, with no single control
 * that says "undo all of that". Undo only helps while the edit is recent.
 *
 * WHAT COUNTS AS A LAYOUT ESCAPE
 * ──────────────────────────────
 * Exactly the keys the canvas's direct-manipulation handles write, and nothing
 * else. Each entry below maps to one handle:
 *
 *   translate                     → CanvasMoveHandle / arrow-key nudge (in-flow)
 *   top / right / bottom / left   → CanvasMoveHandle drag-to-place (absolute / fixed)
 *   rotate                        → CanvasRotateHandle
 *   width / height + min·max      → CanvasResizeHandles
 *   padding*                      → CanvasSpacingHandles (inner bars)
 *   margin*Free                   → CanvasSpacingHandles (outer bars)
 *   gap                           → CanvasGapHandles
 *
 * Deliberately NOT included: colour, typography, background, border, shadow,
 * visibility, and the `responsive.<bucket>.visibility` flags. Those are
 * decisions made in the Style panel, not accidents of a drag, and folding them
 * into this button would turn a targeted recovery into a destructive one. A
 * full wipe already exists separately as "Reset style".
 *
 * The reset walks the responsive buckets too, because a block stranded on the
 * tablet breakpoint is exactly as lost as one stranded on the base style, and a
 * base-only reset would leave the operator staring at an unchanged canvas.
 */

/** Style keys written by the canvas direct-manipulation handles. */
export const LAYOUT_ESCAPE_KEYS = [
  "translate",
  "top",
  "right",
  "bottom",
  "left",
  "rotate",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "gap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTopFree",
  "marginRightFree",
  "marginBottomFree",
  "marginLeftFree",
] as const;

export type LayoutEscapeKey = (typeof LAYOUT_ESCAPE_KEYS)[number];

const LAYOUT_ESCAPE_SET: ReadonlySet<string> = new Set(LAYOUT_ESCAPE_KEYS);

type StyleBag = Record<string, unknown>;

function isStyleBag(value: unknown): value is StyleBag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `style` carries at least one layout escape, at any breakpoint. */
export function hasLayoutEscapes(style: unknown): boolean {
  if (!isStyleBag(style)) return false;
  for (const key of LAYOUT_ESCAPE_KEYS) {
    if (style[key] !== undefined) return true;
  }
  const responsive = style.responsive;
  if (isStyleBag(responsive)) {
    for (const bucket of Object.values(responsive)) {
      if (!isStyleBag(bucket)) continue;
      for (const key of LAYOUT_ESCAPE_KEYS) {
        if (bucket[key] !== undefined) return true;
      }
    }
  }
  return false;
}

/**
 * Return `style` with every layout escape removed, at the base level and inside
 * each responsive bucket. A bucket that ends up empty is dropped, and a style
 * that ends up empty returns `undefined` so the node's `style` prop is cleared
 * entirely rather than persisting `{}`.
 *
 * Non-destructive by construction: keys not in {@link LAYOUT_ESCAPE_KEYS} pass
 * through untouched, so a block keeps its colour, type and background.
 */
export function stripLayoutEscapes(style: unknown): StyleBag | undefined {
  if (!isStyleBag(style)) return undefined;

  const next: StyleBag = {};
  for (const [key, value] of Object.entries(style)) {
    if (key === "responsive" || LAYOUT_ESCAPE_SET.has(key)) continue;
    next[key] = value;
  }

  const responsive = style.responsive;
  if (isStyleBag(responsive)) {
    const nextResponsive: StyleBag = {};
    for (const [bucketName, bucket] of Object.entries(responsive)) {
      if (!isStyleBag(bucket)) {
        nextResponsive[bucketName] = bucket;
        continue;
      }
      const nextBucket: StyleBag = {};
      for (const [key, value] of Object.entries(bucket)) {
        if (LAYOUT_ESCAPE_SET.has(key)) continue;
        nextBucket[key] = value;
      }
      if (Object.keys(nextBucket).length > 0) {
        nextResponsive[bucketName] = nextBucket;
      }
    }
    if (Object.keys(nextResponsive).length > 0) {
      next.responsive = nextResponsive;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
