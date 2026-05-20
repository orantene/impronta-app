"use client";

// ─── WS-0 Foundation: hooks ──────────────────────────────────────────
//
// Per ROADMAP §4 WS-0, these are the primitives that all other
// workstreams depend on. Keep them small, well-typed, SSR-safe.
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useEffect, useState } from "react";

/**
 * WS-0.1 — Viewport classification hook.
 *
 * Returns one of `phone | tablet | desktop | wide`. Breakpoints:
 *   phone   < 768
 *   tablet  768–1023
 *   desktop 1024–1279
 *   wide    ≥ 1280
 *
 * SSR-safe: returns `"desktop"` server-side / pre-mount, so HTML
 * markup is stable. Client-side then refines on the first paint and
 * tracks resizes thereafter (debounced 80ms — fast enough to feel
 * instant, slow enough to skip resize-storm renders).
 *
 * Implementation note: uses `matchMedia` listeners rather than a
 * resize event so we react only when the actual breakpoint changes
 * rather than every pixel. Same hook used by DrawerShell, message
 * stream, calendar, and bottom-nav.
 */
export type Viewport = "phone" | "tablet" | "desktop" | "wide";

const VIEWPORT_QUERIES: Array<{ query: string; viewport: Viewport }> = [
  { query: "(min-width: 1280px)", viewport: "wide" },
  { query: "(min-width: 1024px)", viewport: "desktop" },
  { query: "(min-width: 768px)", viewport: "tablet" },
  { query: "(max-width: 767.98px)", viewport: "phone" },
];

function classifyViewport(): Viewport {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  for (const { query, viewport } of VIEWPORT_QUERIES) {
    if (window.matchMedia(query).matches) return viewport;
  }
  return "desktop";
}

export function useViewport(): Viewport {
  // useState lazy initializer reads matchMedia on first client render.
  // Returns "desktop" during SSR — see file header comment.
  const [vp, setVp] = useState<Viewport>(() => classifyViewport());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let timer: number | null = null;
    const onChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setVp(classifyViewport());
        timer = null;
      }, 80);
    };
    // Listen on every breakpoint query — any of them flipping
    // means we need to re-classify.
    const mqls = VIEWPORT_QUERIES.map(({ query }) => window.matchMedia(query));
    mqls.forEach((mql) => mql.addEventListener("change", onChange));
    // Reconcile once on mount in case state was stale.
    onChange();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      mqls.forEach((mql) => mql.removeEventListener("change", onChange));
    };
  }, []);
  return vp;
}

/** Convenience helper: is the viewport at least the given size? */
export function viewportAtLeast(current: Viewport, min: Viewport): boolean {
  const order: Record<Viewport, number> = { phone: 0, tablet: 1, desktop: 2, wide: 3 };
  return order[current] >= order[min];
}

/**
 * WS-0.4 — Feature flag hook.
 *
 * Reads from URL `?flag=foo,bar,baz` plus a localStorage override at
 * key `tulala-feature-flags-v1` (comma-separated). Either source
 * activates the flag. Used to gate WS-1 chat redesign behind
 * `?flag=messages-v2` etc.
 *
 * SSR-safe: returns false until mounted on the client.
 */
const FEATURE_FLAG_STORAGE_KEY = "tulala-feature-flags-v1";

function readFlagSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const set = new Set<string>();
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("flag");
    if (fromUrl) fromUrl.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => set.add(k));
  } catch {}
  try {
    const raw = window.localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (raw) raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => set.add(k));
  } catch {}
  return set;
}

export function useFeatureFlag(key: string): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(readFlagSet().has(key));
    const onStorage = () => setActive(readFlagSet().has(key));
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return undefined;
  }, [key]);
  return active;
}

/** Dev/QA helper to flip a flag from the console. Not for prod use. */
export function setFeatureFlag(key: string, on: boolean): void {
  if (typeof window === "undefined") return;
  const set = readFlagSet();
  if (on) set.add(key);
  else set.delete(key);
  try {
    window.localStorage.setItem(FEATURE_FLAG_STORAGE_KEY, [...set].join(","));
    // Notify other tabs + this tab's listeners.
    window.dispatchEvent(new StorageEvent("storage", { key: FEATURE_FLAG_STORAGE_KEY }));
  } catch {}
}
