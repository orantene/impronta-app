"use client";

/**
 * hover-bridge.ts — Marathon W2-T3 (hover micro-store).
 *
 * Hover (`hoveredSectionId` / `hoveredBuilderNodeId`) is the single highest-
 * frequency state churn in the editor: a pointer sweep over a page fires the
 * setters dozens of times a second. While those lived in the EditProvider's
 * giant `value` useMemo, every hover boundary rebuilt the whole context value →
 * EVERY `useEditContext()` consumer (41 of them) re-rendered on each hover.
 *
 * This module hoists hover OUT of the context value into a process-singleton
 * `useSyncExternalStore` micro-store (the exact pattern shipped in
 * `client-builder-canvas-bridge.ts`). EditProvider PUBLISHES from its existing
 * hover setters; only the ~4 components that actually read a hovered id
 * SUBSCRIBE — so a hover now re-renders just those readers, not the whole chrome.
 *
 * Two independent primitive slices (section + node) so a consumer that reads
 * only one is not woken by a change to the other. `useSyncExternalStore`
 * returns a primitive snapshot (string | null) → inherently `Object.is`-stable,
 * no getServerSnapshot identity hazard.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

let hoveredSectionId: string | null = null;
let hoveredBuilderNodeId: string | null = null;

const sectionListeners = new Set<Listener>();
const nodeListeners = new Set<Listener>();

/** Publish the hovered SECTION id. No-op (no notify) when unchanged. */
export function publishHoveredSectionId(id: string | null): void {
  if (Object.is(hoveredSectionId, id)) return;
  hoveredSectionId = id;
  for (const l of sectionListeners) l();
}

/** Publish the hovered BUILDER-NODE id. No-op (no notify) when unchanged. */
export function publishHoveredBuilderNodeId(id: string | null): void {
  if (Object.is(hoveredBuilderNodeId, id)) return;
  hoveredBuilderNodeId = id;
  for (const l of nodeListeners) l();
}

export function subscribeHoveredSectionId(listener: Listener): () => void {
  sectionListeners.add(listener);
  return () => {
    sectionListeners.delete(listener);
  };
}

export function subscribeHoveredBuilderNodeId(listener: Listener): () => void {
  nodeListeners.add(listener);
  return () => {
    nodeListeners.delete(listener);
  };
}

export function getHoveredSectionIdSnapshot(): string | null {
  return hoveredSectionId;
}

export function getHoveredBuilderNodeIdSnapshot(): string | null {
  return hoveredBuilderNodeId;
}

/**
 * Server snapshot — hover is purely a client interaction, so it is always null
 * on the server / first paint (keeps SSR markup deterministic).
 */
export function getHoveredIdServerSnapshot(): null {
  return null;
}

/** Subscribe to the live hovered SECTION id (re-renders only on its change). */
export function useHoveredSectionId(): string | null {
  return useSyncExternalStore(
    subscribeHoveredSectionId,
    getHoveredSectionIdSnapshot,
    getHoveredIdServerSnapshot,
  );
}

/** Subscribe to the live hovered BUILDER-NODE id (re-renders only on its change). */
export function useHoveredBuilderNodeId(): string | null {
  return useSyncExternalStore(
    subscribeHoveredBuilderNodeId,
    getHoveredBuilderNodeIdSnapshot,
    getHoveredIdServerSnapshot,
  );
}
