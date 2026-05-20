"use client";

// ─── Accessibility helpers ───────────────────────────────────────────
//
// useReducedMotion + scrollBehavior. Extracted from primitives.tsx —
// Phase 1f decomposition.

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/**
 * WS-12.11 — Returns the appropriate ScrollBehavior for JS scroll calls.
 * CSS transitions are handled by the global `@media (prefers-reduced-motion)`
 * rule in page.tsx; this handles `scrollTo({ behavior })` calls that
 * CSS cannot intercept.
 *
 * Usage:
 *   element.scrollTo({ top: 0, behavior: scrollBehavior() });
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-16.7  ActivityFeed primitive — replaces 5 ad-hoc timeline feeds
// ─────────────────────────────────────────────────────────────────────────────

