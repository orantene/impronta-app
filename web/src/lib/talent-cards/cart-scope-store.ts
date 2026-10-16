"use client";

/** Session-backed store for the cart's context map (see ./cart-scope). */

import { useSyncExternalStore } from "react";

import type { ScopeMap } from "./cart-scope";

const STORAGE_KEY = "tulala_cart_scopes";
const EMPTY: ScopeMap = Object.freeze({});

let current: ScopeMap = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (parsed && typeof parsed === "object") {
      const out: Record<string, string[]> = {};
      for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v)) out[id] = v.filter((s): s is string => typeof s === "string");
      }
      current = out;
    }
  } catch {
    /* storage unavailable: every entry reads as a directory entry */
  }
}

export function getCartScopes(): ScopeMap {
  hydrate();
  return current;
}

export function setCartScopes(next: ScopeMap) {
  hydrate();
  current = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCartScopes(): ScopeMap {
  return useSyncExternalStore(subscribe, getCartScopes, () => EMPTY);
}
