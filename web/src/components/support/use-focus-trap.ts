"use client";

/**
 * Copied from web/src/app/t/[profileCode]/_chat/use-focus-trap.ts
 * (route-private; provenance: guest mini-chat). Do not import the original
 * from the public talent profile route.
 *
 * TUL-534: visibility uses getClientRects (fixed ancestors); restore is
 * deferred so dock/sticky chrome can drop `inert` before focus returns.
 */

import { useEffect, useRef } from "react";

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

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

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
    requestAnimationFrame(focusFirst);

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
      // Dock/sticky may still be inert/display:none in this tick (GRK-097).
      requestAnimationFrame(() => {
        restoreFocus(restore);
        requestAnimationFrame(() => restoreFocus(restore));
      });
    };
  }, [active]);

  return ref;
}
