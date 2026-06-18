/**
 * CANVAS-6 — Shared pointer-drag hook (touch parity for the builder chrome).
 *
 * Today the three reorder/insert drag sites in the editor chrome — the navigator
 * section rows + child-node rows (navigator-panel.tsx), the freeform layer tree
 * rows (freeform-layers-tree.tsx, CANVAS-5) and the Add-gallery cards
 * (add-gallery-panel.tsx) — are wired with the HTML5 Drag API
 * (`draggable`/`dragstart`/`dragover`/`drop`). HTML5 drag never fires on touch,
 * so the entire build flow is mouse-only: no iPad / touch parity.
 *
 * This hook is the SINGLE shared abstraction that swaps the HTML5 event source
 * for Pointer Events (`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`).
 * Pointer Events fire for mouse, touch AND pen from one code path, so adopting
 * the hook gives every drag site touch parity without a per-surface touch handler.
 *
 * Design contract (why adoption is low-risk): the hook only owns the *gesture
 * lifecycle* — the movement threshold before a drag engages (so a tap still
 * selects), pointer capture, and locating the row under the pointer on each move.
 * It does NOT own the drop math: each consumer keeps its existing
 * `resolve*DropTarget` + `move*` EditContext chokepoint calls and simply receives
 * the SAME `{ targetEl, clientX, clientY, onUpperHalf }` signal the old
 * `onDragOver`/`onDrop` handlers computed from a `DragEvent`. One seam, three
 * adoptions, identical drop logic — no parallel move path, no surface fork.
 *
 * The geometry (threshold + upper/lower-half resolution) lives in the pure
 * helpers below so it is unit-testable without a DOM; the hook is the thin React
 * glue around them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Pixels the pointer must travel before a press becomes a drag (tap-safe). */
export const POINTER_DRAG_THRESHOLD_PX = 5;

/**
 * True once the pointer has moved past the engage threshold from its press
 * origin. Below the threshold a press is still a tap (selection), so the row's
 * click/select handler keeps working — only a real drag swallows the gesture.
 *
 * Pure + DOM-free so the threshold math is unit-tested directly.
 */
export function pointerMovedPastThreshold(
  origin: { x: number; y: number },
  current: { x: number; y: number },
  threshold: number = POINTER_DRAG_THRESHOLD_PX,
): boolean {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  return dx * dx + dy * dy >= threshold * threshold;
}

/** Minimal rect shape (subset of DOMRect) the half-resolver needs. */
export interface PointerDragRect {
  top: number;
  height: number;
}

/**
 * Resolve whether a pointer Y sits on a row's UPPER half (drop BEFORE the row)
 * or LOWER half (drop AFTER). This is the identical signal the HTML5 handlers
 * computed as `event.clientY - rect.top < rect.height / 2`, extracted here so
 * every drag site shares one drop-edge convention and it can be unit-tested.
 *
 * Returns `true` for the upper half (before), `false` for the lower half (after).
 */
export function pointerOnUpperHalf(
  clientY: number,
  rect: PointerDragRect,
): boolean {
  return clientY - rect.top < rect.height / 2;
}

/**
 * Map an upper/lower-half hover over a row at `rowIndex` to a sibling **gap
 * index** (`0 … childCount`): upper half lands BEFORE the row (gap = rowIndex),
 * lower half lands AFTER it (gap = rowIndex + 1). This mirrors the convention
 * the navigator child drag + the freeform layer-drop resolver already use; it is
 * extracted so the hook's drop-index math is exercised by the test, independent
 * of the per-surface `siblingDropGapToMoveIndex` post-removal adjustment.
 */
export function pointerDropGapIndex(
  rowIndex: number,
  onUpperHalf: boolean,
): number {
  return onUpperHalf ? rowIndex : rowIndex + 1;
}

/**
 * Locate the draggable row element under a viewport point. Uses
 * `document.elementFromPoint` (Pointer Events do not carry a drop target the way
 * `dragover` does) and walks up to the nearest element matching `rowSelector`.
 * Returns `null` when the pointer is over empty space or a non-row element.
 */
export function rowElementFromPoint(
  clientX: number,
  clientY: number,
  rowSelector: string,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const hit = document.elementFromPoint(clientX, clientY);
  if (!(hit instanceof Element)) return null;
  const row = hit.closest(rowSelector);
  return row instanceof HTMLElement ? row : null;
}

/** Signal handed to consumer callbacks on each engaged pointer-drag move/drop. */
export interface PointerDragMove<TSource> {
  /** The drag source captured at `pointerdown` (consumer's row identity). */
  source: TSource;
  /** Nearest row element under the pointer, or `null` over empty space. */
  targetEl: HTMLElement | null;
  /** Viewport coordinates of the pointer (parity with `DragEvent.clientX/Y`). */
  clientX: number;
  clientY: number;
  /**
   * Convenience: upper-half flag relative to `targetEl`'s box, or `null` when
   * there is no row under the pointer. Lets a consumer keep using the exact
   * `onUpperHalf` signal its old `onDragOver` computed.
   */
  onUpperHalf: boolean | null;
}

export interface UsePointerDragOptions<TSource> {
  /**
   * CSS selector for a draggable row element (e.g. `[data-section-id]`). Used to
   * resolve the row under the pointer on each move via `elementFromPoint`.
   */
  rowSelector: string;
  /** Fired once, when the press crosses the movement threshold and drag begins. */
  onDragStart?: (source: TSource) => void;
  /** Fired on every engaged move — the consumer paints its drop indicator here. */
  onDragMove?: (move: PointerDragMove<TSource>) => void;
  /** Fired on pointerup IF a drag was engaged — the consumer commits the move. */
  onDrop?: (move: PointerDragMove<TSource>) => void;
  /** Fired when the gesture ends (drop, cancel, or sub-threshold release). */
  onDragEnd?: () => void;
  /** Movement threshold override (defaults to {@link POINTER_DRAG_THRESHOLD_PX}). */
  threshold?: number;
}

export interface PointerDragHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Touch must not scroll the panel while a row drag is in flight. */
  style: { touchAction: "none" };
}

export interface UsePointerDragResult<TSource> {
  /**
   * Spread onto each draggable row. Pass the row's source identity; the hook
   * arms the gesture on `pointerdown` and drives move/drop through the options.
   */
  getHandleProps: (source: TSource) => PointerDragHandleProps;
  /** True once a drag has engaged (past threshold) — drives row dimming etc. */
  isDragging: boolean;
}

interface ActiveGesture<TSource> {
  pointerId: number;
  source: TSource;
  origin: { x: number; y: number };
  engaged: boolean;
  captureEl: HTMLElement;
}

/**
 * Pointer-Events drag engine shared by the navigator, the freeform layer tree
 * and the Add-gallery cards. See the file header for the design contract.
 */
export function usePointerDrag<TSource>(
  options: UsePointerDragOptions<TSource>,
): UsePointerDragResult<TSource> {
  // Keep the latest options/callbacks in a ref so the window listeners + handle
  // props stay stable (bound once) yet always call the current callbacks. The
  // ref is written in an effect, never during render (react-hooks/refs).
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const gestureRef = useRef<ActiveGesture<TSource> | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const buildMove = useCallback(
    (
      source: TSource,
      clientX: number,
      clientY: number,
    ): PointerDragMove<TSource> => {
      const { rowSelector } = optionsRef.current;
      const targetEl = rowElementFromPoint(clientX, clientY, rowSelector);
      let onUpperHalf: boolean | null = null;
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        onUpperHalf = pointerOnUpperHalf(clientY, rect);
      }
      return { source, targetEl, clientX, clientY, onUpperHalf };
    },
    [],
  );

  const endGesture = useCallback((fireEnd: boolean) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setIsDragging(false);
    if (gesture) {
      try {
        gesture.captureEl.releasePointerCapture(gesture.pointerId);
      } catch {
        // Capture may already be lost (element unmounted) — non-fatal.
      }
    }
    if (fireEnd) optionsRef.current.onDragEnd?.();
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const point = { x: event.clientX, y: event.clientY };
      if (!gesture.engaged) {
        const threshold =
          optionsRef.current.threshold ?? POINTER_DRAG_THRESHOLD_PX;
        if (!pointerMovedPastThreshold(gesture.origin, point, threshold)) {
          return; // Still a tap — let the row's click/select handler win.
        }
        gesture.engaged = true;
        setIsDragging(true);
        optionsRef.current.onDragStart?.(gesture.source);
      }
      // Engaged: suppress the default touch scroll/selection and report the move.
      event.preventDefault();
      optionsRef.current.onDragMove?.(
        buildMove(gesture.source, event.clientX, event.clientY),
      );
    },
    [buildMove],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const wasEngaged = gesture.engaged;
      if (wasEngaged) {
        optionsRef.current.onDrop?.(
          buildMove(gesture.source, event.clientX, event.clientY),
        );
      }
      // A sub-threshold release was a tap, not a drag — only fire onDragEnd when
      // a drag actually engaged so consumers don't clear state on every click.
      endGesture(wasEngaged);
    },
    [buildMove, endGesture],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      endGesture(gesture.engaged);
    },
    [endGesture],
  );

  // Window-level move/up/cancel listeners while a gesture is live so the drag
  // keeps tracking even when the pointer leaves the row (parity with HTML5 drag,
  // which fires dragover on whatever's under the cursor). Bound once; the refs
  // make the handlers stable.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      handlePointerMove(event);
    }
    function onUp(event: PointerEvent) {
      handlePointerUp(event);
    }
    function onCancel(event: PointerEvent) {
      handlePointerCancel(event);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

  // Clear any in-flight gesture if the component unmounts mid-drag.
  useEffect(() => () => endGesture(false), [endGesture]);

  const getHandleProps = useCallback(
    (source: TSource): PointerDragHandleProps => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        // Only the primary button / a single touch initiates a drag; ignore
        // secondary-button presses and presses already inside another gesture.
        if (event.button !== 0 || gestureRef.current) return;
        const el = event.currentTarget;
        try {
          el.setPointerCapture(event.pointerId);
        } catch {
          // setPointerCapture can throw if the pointer is already gone — the
          // window listeners still track the gesture, so this is non-fatal.
        }
        gestureRef.current = {
          pointerId: event.pointerId,
          source,
          origin: { x: event.clientX, y: event.clientY },
          engaged: false,
          captureEl: el,
        };
      },
      style: { touchAction: "none" },
    }),
    [],
  );

  return { getHandleProps, isDragging };
}
