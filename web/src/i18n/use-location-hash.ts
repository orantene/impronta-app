"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Current `window.location.hash` (including `#`), for locale-switch links.
 * Empty during SSR / first paint; updates on hashchange.
 * E3-J8-anchor: language switch from `/#services` must keep the section.
 */
export function useLocationHash(): string {
  const [hash, setHash] = useState("");
  useLayoutEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return hash;
}

/** Append the current hash to a locale path; no-op when hash empty. */
export function withLocationHash(href: string, hash: string): string {
  if (!hash || hash === "#") return href;
  const bare = href.split("#")[0] ?? href;
  return `${bare}${hash.startsWith("#") ? hash : `#${hash}`}`;
}
