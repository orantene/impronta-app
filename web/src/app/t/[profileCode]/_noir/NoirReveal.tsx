"use client";

/**
 * NoirReveal — reveal-on-scroll controller for the Noir profile template.
 *
 * Renders nothing. On mount it observes every `[data-nf-reveal]` element inside
 * the Noir shell and adds `nf-in` as each scrolls into view (the CSS in
 * NoirProfileLayout fades + lifts them). SSR-safe by construction:
 *   - The hero is NOT marked reveal, so it paints immediately.
 *   - Content is always in the DOM (only opacity/transform differ) → crawlers
 *     and no-JS users still get everything (a <noscript> style + the
 *     prefers-reduced-motion block reveal all up front).
 *   - If IntersectionObserver is missing, every section is revealed at once.
 */

import { useEffect } from "react";

export function NoirReveal() {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-profile-theme="noir"] [data-nf-reveal]'),
    );
    if (nodes.length === 0) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || typeof IntersectionObserver === "undefined") {
      for (const n of nodes) n.classList.add("nf-in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("nf-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, []);

  return null;
}
