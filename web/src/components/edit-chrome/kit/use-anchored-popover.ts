"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface AnchoredPosition {
  top: number;
  left: number;
}

/** Minimal rect shape — the subset of DOMRect the placement math reads. */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Pure placement math (no DOM) so it can be unit-tested. Anchors a popover of
 * `width`×`popHeight` below `rect` (left- or right-aligned), clamps it into the
 * viewport horizontally, and flips it ABOVE the trigger when it would overflow
 * the bottom edge. `popHeight: 0` means "not measured yet" → no flip.
 */
export function computeAnchoredPosition(
  rect: AnchorRect,
  opts: {
    width: number;
    align: "left" | "right";
    gap: number;
    popHeight: number;
    viewportWidth: number;
    viewportHeight: number;
  },
): AnchoredPosition {
  const { width, align, gap, popHeight, viewportWidth, viewportHeight } = opts;
  let left = align === "right" ? rect.right - width : rect.left;
  left = Math.max(8, Math.min(left, viewportWidth - width - 8));
  let top = rect.bottom + gap;
  if (popHeight > 0 && top + popHeight > viewportHeight - 8) {
    top = Math.max(8, rect.top - popHeight - gap);
  }
  return { top, left };
}

/**
 * useAnchoredPopover — positioning + dismissal for a popover that is portaled to
 * <body> (via kit/PortaledOverlay) so it escapes the inspector dock's
 * `overflow-y:auto` / `overflow-x:hidden` scroll clip. Mirrors the proven
 * kit/color-picker.tsx logic:
 *
 *  - `triggerRef` goes on the trigger button; `popoverRef` on the portaled node.
 *  - `position` is computed from the trigger's `getBoundingClientRect()` as
 *    viewport-fixed coords: anchored below the trigger, left- or right-aligned,
 *    clamped into the viewport, and flipped ABOVE the trigger when it would
 *    overflow the bottom edge. Re-runs on scroll (capture) + resize so it tracks
 *    while the inspector scrolls.
 *  - Outside-click (capture phase, so the trigger's own toggle doesn't double-
 *    fire) and Escape call `onClose`. Because the popover is portaled out of the
 *    trigger's subtree, dismissal checks BOTH refs via `contains`.
 *
 * `position` is null until first measured; render the popover at opacity 0 (or
 * off-screen) until it resolves to avoid a one-frame flash at the wrong spot.
 */
export function useAnchoredPopover<
  T extends HTMLElement = HTMLButtonElement,
  P extends HTMLElement = HTMLDivElement,
>({
  open,
  onClose,
  width,
  align = "left",
  gap = 4,
}: {
  open: boolean;
  onClose: () => void;
  /** Popover width in px — used to clamp/right-align without measuring. */
  width: number;
  align?: "left" | "right";
  gap?: number;
}): {
  triggerRef: RefObject<T | null>;
  popoverRef: RefObject<P | null>;
  position: AnchoredPosition | null;
} {
  const triggerRef = useRef<T | null>(null);
  const popoverRef = useRef<P | null>(null);
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition(
        computeAnchoredPosition(rect, {
          width,
          align,
          gap,
          popHeight: popoverRef.current?.offsetHeight ?? 0,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    }
    place();
    // Re-place after paint so the popover height is known (enables flip-up).
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, width, align, gap]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  return { triggerRef, popoverRef, position };
}
