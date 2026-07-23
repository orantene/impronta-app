"use client";

/**
 * Advanced-mode store + hook (W2-C4).
 *
 * ONE per-user/per-workspace flag that flips the editor between "top minimal"
 * (default) and "everything shown". It gates power-user TOOLS only — never a
 * tenant's branding capability. The Design panel (Theme / Brand) and all
 * per-tenant token editing stay available at the DEFAULT level.
 *
 * Provider-free by design: a module-level cache + `window` event (mirroring
 * `use-builder-breakpoints.ts`) means any chrome can call `useAdvancedMode()`
 * without a wrapping context — clean for the multi-lane integration.
 *
 * Persistence: `localStorage["impronta.editChrome.advancedMode.v1"]`. Read on
 * boot; every writer dispatches ADVANCED_MODE_CHANGED so all consumers re-read.
 */

import { useSyncExternalStore } from "react";

export const ADVANCED_MODE_STORAGE_KEY = "impronta.editChrome.advancedMode.v1";
export const ADVANCED_MODE_CHANGED = "impronta.editChrome.advancedModeChanged";

const DEFAULT_ADVANCED = false;

/** Module cache — useSyncExternalStore requires a referentially stable value. */
let cachedRaw: string | null | undefined;
let cachedValue: boolean = DEFAULT_ADVANCED;

function parseAdvanced(raw: string | null): boolean {
  return raw === "1" || raw === "true";
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
  window.addEventListener(ADVANCED_MODE_CHANGED, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(ADVANCED_MODE_CHANGED, handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return DEFAULT_ADVANCED;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ADVANCED_MODE_STORAGE_KEY);
  } catch {
    return cachedValue;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = parseAdvanced(raw);
  return cachedValue;
}

function getServerSnapshot(): boolean {
  return DEFAULT_ADVANCED;
}

/** Read the current Advanced flag (false when no window / never toggled). */
export function getAdvancedMode(): boolean {
  return getSnapshot();
}

/** Persist + broadcast the Advanced flag. */
export function setAdvancedMode(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADVANCED_MODE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // best-effort — still broadcast so in-session consumers update.
  }
  invalidate();
  window.dispatchEvent(new Event(ADVANCED_MODE_CHANGED));
}

/** Flip the Advanced flag. */
export function toggleAdvancedMode(): void {
  setAdvancedMode(!getSnapshot());
}

/**
 * Subscribe to the Advanced flag. Returns `{ advanced, setAdvanced, toggle }`.
 * Any editor chrome can read this to hide/show power-user surfaces.
 */
export function useAdvancedMode(): {
  advanced: boolean;
  setAdvanced: (next: boolean) => void;
  toggle: () => void;
} {
  const advanced = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { advanced, setAdvanced: setAdvancedMode, toggle: toggleAdvancedMode };
}
