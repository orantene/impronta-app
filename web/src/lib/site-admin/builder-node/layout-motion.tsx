"use client";

/**
 * W3-T1 — editor insert / delete / reorder MOTION (the single biggest Feel lift).
 *
 * A `display: contents` wrapper that installs an auto-animate-style FLIP on the
 * REAL DOM children rendered by `renderBuilderNodes`:
 *   - inserts  → fade + rise into place
 *   - deletes  → fade out (the removed element is re-inserted for one beat, then
 *                animated out and detached)
 *   - reorders → every surviving sibling settles via a FLIP transform
 *
 * BYTE-STABLE / OVERLAY-SAFE contract — why this can wrap the canvas tree:
 *   - It is OPT-IN. `renderBuilderNodes` only emits it when `animateLayout` is
 *     true, which is ONLY passed by the editor's `ClientBuilderCanvas`. The
 *     server / published paths never pass it → their markup is byte-identical.
 *   - The wrapper element is `display: contents`, so it has no box and does NOT
 *     affect layout. The canvas overlay measurement (`querySelectorAll
 *     [data-builder-node-id]` + `getBoundingClientRect`) walks straight through
 *     it and reads the same elements at the same coordinates as before.
 *   - All motion is applied to the CHILD elements' own `transform` / `opacity`
 *     via the Web Animations API (no React state, no layout-thrash on the React
 *     render path). Animations are best-effort: if `Element.animate` is missing
 *     the wrapper is an inert pass-through.
 *
 * Honors `prefers-reduced-motion: reduce` — under it the observer never runs, so
 * inserts/deletes/reorders swap instantly (the structure is identical either
 * way; only the transition is suppressed). Pattern mirrors
 * `freeform-layer-row.tsx`'s `prefersReducedMotion()`.
 */

import { useEffect, useRef, type ReactNode } from "react";

const ENTER_MS = 260;
const MOVE_MS = 220;
const EXIT_MS = 180;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canAnimate(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function" &&
    !prefersReducedMotion()
  );
}

type Rect = { top: number; left: number };

/**
 * Snapshot the viewport position of every element child so a post-mutation FLIP
 * can compute how far each one travelled and settle it from its old spot.
 */
function measureChildren(container: HTMLElement): Map<Element, Rect> {
  const out = new Map<Element, Rect>();
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const r = child.getBoundingClientRect();
    out.set(child, { top: r.top, left: r.left });
  }
  return out;
}

export interface BuilderNodeLayoutMotionProps {
  children: ReactNode;
}

export function BuilderNodeLayoutMotion({
  children,
}: BuilderNodeLayoutMotionProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  // Positions captured on the most recent settled frame; the diff target for the
  // next mutation's FLIP.
  const lastRectsRef = useRef<Map<Element, Rect>>(new Map());

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    if (!canAnimate()) {
      // Reduced-motion / unsupported: no observer, instant structural swaps.
      return;
    }

    lastRectsRef.current = measureChildren(container);

    const enter = (el: HTMLElement) => {
      el.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: ENTER_MS, easing: EASE, fill: "none" },
      );
    };

    const settle = (el: HTMLElement, prev: Rect) => {
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: MOVE_MS, easing: EASE, fill: "none" },
      );
    };

    // A removed child is detached before we can animate it. Re-insert it for one
    // beat at its prior flow position, fade+lift it out, then detach for real.
    const exit = (el: HTMLElement, prev: Rect, anchor: Element | null) => {
      const host = container;
      const reattached =
        anchor && anchor.parentNode === host
          ? host.insertBefore(el, anchor)
          : host.appendChild(el);
      // Pin it so it doesn't reflow the survivors while fading.
      const now = reattached.getBoundingClientRect();
      reattached.style.pointerEvents = "none";
      reattached.style.position = "relative";
      reattached.style.zIndex = "0";
      const dx = prev.left - now.left;
      const dy = prev.top - now.top;
      const anim = reattached.animate(
        [
          {
            opacity: 1,
            transform: `translate(${dx}px, ${dy}px) scale(1)`,
          },
          {
            opacity: 0,
            transform: `translate(${dx}px, ${dy}px) scale(0.97)`,
          },
        ],
        { duration: EXIT_MS, easing: "ease-in", fill: "forwards" },
      );
      const drop = () => {
        if (reattached.parentNode === host) host.removeChild(reattached);
      };
      anim.addEventListener("finish", drop);
      anim.addEventListener("cancel", drop);
    };

    const observer = new MutationObserver((mutations) => {
      const prevRects = lastRectsRef.current;

      // 1) Exits — re-insert + fade the detached nodes (skip non-elements + any
      // node React itself re-homes, which still has a parent).
      for (const m of mutations) {
        for (const removed of Array.from(m.removedNodes)) {
          if (!(removed instanceof HTMLElement)) continue;
          if (removed.parentNode) continue; // moved, not deleted
          const prev = prevRects.get(removed);
          if (!prev) continue;
          const anchor =
            m.nextSibling instanceof Element ? m.nextSibling : null;
          exit(removed, prev, anchor);
        }
      }

      // 2) Survivors settle from their old positions (FLIP).
      for (const [el, prev] of prevRects) {
        if (el instanceof HTMLElement && el.parentNode === container) {
          settle(el, prev);
        }
      }

      // 3) Enters — fade+rise anything that wasn't measured last frame.
      for (const child of Array.from(container.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (!prevRects.has(child)) enter(child);
      }

      // Re-baseline for the next mutation.
      lastRectsRef.current = measureChildren(container);
    });

    observer.observe(container, { childList: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ display: "contents" }} data-builder-layout-motion="">
      {children}
    </div>
  );
}
