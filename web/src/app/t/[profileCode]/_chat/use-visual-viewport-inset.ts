"use client";

/**
 * useVisualViewportInset — front-door v27 phone sheet.
 *
 * Returns the soft-keyboard (plus browser-chrome) inset in CSS pixels, derived
 * only from the browser's Visual Viewport API. Never invents a keyboard height.
 * SSR-safe: 0 until mounted.
 *
 * Formula matches the talent messages shell (`useKeyboardInset`): the gap
 * between the layout viewport and the visual viewport is the covered amount.
 * When the keyboard is closed the inset is 0 and the sheet sits on the home
 * indicator via `env(safe-area-inset-bottom)` in the geometry builder.
 */

import { useSyncExternalStore } from "react";

function readInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** Soft-keyboard inset in px from `window.visualViewport`. 0 when closed / SSR. */
export function useVisualViewportInset(): number {
  return useSyncExternalStore(subscribe, readInset, () => 0);
}
