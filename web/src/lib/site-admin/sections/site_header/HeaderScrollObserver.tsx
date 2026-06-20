"use client";

import { useEffect } from "react";

/**
 * Scroll-to-solid driver for the shell header. Toggles `data-scrolled` on the
 * nearest `[data-talent-max-site-header]` wrapper once the page scrolls past
 * `thresholdPx`; the token CSS (`[data-scrolled="true"] .site-header`) paints
 * the blurred solid bar. SSR-safe (does nothing until mount) and a pure visual
 * state change, so no reduced-motion gate is needed. Keep this strictly
 * "use client" with no type re-exports (server/client boundary 500 hazard).
 */
export function HeaderScrollObserver({
  thresholdPx = 40,
}: {
  thresholdPx?: number;
}) {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(
      "[data-talent-max-site-header]",
    );
    if (!header) return;
    const apply = () => {
      header.setAttribute(
        "data-scrolled",
        window.scrollY > thresholdPx ? "true" : "false",
      );
    };
    apply();
    window.addEventListener("scroll", apply, { passive: true });
    return () => window.removeEventListener("scroll", apply);
  }, [thresholdPx]);

  return null;
}
