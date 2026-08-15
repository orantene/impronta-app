"use client";

import { useEffect, useRef } from "react";

import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";
import type { CanvasDropResult } from "@/lib/site-admin/builder-node/canvas-node-drop";

import { autoscrollDeltaForY } from "./selection-layer-geometry";

/**
 * BLOCK-MOVE auto-scroll — edge-band scrolling for the pointer-driven block
 * move gesture.
 *
 * The section-reorder drag has had an auto-scroll rAF loop since W1; the block
 * move (W1-L7) never got one, so a block could not be dragged to a drop target
 * below the fold — the operator hit the viewport edge and the gesture simply
 * stopped making progress. This is the same band/ramp math
 * (`autoscrollDeltaForY`), applied to the block gesture.
 *
 * Lives in its own module rather than inline in `selection-layer.tsx` because
 * that file is on a size ratchet (it has grown into a god file once already),
 * and because the loop is self-contained: it owns its rAF handle and needs
 * nothing from the component but the live drag state and the drop resolver.
 *
 * While the window scrolls under a STATIONARY cursor the drop target is
 * recomputed each frame, so the indicator tracks the content moving beneath
 * the pointer instead of a pre-scroll snapshot. The capture-phase scroll
 * listener that owns the drop-candidate index keeps those candidates fresh, so
 * this loop can call the resolver directly.
 */

/** Chrome that must never resolve as a drop target while auto-scrolling. */
const CHROME_SELECTOR =
  "[data-edit-topbar],[data-edit-drawer],[data-edit-overlay],[data-selection-chip],[data-selection-chip-grip]";

/** The subset of the drag state this loop reads. */
export type CanvasNodeAutoscrollDrag =
  | { phase: "idle" }
  | { phase: "palette" }
  | {
      phase: "move";
      nodeId: string;
      draggedKind: BuilderNodeKind;
      drop: CanvasDropResult | null;
      cursorX: number;
      cursorY: number;
    };

type MovePhaseDrag = Extract<CanvasNodeAutoscrollDrag, { phase: "move" }>;

/**
 * Explicit predicate rather than an inline `drag.phase !== "move"` check: the
 * drag is a GENERIC (the caller's state union is wider than this module's), and
 * a bare discriminant comparison does not narrow a generic-typed value — the
 * property reads below would still see the `idle` variant.
 */
function isMovePhase<T extends CanvasNodeAutoscrollDrag>(
  drag: T,
): drag is T & MovePhaseDrag {
  return drag.phase === "move";
}

export function useCanvasNodeAutoscroll<T extends CanvasNodeAutoscrollDrag>(
  drag: T,
  setDrag: (next: T) => void,
  computeDrop: (
    cursorX: number,
    cursorY: number,
    draggedKind: BuilderNodeKind,
    excludeNodeId: string | null,
    paletteGalleryItemId?: string | null,
  ) => CanvasDropResult | null,
): void {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMovePhase(drag)) return;
    const moveDrag = drag;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const delta = autoscrollDeltaForY(moveDrag.cursorY, window.innerHeight);
      if (delta !== 0) {
        window.scrollBy(0, delta);
        const overEl = document.elementFromPoint(
          moveDrag.cursorX,
          moveDrag.cursorY,
        );
        const overChrome = Boolean(
          overEl instanceof Element && overEl.closest(CHROME_SELECTOR),
        );
        const fresh = overChrome
          ? null
          : computeDrop(
              moveDrag.cursorX,
              moveDrag.cursorY,
              moveDrag.draggedKind,
              moveDrag.nodeId,
              null,
            );
        if (
          fresh?.parentNodeId !== moveDrag.drop?.parentNodeId ||
          fresh?.index !== moveDrag.drop?.index ||
          fresh?.indicatorY !== moveDrag.drop?.indicatorY
        ) {
          setDrag({ ...moveDrag, drop: fresh } as T);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [drag, setDrag, computeDrop]);
}
