"use client";

import { useEffect, useRef } from "react";

/**
 * Publishes the sticky header's height as `--site-header-h` on the document
 * root, so anything that has to sit flush under the header can use it without
 * guessing: the menu's sticky category chips (phone), the desktop rail, and the
 * scroll offset of section anchors. Measured with a ResizeObserver, so a font
 * swap, the language switch or a phone rotation keeps it true. SSR-safe (does
 * nothing until mount); the variable is removed on unmount. Keep this strictly
 * "use client" with no type re-exports (server/client boundary 500 hazard).
 */
export function HeaderHeightVar() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = marker.current?.closest<HTMLElement>(".site-header");
    if (!header) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--site-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(header);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--site-header-h");
    };
  }, []);

  return <span ref={marker} hidden data-header-height-var="" />;
}
