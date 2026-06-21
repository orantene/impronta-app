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
    // Two render paths feed this: the TALENT shell wraps its header in
    // [data-talent-max-site-header] (CSS keys off the wrapper), while the
    // AGENCY storefront renders `.site-header` directly inside a [data-cms-section]
    // wrapper (CSS keys off the header's own [data-scrolled]). Drive both: any
    // talent wrapper + any agency header that opted into a scroll tone.
    const targets = [
      ...document.querySelectorAll<HTMLElement>("[data-talent-max-site-header]"),
      ...document.querySelectorAll<HTMLElement>(".site-header[data-scroll-tone]"),
    ];
    if (targets.length === 0) return;
    const apply = () => {
      const v = window.scrollY > thresholdPx ? "true" : "false";
      for (const el of targets) el.setAttribute("data-scrolled", v);
    };
    apply();
    window.addEventListener("scroll", apply, { passive: true });
    return () => window.removeEventListener("scroll", apply);
  }, [thresholdPx]);

  return null;
}
