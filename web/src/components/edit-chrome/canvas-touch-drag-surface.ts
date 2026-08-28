/**
 * Make the selected block a TOUCH drag surface.
 *
 * The canvas move gesture (W1-L7 in `selection-layer.tsx`) is already written
 * against pointer events, so on paper it works with a finger. In practice it
 * did not: a `touchstart` on ordinary page content belongs to the browser's
 * scroll/pan gesture, and the moment the finger moves the browser claims it
 * and fires `pointercancel`. The move handler saw the cancel and stood down,
 * every time. The gesture was touch-shaped and touch-dead.
 *
 * `touch-action: none` is the declaration that hands the gesture back to the
 * page. The existing drag affordances already carry it (the section reorder
 * grip, the resize / spacing / gap / rotate handles); the block BODY could not,
 * because it is server-rendered content with no place to put the property.
 * So it is applied imperatively, and only to the one element the move gesture
 * actually starts on: the current selection.
 *
 * Two deliberate narrowings, both about not breaking what works:
 *
 *  - COARSE POINTERS ONLY. On a mouse the property changes nothing about the
 *    drag and would only take scroll-wheel-over-block away from the operator
 *    for no gain, so the desktop editor is left byte-identical.
 *  - ONE ELEMENT, and it is restored on cleanup. Scrolling the canvas from
 *    anywhere other than the selected block keeps working; deselecting gives
 *    the block itself back to the scroller.
 */

/** True when the primary input is a finger/stylus rather than a mouse. */
export function prefersCoarsePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Apply the touch-drag contract to `el`, returning the undo. A no-op (and a
 * no-op undo) on a fine pointer or a missing element, so the caller can wire
 * it unconditionally in an effect.
 */
export function armTouchDragSurface(el: HTMLElement | null): () => void {
  if (!el || !prefersCoarsePointer()) return () => {};
  const previous = el.style.touchAction;
  el.style.touchAction = "none";
  return () => {
    el.style.touchAction = previous;
  };
}
