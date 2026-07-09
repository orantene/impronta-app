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

// ─────────────────────────────────────────────────────────────────────────────
// useNarrowLauncherViewport — audit item 7 (Lane G). A second, WIDER threshold
// dedicated to the floating launcher STACK (the avatar cart + the pill), not the
// panel sheet above. `useCompactViewport`'s <=520px query is tuned for "should
// the chat become a full-screen sheet" and under-fires on plain narrow/tablet
// windows with a fine pointer (e.g. a resized desktop browser at ~600-700px),
// which is exactly where real-browser testing found the free-floating avatar
// circles + "+N …more" pill overlapping profile content (review text / section
// headers). This hook answers a different question — "is there enough lateral
// room for avatars to break the pill's top edge without drifting over page
// content" — so it intentionally does not fold into useCompactViewport above.
// SSR-safe (false until mounted, same contract as useCompactViewport).
// ─────────────────────────────────────────────────────────────────────────────

const NARROW_LAUNCHER_QUERY = "(max-width: 700px)";

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const mql = window.matchMedia(NARROW_LAUNCHER_QUERY);
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

function getNarrowSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(NARROW_LAUNCHER_QUERY).matches;
}

/**
 * True below ~700px viewport width (any pointer type). Below this width the
 * launcher collapses its free-floating avatar cluster into the pill's existing
 * count badge instead of breaking overlapping circles above the pill (audit
 * item 7). At/above 700px (which covers the >=1024px desktop contract with
 * margin) the avatar rail renders exactly as before — byte-identical appearance.
 */
export function useNarrowLauncherViewport(): boolean {
  return useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, () => false);
}
