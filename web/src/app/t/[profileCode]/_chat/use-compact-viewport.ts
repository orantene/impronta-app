"use client";

/**
 * useCompactViewport — Jon 360 Phase 7. Reactive "is this a phone-class viewport"
 * signal for the MiniChatPanel's true full-screen mobile sheet.
 *
 * The panel renders as a ~380px floating card on desktop (a conversion risk on
 * phones, where it floats over content and the composer can hide behind the soft
 * keyboard). When this hook reports compact, the panel instead becomes a
 * full-screen, safe-area-inset sheet (100dvh) with the composer pinned.
 *
 * Compact = coarse pointer (touch) OR a narrow viewport (<= 520px). Either is a
 * phone-class context. SSR-safe: returns false until mounted (the desktop card is
 * the conservative default, so the first paint never traps a desktop user in a
 * full-screen sheet), then subscribes via matchMedia and re-renders on change
 * (rotation / responsive devtools).
 */

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse), (max-width: 520px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const mql = window.matchMedia(QUERY);
  // Safari < 14 only supports addListener; guard for both.
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

export function useCompactViewport(): boolean {
  // Server snapshot is always false → SSR renders the desktop card; the client
  // reconciles to the real value on mount.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
