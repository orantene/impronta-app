/**
 * pointer-drag-autoscroll — edge-band auto-scroll for the PANEL drag sites.
 *
 * The canvas has had auto-scroll since W1 (section reorder) and W1-L7 (block
 * move): both scroll `window` when the cursor enters a viewport edge band. The
 * panel drag sites — the navigator's section + child rows, and the freeform
 * "Page layers" tree — never got one, and they cannot reuse the canvas loops
 * because the thing that has to move is not the window but the PANEL'S OWN
 * scroll container. The result was the reported dead end: grab a layer row,
 * drag it to the top of the list, and the list simply stops making progress —
 * there is no way to reach a target that is scrolled out of view, so a long
 * page is effectively unreorderable from the Structure panel.
 *
 * This module is the panel-side counterpart. Two pure helpers (band ramp over a
 * container rect, and the drop-zone split) plus one DOM lookup, so the geometry
 * is unit-tested without a DOM and `usePointerDrag` keeps only the rAF wiring.
 *
 * Why a rect-relative band rather than reusing `autoscrollDeltaForY` from
 * selection-layer-geometry.ts: that helper measures against the VIEWPORT
 * (`0 … innerHeight`). A floating panel is a box in the middle of the screen —
 * its top edge is nowhere near y=0 — so the viewport version never fires inside
 * it. Same ramp shape, measured against the container's own box.
 */

/** px edge band inside the scroll container that triggers auto-scroll. */
export const PANEL_AUTOSCROLL_BAND = 44;

/** px per frame at the very edge of the band (ramps linearly to 0 at the inner edge). */
export const PANEL_AUTOSCROLL_MAX = 12;

/** Minimal rect shape the ramp needs (subset of DOMRect). */
export interface ScrollBandRect {
  top: number;
  bottom: number;
}

/**
 * Signed px/frame scroll delta for a pointer at `clientY` over a scroll
 * container occupying `rect`. Negative scrolls up, positive down, 0 when the
 * pointer sits in the calm middle. The ramp is linear: 0 at the inner edge of
 * the band, `max` at the container edge, and it keeps ramping (does not clamp
 * back to 0) once the pointer passes the edge entirely, so dragging PAST the
 * panel keeps the list moving at full speed instead of stalling.
 */
export function panelScrollDeltaForY(
  clientY: number,
  rect: ScrollBandRect,
  band: number = PANEL_AUTOSCROLL_BAND,
  max: number = PANEL_AUTOSCROLL_MAX,
): number {
  if (band <= 0) return 0;
  if (clientY < rect.top + band) {
    const depth = Math.min(band, rect.top + band - clientY);
    return -(depth / band) * max;
  }
  if (clientY > rect.bottom - band) {
    const depth = Math.min(band, clientY - (rect.bottom - band));
    return (depth / band) * max;
  }
  return 0;
}

/**
 * Where a drop lands relative to the row under the pointer.
 *
 * `before` / `after` are the pre-existing sibling drops. `inside` is the new
 * third option: the middle band of a CONTAINER row nests the dragged block into
 * that container. Before this existed the layer tree could only ever drop a
 * block as a SIBLING of a row that was already inside the target container — so
 * moving something into an empty (or not-yet-visited) container was impossible
 * from the panel, and, more to the point, nothing on screen ever said which
 * container a drop was landing in. That is the "I don't know if it's really
 * putting the component inside or outside" report.
 */
export type PointerDropZone = "before" | "inside" | "after";

/**
 * Fraction of the row height each EDGE band occupies when the row can be
 * nested into. 0.3 → before | inside | after split 30/40/30, which keeps the
 * sibling drops easy to hit while giving the nest band the largest target
 * (nesting is the harder gesture to perform by other means).
 */
export const NEST_EDGE_BAND_RATIO = 0.3;

/**
 * Split a pointer Y over a row box into a three-way drop zone.
 *
 * When `canNestInto` is false the row is not a container that accepts the
 * dragged kind, so the middle band collapses and the row keeps the original
 * two-way upper/lower-half behaviour — identical to `pointerOnUpperHalf`. This
 * is what makes the change additive: every row that could not be nested into
 * behaves exactly as it did before.
 */
export function pointerDropZone(
  clientY: number,
  rect: { top: number; height: number },
  canNestInto: boolean,
  edgeRatio: number = NEST_EDGE_BAND_RATIO,
): PointerDropZone {
  const offset = clientY - rect.top;
  if (!canNestInto) {
    return offset < rect.height / 2 ? "before" : "after";
  }
  const edge = rect.height * edgeRatio;
  // `<` on the leading edge and `>=` on the trailing one so the two sibling
  // bands are exactly the same size; mixing `<` with `>` leaves the trailing
  // band one pixel narrower and makes "after" feel very slightly harder to hit.
  if (offset < edge) return "before";
  if (offset >= rect.height - edge) return "after";
  return "inside";
}

/**
 * Nearest scrollable ancestor of `el` (inclusive), or `null` when nothing in
 * the chain actually scrolls. "Scrollable" means an overflow-y of auto/scroll
 * AND real overflow — an `overflow: auto` box whose content fits is not a
 * scroll container for our purposes and would swallow the lookup.
 */
export function findScrollableAncestor(
  el: Element | null,
): HTMLElement | null {
  let node: Element | null = el;
  while (node instanceof HTMLElement) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
