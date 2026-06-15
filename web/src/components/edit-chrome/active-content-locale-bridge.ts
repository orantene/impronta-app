"use client";

/**
 * active-content-locale-bridge.ts — WS5 (page-builder per-element translation).
 *
 * The edit-chrome top-bar carries an IN-SESSION "content locale" toggle. Unlike
 * the old `LocaleSwitcher` (which navigated to `/{locale}/…` and reloaded the
 * whole page to load a different `cms_pages` row), switching the content locale
 * here is a pure client-state flip: the canvas re-renders every node through
 * `resolveNodeProp(node, prop, activeContentLocale)` and the Content panel's
 * per-field locale tabs default to the active locale. No navigation, no reload.
 *
 * It lives in a process-singleton `useSyncExternalStore` micro-store (the shipped
 * dirty-bridge / selection-bridge / client-builder-canvas-bridge pattern) so the
 * flip re-renders ONLY the components that read it (canvas + content panel +
 * inline editor + topbar pill), never the whole `useEditContext()` tree.
 *
 * The store carries everything the canvas needs to resolve an overlay without a
 * context read: the active locale, the tenant default locale, and the ordered
 * fallback chain for the active locale (from `TenantLocaleSettings.fallbackChain`).
 */
import { useSyncExternalStore } from "react";

export interface ActiveContentLocaleState {
  /** The locale the operator is currently authoring / previewing. */
  locale: string;
  /** Tenant default ("primary") locale — the node's base-prop language. */
  defaultLocale: string;
  /** Ordered fallback walk for `resolveNodeProp(map, locale, chain)`. */
  chain: readonly string[];
}

type Listener = () => void;

const DEFAULT_STATE: ActiveContentLocaleState = {
  locale: "en",
  defaultLocale: "en",
  chain: ["en"],
};

let state: ActiveContentLocaleState = DEFAULT_STATE;
const listeners = new Set<Listener>();

function shallowEqual(
  a: ActiveContentLocaleState,
  b: ActiveContentLocaleState,
): boolean {
  return (
    a.locale === b.locale &&
    a.defaultLocale === b.defaultLocale &&
    a.chain.length === b.chain.length &&
    a.chain.every((code, i) => code === b.chain[i])
  );
}

/** Publish the active content-locale state. No-op (no notify) when unchanged. */
export function publishActiveContentLocale(next: ActiveContentLocaleState): void {
  if (shallowEqual(state, next)) return;
  state = next;
  for (const l of listeners) l();
}

export function subscribeActiveContentLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveContentLocaleSnapshot(): ActiveContentLocaleState {
  return state;
}

/**
 * Server / first-paint snapshot. STABLE identity (never re-created) so
 * `useSyncExternalStore` does not loop during hydration. The provider seeds the
 * real default via `publishActiveContentLocale` on mount.
 */
export function getActiveContentLocaleServerSnapshot(): ActiveContentLocaleState {
  return DEFAULT_STATE;
}

/** Subscribe to the active content-locale (re-renders only on its change). */
export function useActiveContentLocale(): ActiveContentLocaleState {
  return useSyncExternalStore(
    subscribeActiveContentLocale,
    getActiveContentLocaleSnapshot,
    getActiveContentLocaleServerSnapshot,
  );
}

/**
 * Client-safe fallback walk for `resolveLocalized(map, locale, chain)`:
 * `[requested, default, ...rest]`. Mirrors the server resolver's
 * `buildFallbackChain` (locale-resolver.ts) so the canvas / published render
 * resolve overlays identically. Inlined here (not imported) because the server
 * resolver pulls a Supabase client that must not enter the client bundle.
 */
export function buildContentFallbackChain(
  requested: string,
  defaultLocale: string,
  supported: readonly string[],
): string[] {
  const chain: string[] = [requested];
  if (defaultLocale !== requested) chain.push(defaultLocale);
  for (const l of supported) if (!chain.includes(l)) chain.push(l);
  return chain;
}
