"use client";

/**
 * Canvas-helpers store — the single ON/OFF switch behind the topbar's (i).
 *
 * "Helpers" are the teaching overlays the canvas paints over the operator's
 * own content: the "Double-click to edit" text hint, the "Replace image" pill
 * and the one-shot coachmark tips. They are useful on day one and pure noise
 * on day fifty — worse, they float over the very element you are reaching for,
 * so a power user drags through a hint before reaching the block.
 *
 * They stay ON by default (discoverability is the point) and the operator can
 * silence every one of them from a single control instead of dismissing tips
 * one at a time.
 *
 * What OFF does not touch: selection rings, handles, toolbars, and every
 * editing GESTURE — double-click-to-edit still opens the inline editor with
 * the hint hidden. The one affordance that goes with the pills is the
 * hover "Replace image" button; image replacement stays available from the
 * inspector, which is where the inline editor's own error paths already send
 * operators.
 *
 * Provider-free by design: a module-level cache + `window` event, mirroring
 * `advanced-mode.ts`, so any chrome (inside or outside the edit context) can
 * call `useCanvasHelpers()` without a wrapping provider.
 *
 * Persistence: `localStorage["impronta.editChrome.canvasHelpers.v1"]`. Read on
 * boot; every writer dispatches CANVAS_HELPERS_CHANGED so all consumers
 * re-read.
 */

import { useSyncExternalStore } from "react";

export const CANVAS_HELPERS_STORAGE_KEY = "impronta.editChrome.canvasHelpers.v1";
export const CANVAS_HELPERS_CHANGED = "impronta.editChrome.canvasHelpersChanged";

/** Helpers are ON until the operator turns them off. */
const DEFAULT_HELPERS = true;

/** Module cache — useSyncExternalStore requires a referentially stable value. */
let cachedRaw: string | null | undefined;
let cachedValue: boolean = DEFAULT_HELPERS;

/**
 * Only an explicit "0"/"false" disables. An absent key (never toggled) or an
 * unparseable value keeps the discoverable default rather than silently
 * stripping the hints a first-time operator depends on.
 */
function parseHelpers(raw: string | null): boolean {
  if (raw === null) return DEFAULT_HELPERS;
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return DEFAULT_HELPERS;
}

function invalidate(): void {
  cachedRaw = undefined;
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => {
    invalidate();
    onStoreChange();
  };
  window.addEventListener(CANVAS_HELPERS_CHANGED, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CANVAS_HELPERS_CHANGED, handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return DEFAULT_HELPERS;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CANVAS_HELPERS_STORAGE_KEY);
  } catch {
    return cachedValue;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = parseHelpers(raw);
  return cachedValue;
}

function getServerSnapshot(): boolean {
  return DEFAULT_HELPERS;
}

/** Read the current helpers flag (true when no window / never toggled). */
export function getCanvasHelpers(): boolean {
  return getSnapshot();
}

/** Persist + broadcast the helpers flag. */
export function setCanvasHelpers(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_HELPERS_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // best-effort — still broadcast so in-session consumers update.
  }
  invalidate();
  window.dispatchEvent(new Event(CANVAS_HELPERS_CHANGED));
}

/** Flip the helpers flag. */
export function toggleCanvasHelpers(): void {
  setCanvasHelpers(!getSnapshot());
}

/**
 * Subscribe to the helpers flag. Returns `{ helpers, setHelpers, toggle }`.
 * Every canvas teaching overlay reads this before rendering.
 */
export function useCanvasHelpers(): {
  helpers: boolean;
  setHelpers: (next: boolean) => void;
  toggle: () => void;
} {
  const helpers = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { helpers, setHelpers: setCanvasHelpers, toggle: toggleCanvasHelpers };
}
