"use client";

/**
 * selection-bridge.ts — Marathon W2 (selection micro-store).
 *
 * Selection (`selectedSectionId` / `selectedBuilderNodeId` + the two multi-select
 * Sets) used to live in the EditProvider's giant `value` useMemo. Every click
 * rebuilt the whole context value (selection sat in its deps) → EVERY
 * `useEditContext()` consumer (~56 of them) re-rendered on each selection change.
 * A single click was an O(whole-chrome) re-render.
 *
 * This module hoists selection OUT of the context value into a process-singleton
 * `useSyncExternalStore` micro-store (the exact pattern shipped in
 * `hover-bridge.ts`). EditProvider PUBLISHES from a `useEffect` per slice (the
 * React state is KEPT in the provider so the auto-clear effects keep firing);
 * only the components that actually read a selected id SUBSCRIBE — so a click now
 * re-renders just those readers, not the whole chrome.
 *
 * FOUR independent slices so a consumer that reads only one is not woken by a
 * change to another:
 *   - `selectedSectionId` / `selectedBuilderNodeId` — primitives, `Object.is`-
 *     stable snapshots (string | null), no identity hazard.
 *   - `additionalSelectedIds` / `additionalSelectedBuilderNodeIds` — Sets. The
 *     store holds the current Set reference; `publish…(next)` NO-OPs (no notify,
 *     keeps the same ref) when membership is unchanged (same size + every member
 *     present), so `getSnapshot` returns a reference that is stable across
 *     renders unless membership actually changed — required for
 *     `useSyncExternalStore` not to loop.
 *
 * getServerSnapshot is deterministic (null for primitives, the SHARED
 * `EMPTY_STRING_SET` for Sets — the SAME ref every call, never a per-call
 * allocation, or `useSyncExternalStore` infinite-loops) so hydration matches.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

/**
 * The one shared empty-set reference. Returned by every Set getServerSnapshot
 * and used as the initial client value. Must be the SAME object on every call —
 * allocating a fresh `new Set()` per call makes `useSyncExternalStore` see a new
 * snapshot every render and loop forever.
 */
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

let selectedSectionId: string | null = null;
let selectedBuilderNodeId: string | null = null;
let additionalSelectedIds: ReadonlySet<string> = EMPTY_STRING_SET;
let additionalSelectedBuilderNodeIds: ReadonlySet<string> = EMPTY_STRING_SET;

const sectionListeners = new Set<Listener>();
const builderNodeListeners = new Set<Listener>();
const additionalSectionListeners = new Set<Listener>();
const additionalBuilderNodeListeners = new Set<Listener>();

/** True when two sets have identical membership (same size + every member present). */
function sameMembership(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const member of a) {
    if (!b.has(member)) return false;
  }
  return true;
}

/** Publish the selected SECTION id. No-op (no notify) when unchanged. */
export function publishSelectedSectionId(id: string | null): void {
  if (Object.is(selectedSectionId, id)) return;
  selectedSectionId = id;
  for (const l of sectionListeners) l();
}

/** Publish the selected BUILDER-NODE id. No-op (no notify) when unchanged. */
export function publishSelectedBuilderNodeId(id: string | null): void {
  if (Object.is(selectedBuilderNodeId, id)) return;
  selectedBuilderNodeId = id;
  for (const l of builderNodeListeners) l();
}

/**
 * Publish the additional-selected SECTION ids. NO-OP (no notify, keep the held
 * ref) when membership is unchanged — so `getSnapshot` stays referentially
 * stable across renders unless the set actually changed.
 */
export function publishAdditionalSelectedIds(next: ReadonlySet<string>): void {
  if (sameMembership(additionalSelectedIds, next)) return;
  additionalSelectedIds = next;
  for (const l of additionalSectionListeners) l();
}

/**
 * Publish the additional-selected BUILDER-NODE ids. NO-OP (see above) when
 * membership is unchanged.
 */
export function publishAdditionalSelectedBuilderNodeIds(
  next: ReadonlySet<string>,
): void {
  if (sameMembership(additionalSelectedBuilderNodeIds, next)) return;
  additionalSelectedBuilderNodeIds = next;
  for (const l of additionalBuilderNodeListeners) l();
}

export function subscribeSelectedSectionId(listener: Listener): () => void {
  sectionListeners.add(listener);
  return () => {
    sectionListeners.delete(listener);
  };
}

export function subscribeSelectedBuilderNodeId(listener: Listener): () => void {
  builderNodeListeners.add(listener);
  return () => {
    builderNodeListeners.delete(listener);
  };
}

export function subscribeAdditionalSelectedIds(listener: Listener): () => void {
  additionalSectionListeners.add(listener);
  return () => {
    additionalSectionListeners.delete(listener);
  };
}

export function subscribeAdditionalSelectedBuilderNodeIds(
  listener: Listener,
): () => void {
  additionalBuilderNodeListeners.add(listener);
  return () => {
    additionalBuilderNodeListeners.delete(listener);
  };
}

export function getSelectedSectionIdSnapshot(): string | null {
  return selectedSectionId;
}

export function getSelectedBuilderNodeIdSnapshot(): string | null {
  return selectedBuilderNodeId;
}

export function getAdditionalSelectedIdsSnapshot(): ReadonlySet<string> {
  return additionalSelectedIds;
}

export function getAdditionalSelectedBuilderNodeIdsSnapshot(): ReadonlySet<string> {
  return additionalSelectedBuilderNodeIds;
}

/**
 * Server snapshot for the primitive slices — selection is a client interaction,
 * always null on the server / first paint (keeps SSR markup deterministic).
 */
export function getSelectedIdServerSnapshot(): null {
  return null;
}

/**
 * Server snapshot for the Set slices — the SHARED empty-set ref (the SAME object
 * every call, never a fresh allocation).
 */
export function getAdditionalSelectedServerSnapshot(): ReadonlySet<string> {
  return EMPTY_STRING_SET;
}

/** Subscribe to the live selected SECTION id (re-renders only on its change). */
export function useSelectedSectionId(): string | null {
  return useSyncExternalStore(
    subscribeSelectedSectionId,
    getSelectedSectionIdSnapshot,
    getSelectedIdServerSnapshot,
  );
}

/** Subscribe to the live selected BUILDER-NODE id (re-renders only on its change). */
export function useSelectedBuilderNodeId(): string | null {
  return useSyncExternalStore(
    subscribeSelectedBuilderNodeId,
    getSelectedBuilderNodeIdSnapshot,
    getSelectedIdServerSnapshot,
  );
}

/** Subscribe to the live additional-selected SECTION ids (stable ref unless membership changes). */
export function useAdditionalSelectedIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeAdditionalSelectedIds,
    getAdditionalSelectedIdsSnapshot,
    getAdditionalSelectedServerSnapshot,
  );
}

/** Subscribe to the live additional-selected BUILDER-NODE ids (stable ref unless membership changes). */
export function useAdditionalSelectedBuilderNodeIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeAdditionalSelectedBuilderNodeIds,
    getAdditionalSelectedBuilderNodeIdsSnapshot,
    getAdditionalSelectedServerSnapshot,
  );
}
