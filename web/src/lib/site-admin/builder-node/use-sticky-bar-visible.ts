"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import {
  HERO_PRIMARY_CTA_SELECTOR,
  stickyBarReservePx,
  stickyBarVisible,
} from "@/lib/talent-site/sticky-bar-visibility";

/**
 * TUL-344: drives the phone sticky bar. Returns `atTop` (true until the bar may show; renders true
 * on the server, so first paint never flashes it) and writes `--cb-bar-h` (the space the page
 * reserves under its content) on the root. In the builder canvas the bar is left as it was.
 */
export function useStickyBarVisible(
  nodeId: string,
  sheetOpen: boolean,
  barRef: RefObject<HTMLElement | null>,
): boolean {
  const [atTop, setAtTop] = useState(true);
  const state = useRef({ scrollY: 0, heroCtaVisible: false, hasHeroCta: false, menuInView: false });

  useEffect(() => {
    const inEditor = Boolean(barRef.current?.closest("[data-edit-storefront-canvas], [data-edit-preview]"));
    const apply = () => setAtTop(inEditor ? false : !stickyBarVisible({ ...state.current, sheetOpen }));
    const cleanups: Array<() => void> = [];
    const hero = document.querySelector(HERO_PRIMARY_CTA_SELECTOR);
    const menu = document.querySelector(`[data-builder-node-id="${nodeId}"]`);
    state.current.hasHeroCta = Boolean(hero);
    state.current.scrollY = window.scrollY;
    if (typeof IntersectionObserver !== "undefined") {
      if (hero) {
        const io = new IntersectionObserver((entries) => {
          state.current.heroCtaVisible = entries.some((e) => e.isIntersecting);
          apply();
        });
        io.observe(hero);
        cleanups.push(() => io.disconnect());
      }
      if (menu) {
        const io = new IntersectionObserver(
          (entries) => {
            state.current.menuInView = entries.some((e) => e.isIntersecting);
            apply();
          },
          { threshold: 0.33 },
        );
        io.observe(menu);
        cleanups.push(() => io.disconnect());
      }
    }
    const onScroll = () => {
      state.current.scrollY = window.scrollY;
      if (!state.current.hasHeroCta) apply();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));
    apply();
    return () => cleanups.forEach((fn) => fn());
  }, [nodeId, sheetOpen, barRef]);

  // Reserve the bar's height under the page (hidden or not, so revealing it shifts nothing).
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const cs = window.getComputedStyle(el);
      const reserve = stickyBarReservePx({
        displayed: cs.display !== "none",
        heightPx: el.offsetHeight,
        bottomPx: Number.parseFloat(cs.bottom),
      });
      root.style.setProperty("--cb-bar-h", `${reserve}px`);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--cb-bar-h");
    };
  }, [barRef]);

  return atTop;
}
