"use client";

/**
 * cart-talent-registry — a tiny client-side projection that records the
 * display name + portrait URL for every talent the visitor adds to the inquiry
 * cart, keyed by talentProfileId (plan §4.A.1 portrait/name data path).
 *
 * WHY THIS EXISTS (and why it is NOT a second cart store):
 *   The single source of truth for WHICH talent are in the cart is, and stays,
 *   `useInquiryCart().cartIds` (saved_talent). But the launcher rail needs each
 *   talent's PORTRAIT + NAME to render the face-focus avatar, and neither the
 *   cart ids nor PublicDiscoveryState carry photos. The directory cards already
 *   have that data (card.thumbnail.url + card.displayName), so each card registers
 *   it here the moment it adds a talent. The launcher then JOINS cartIds with this
 *   lookup (via useCartTalents) — a pure projection. The registry never decides
 *   membership; it only supplies presentation data for ids the cart already holds.
 *
 * This avoids an N+1 thumb fetch at the launcher (the byte-identical card thumb
 * is reused) and degrades gracefully: an id with no registry entry still renders
 * (name "Talent", portrait null → initials medallion), so a freshly-added talent
 * never vanishes from the rail.
 *
 * The store is a module-level singleton with a useSyncExternalStore subscription,
 * so reads stay reactive across the directory grid and the launcher without a
 * context provider. It is also seeded from sessionStorage so a returning visitor
 * (cart restored from saved_talent) still sees portraits before any card mounts.
 */

import { useSyncExternalStore } from "react";

import type { CartTalentLookup, CartTalentLookupEntry } from "./use-cart-talents";

const STORAGE_KEY = "tulala_cart_talent_registry";

type Entry = { displayName: string | null; portraitUrl: string | null };

let store: Record<string, Entry> = {};
let snapshot: Record<string, Entry> = {};
const listeners = new Set<() => void>();
let hydrated = false;

function readStorage(): Record<string, Entry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, Entry> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const e = v as Record<string, unknown>;
        out[id] = {
          displayName: typeof e.displayName === "string" ? e.displayName : null,
          portraitUrl: typeof e.portraitUrl === "string" ? e.portraitUrl : null,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* sessionStorage blocked — registry stays in-memory only. */
  }
}

function ensureHydrated(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = readStorage();
  if (Object.keys(stored).length > 0) {
    store = { ...stored, ...store };
    snapshot = store;
    emit();
  }
}

function emit(): void {
  snapshot = store;
  for (const l of listeners) l();
}

/**
 * Record (or update) the name + portrait for a talent the visitor just added to
 * the cart. Idempotent: a no-op when the entry is byte-identical so card
 * re-renders never thrash subscribers. Call this from the card on add.
 */
export function registerCartTalent(
  talentProfileId: string,
  entry: CartTalentLookupEntry,
): void {
  if (!talentProfileId) return;
  const next: Entry = {
    displayName: entry.displayName?.trim() || null,
    portraitUrl: entry.portraitUrl ?? null,
  };
  const cur = store[talentProfileId];
  if (cur && cur.displayName === next.displayName && cur.portraitUrl === next.portraitUrl) {
    return;
  }
  store = { ...store, [talentProfileId]: next };
  persist();
  emit();
}

/**
 * Backfill many entries at once (server-resolved cart portraits, plan §4.A.1 /
 * §5.5). Used when the cart was restored from saved_talent on a cold load: those
 * ids are not in the registry because the registry is only seeded by in-session
 * adds, so resolveGuestCartPortraits resolves their name + face and we merge the
 * results here. Optimistic in-session entries already present win (a server
 * thumb never clobbers a byte-identical card thumb), and a single emit covers
 * the whole batch so the rail re-renders once. Membership still lives in cartIds;
 * this only supplies presentation data for ids the cart already holds.
 */
export function registerCartTalents(
  entries: Array<{ talentProfileId: string; displayName: string | null; portraitUrl: string | null }>,
): void {
  let changed = false;
  const next = { ...store };
  for (const e of entries) {
    if (!e.talentProfileId) continue;
    const value: Entry = {
      displayName: e.displayName?.trim() || null,
      portraitUrl: e.portraitUrl ?? null,
    };
    const cur = next[e.talentProfileId];
    // Only fill gaps. If an in-session add already supplied a portrait, keep it
    // (it is the same card thumb the visitor just saw) rather than thrash.
    if (cur && cur.portraitUrl) continue;
    if (cur && cur.displayName === value.displayName && cur.portraitUrl === value.portraitUrl) {
      continue;
    }
    next[e.talentProfileId] = value;
    changed = true;
  }
  if (!changed) return;
  store = next;
  persist();
  emit();
}

function subscribe(cb: () => void): () => void {
  ensureHydrated();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Record<string, Entry> {
  return snapshot;
}

function getServerSnapshot(): Record<string, Entry> {
  return snapshot;
}

/**
 * Reactive read of the full registry as a CartTalentLookup, ready to hand to
 * useCartTalents. Re-renders when any card registers new portrait/name data.
 */
export function useCartTalentRegistry(): CartTalentLookup {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
