"use client";

/**
 * Profile draft store — the missing spine of #1.
 *
 * The three drawers (NewTalentDrawer / TalentRegistrationDrawer /
 * TalentProfileShellDrawer) used to each manage their own state, which
 * meant data didn't flow between them. This module is a tiny module-
 * scoped store that all three subscribe to. Any field set in QuickAdd
 * is visible to the Shell when "Continue editing" hands off; any data
 * the Wizard captures is visible to the Shell when admin approves.
 *
 * Shape mirrors `ProfileShellPayload.seed` plus the new fields the
 * QuickAdd drawer captures (first/last/email/phone/photo).
 *
 * Key design decisions:
 *  - Module-scoped singleton (not React Context) — survives drawer
 *    open/close cycles without re-mounting the provider.
 *  - SessionStorage-backed under `tulala.profile-draft.{key}` so
 *    refresh / reopen restores the in-flight profile.
 *  - Subscribe-only API; no global setter outside `useProfileDraft`.
 *  - `key` lets multiple in-flight drafts coexist (eg. admin invited
 *    Sofia AND is also editing Carlos in parallel).
 *
 * Out of scope: validation, server sync, conflict resolution. Those
 * live downstream.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  ProfileLanguage,
  ServiceArea,
} from "./_state";

export type ProfileDraft = {
  // Identity
  firstName?: string;
  lastName?: string;
  displayName?: string;     // Override; falls back to "First Last"
  pronunciation?: string;
  email?: string;
  phone?: string;
  phoneCountry?: string;
  photoUrl?: string;
  pronouns?: string | null;
  gender?: string | null;
  dob?: string | null;

  // Services
  primaryType?: string | null;
  secondaryTypes?: string[];
  specialties?: string[];

  // Location
  serviceArea?: ServiceArea;
  homeBase?: string;        // Convenience mirror

  // Languages
  languages?: ProfileLanguage[];

  // About
  bio?: string;

  // Media
  photoCount?: number;

  // Type-specific dynamic fields
  fields?: Record<string, string | string[]>;

  // Workflow
  method?: "agency" | "invited" | "draft";

  // Meta
  updatedAt?: string;       // ISO; latest write
  source?: "quick-add" | "wizard" | "shell" | "csv";
};

// ── Module-scoped registry ───────────────────────────────────────────

type Listener = () => void;
const drafts = new Map<string, ProfileDraft>();
const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  const set = listeners.get(key);
  if (set) for (const l of set) l();
}

const STORAGE_PREFIX = "tulala.profile-draft.";

/** Hydrate from sessionStorage on first access. */
function readStorage(key: string): ProfileDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as ProfileDraft;
  } catch {
    return null;
  }
}
function writeStorage(key: string, draft: ProfileDraft | null) {
  if (typeof window === "undefined") return;
  try {
    if (draft === null) {
      window.sessionStorage.removeItem(STORAGE_PREFIX + key);
    } else {
      window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(draft));
    }
  } catch {
    // sessionStorage may be disabled (privacy mode); fail silently.
  }
  // 2026 — also mirror to Service Worker IndexedDB for true durability
  // (survives tab close, browser restart, offline). Best-effort.
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: draft === null ? "tulala-draft-clear" : "tulala-draft-save",
        id: key,
        data: draft,
      });
    }
  } catch {
    // SW not active — that's fine, sessionStorage already covers in-tab.
  }
}

/**
 * Hydrate from the Service Worker's IndexedDB. Used on page reload to
 * recover drafts that survived tab close.
 */
export async function hydrateProfileDraftFromSW(key: string = "default"): Promise<ProfileDraft | null> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let resolved = false;
    channel.port1.onmessage = (e) => {
      resolved = true;
      const row = e.data?.row;
      resolve(row?.data ?? null);
    };
    navigator.serviceWorker.controller!.postMessage(
      { type: "tulala-draft-load", id: key },
      [channel.port2],
    );
    // Timeout 1000ms in case SW is slow / dead.
    setTimeout(() => { if (!resolved) resolve(null); }, 1000);
  });
}

function getOrInit(key: string): ProfileDraft {
  if (!drafts.has(key)) {
    const fromStorage = readStorage(key);
    drafts.set(key, fromStorage ?? {});
  }
  return drafts.get(key)!;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get the current draft snapshot synchronously. Used by handoff sites
 * (e.g. QuickAdd "Continue editing" → Shell mount reads this).
 */
export function readProfileDraft(key: string = "default"): ProfileDraft {
  return getOrInit(key);
}

/** Patch the draft. Triggers subscribers. Persists to sessionStorage. */
export function patchProfileDraft(
  key: string,
  patch: Partial<ProfileDraft>,
  source: ProfileDraft["source"] = "shell",
) {
  const cur = getOrInit(key);
  const next: ProfileDraft = {
    ...cur,
    ...patch,
    source,
    updatedAt: new Date().toISOString(),
  };
  drafts.set(key, next);
  writeStorage(key, next);
  notify(key);
}

/** Clear the draft. Used after successful submit / cancel. */
export function clearProfileDraft(key: string = "default") {
  drafts.delete(key);
  writeStorage(key, null);
  notify(key);
}

/**
 * Hook for components that read the draft and re-render on change.
 * Components that ONLY write should use `patchProfileDraft` directly
 * to avoid unnecessary subscription overhead.
 */
export function useProfileDraft(key: string = "default"): ProfileDraft {
  // useSyncExternalStore handles SSR + concurrent mode safely.
  const subscribe = (listener: Listener) => {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) listeners.delete(key);
    };
  };
  const getSnapshot = () => getOrInit(key);
  const getServerSnapshot = () => ({} as ProfileDraft);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ── Composed display helpers ────────────────────────────────────────

/** Auto-derive the display name from First+Last when override is blank. */
export function computedDisplayName(d: ProfileDraft): string {
  if (d.displayName?.trim()) return d.displayName.trim();
  return `${d.firstName?.trim() ?? ""} ${d.lastName?.trim() ?? ""}`.trim();
}

// ── Take-snapshot helper for diff comparisons ───────────────────────

export function snapshotProfileDraft(key: string = "default"): ProfileDraft {
  // Deep clone so caller can compare-by-reference safely.
  return JSON.parse(JSON.stringify(getOrInit(key))) as ProfileDraft;
}
