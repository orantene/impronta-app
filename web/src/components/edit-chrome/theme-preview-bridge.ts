"use client";

/**
 * theme-preview-bridge.ts — GAP A (live theme reactivity).
 *
 * The ThemeDrawer's `set(key, value)` historically only mutated drawer-local
 * React state, so the canvas (which reads SSR-injected `--token-*` CSS vars
 * from the LIVE `theme_json` on <html>) didn't move until Publish + a full
 * `router.refresh()`. This module closes that gap with a process-singleton
 * `useSyncExternalStore` micro-store — the EXACT pattern shipped in
 * `selection-bridge.ts` / `builder-tree-bridge.ts` — holding the WORKING DRAFT
 * token map.
 *
 * Flow:
 *   ThemeDrawer.set()  → publishThemePreview(nextDraft)
 *   <ThemePreviewProjector/> subscribes, projects the draft's CSS-var tokens
 *     (`designTokensToCssVars`) onto the editor CANVAS ROOT element (the
 *     storefront wrapper, NOT the published <html>).
 *   Because every BOUND node already renders `var(--token-x, fallback)`, the
 *     write is a single CSS-var mutation on one element — the whole subtree
 *     recolours with ZERO tree re-render, instantly, under the operator's
 *     cursor.
 *
 * Isolation: the projection lives only in the editor (the projector is mounted
 * by EditShell) and only ever writes to the operator's own DOM at runtime. The
 * served storefront bytes are untouched — anonymous renders never see the
 * draft. Publish remains the only path that changes what visitors get.
 *
 * The store holds the FULL draft map (or null when no preview is active). A
 * fresh object is published each edit; the held reference IS the snapshot, so
 * `getSnapshot` is referentially stable between publishes (required so
 * `useSyncExternalStore` doesn't loop). `getServerSnapshot` returns the shared
 * `null` so SSR/CSR hydration matches.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

/** Read-only map shape the drawer publishes. */
export type ThemePreviewTokens = Readonly<Record<string, string>>;

/** Current working draft, or null when no preview is active (drawer closed). */
let previewTokens: ThemePreviewTokens | null = null;

const listeners = new Set<Listener>();

/**
 * Publish the working draft token map. Replaces the held reference and notifies
 * subscribers. Callers pass the full resolved draft (defaults under operator
 * overrides) — the projector decides which tokens have a CSS-var projection.
 */
export function publishThemePreview(tokens: ThemePreviewTokens): void {
  if (Object.is(previewTokens, tokens)) return;
  previewTokens = tokens;
  for (const l of listeners) l();
}

/**
 * Clear the preview (drawer closed / publish complete). The projector reverts
 * the canvas root to the inherited LIVE `--token-*` vars from <html>.
 */
export function clearThemePreview(): void {
  if (previewTokens === null) return;
  previewTokens = null;
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemePreviewTokens | null {
  return previewTokens;
}

function getServerSnapshot(): ThemePreviewTokens | null {
  return null;
}

/** Subscribe to the working draft token map (null when no preview active). */
export function useThemePreview(): ThemePreviewTokens | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
