"use client";

import { useEffect } from "react";

/**
 * Scroll-spy for Header nav chrome modes (side rail, bottom tabs, filter bar,
 * chapter dots). Marks the matching hash link with `aria-current="true"` and
 * `data-nav-spy-active` so CSS can highlight without inventing destinations.
 *
 * Targets: hash hrefs on the nearest `[data-nav-chrome]` ancestor's links.
 * Sections resolve via `document.getElementById` (builder `anchorId`).
 * SSR-safe (no-op until mount). Keep "use client" only — no type re-exports.
 */
export function NavChromeScrollSpy() {
  useEffect(() => {
    const roots = document.querySelectorAll<HTMLElement>(
      "[data-nav-chrome]:not([data-nav-chrome='top_bar']):not([data-nav-chrome='overlay'])",
    );
    if (roots.length === 0) return;

    const cleanups: Array<() => void> = [];

    for (const root of roots) {
      const links = Array.from(
        root.querySelectorAll<HTMLAnchorElement>("a[href^='#']"),
      ).filter((a) => {
        const hash = a.getAttribute("href")?.slice(1);
        return Boolean(hash && document.getElementById(hash));
      });
      if (links.length === 0) continue;

      const byId = new Map<string, HTMLAnchorElement[]>();
      for (const link of links) {
        const id = link.getAttribute("href")!.slice(1);
        const list = byId.get(id) ?? [];
        list.push(link);
        byId.set(id, list);
      }

      const setActive = (id: string | null) => {
        for (const [sectionId, group] of byId) {
          const on = sectionId === id;
          for (const a of group) {
            if (on) {
              a.setAttribute("aria-current", "true");
              a.setAttribute("data-nav-spy-active", "");
            } else {
              a.removeAttribute("aria-current");
              a.removeAttribute("data-nav-spy-active");
            }
          }
        }
      };

      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const top = visible[0]?.target;
          if (top && "id" in top && typeof top.id === "string") {
            setActive(top.id);
          }
        },
        { root: null, rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
      );

      for (const id of byId.keys()) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }

      cleanups.push(() => observer.disconnect());
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, []);

  return null;
}
