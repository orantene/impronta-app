"use client";

/**
 * Copied from web/src/app/t/[profileCode]/_chat/use-focus-trap.ts
 * (route-private; provenance: guest mini-chat). Do not import the original
 * from the public talent profile route.
 *
 * TUL-534 / GRK-097: visibility uses getClientRects (fixed ancestors); callers
 * that open via CustomEvent can pass `restoreTarget` so close returns focus to
 * the CTA (activeElement is usually `<body>` by effect time); restore is
 * deferred so dock/sticky chrome can drop `inert` before focus returns.
 */

import { useEffect, useRef, type RefObject } from "react";

import { isFocusableVisible } from "./focusable-in";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function restoreFocus(el: HTMLElement | null) {
  if (!el || !document.contains(el)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

/** jsdom test harnesses often put rAF on `window` only, not the global. */
function scheduleFrame(cb: () => void): void {
  const raf =
    typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (fn: () => void) => {
            setTimeout(fn, 0);
          };
  raf(cb);
}

function pickRestoreTarget(
  restoreTarget: RefObject<HTMLElement | null> | undefined,
): HTMLElement | null {
  const fromRef = restoreTarget?.current;
  if (fromRef && document.contains(fromRef)) return fromRef;
  const ae = document.activeElement;
  if (
    ae instanceof HTMLElement &&
    ae !== document.body &&
    ae !== document.documentElement
  ) {
    return ae;
  }
  return null;
}

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  options?: { restoreTarget?: RefObject<HTMLElement | null> },
) {
  const ref = useRef<T | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const restoreTarget = options?.restoreTarget;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    restoreRef.current = pickRestoreTarget(restoreTarget);

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => isFocusableVisible(el) || el === document.activeElement,
      );

    const focusFirst = () => {
      const first = focusables()[0];
      if (first) first.focus();
      else {
        node.setAttribute("tabindex", "-1");
        node.focus();
      }
    };
    // Layout: dialog mounts in the same commit as active=true.
    focusFirst();
    scheduleFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl || !node.contains(activeEl)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      const restore = restoreRef.current;
      restoreRef.current = null;
      // Dock/sticky may still be inert/display:none in this tick (GRK-097).
      scheduleFrame(() => {
        restoreFocus(restore);
        scheduleFrame(() => restoreFocus(restore));
      });
    };
  }, [active, restoreTarget]);

  return ref;
}
