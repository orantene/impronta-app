"use client";

/**
 * Phase 5 — global scroll-reveal observer.
 *
 * Mounted once in the root layout. Walks the DOM for elements with a
 * `[data-scroll-reveal]` attr (set by `presentationDataAttrs` when the
 * operator picks a scroll-reveal preset on a section), and toggles
 * `data-revealed="1"` once each enters the viewport. The CSS keyframes
 * for each preset live in `token-presets.css` and trigger only when
 * the second attr is set.
 *
 * Honors `prefers-reduced-motion: reduce` — when set, we mark every
 * reveal target as already revealed at mount so the content shows
 * immediately without animation.
 *
 * Zero-overhead when the page has no reveal targets (single querySelector
 * returns 0). Re-observes on route changes via a tiny MutationObserver
 * so SPA navigations pick up newly mounted sections.
 */

import { useEffect } from "react";

export function ScrollReveal() {
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function reveal(el: Element) {
      el.setAttribute("data-revealed", "1");
    }

    function setup() {
      const targets = document.querySelectorAll<HTMLElement>(
        "[data-scroll-reveal]:not([data-revealed])",
      );
      if (targets.length === 0) return;
      if (reduce || typeof IntersectionObserver === "undefined") {
        targets.forEach(reveal);
        return;
      }
      const obs = new IntersectionObserver(
        (entries, o) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              reveal(entry.target);
              o.unobserve(entry.target);
            }
          }
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
      );
      targets.forEach((t) => obs.observe(t));
      return () => obs.disconnect();
    }

    const cleanup = setup();
    // Re-scan on DOM mutations (route change, async section render).
    const mo = new MutationObserver(() => setup());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cleanup?.();
      mo.disconnect();
    };
  }, []);
  return null;
}
