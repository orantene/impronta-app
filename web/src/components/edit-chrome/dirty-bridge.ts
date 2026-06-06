"use client";

/**
 * dirty-bridge.ts — Marathon W2-T4 (dirty micro-store).
 *
 * `dirty` (inspector has un-persisted field edits) flips false→true on the
 * FIRST edit of a burst and back to false on save. While it lived in the
 * EditProvider `value` useMemo deps, that once-per-burst flip rebuilt the whole
 * context value → every useEditContext() consumer re-rendered.
 *
 * This hoists `dirty` into a process-singleton useSyncExternalStore micro-store
 * (the shipped client-builder-canvas-bridge / hover-bridge pattern). EditProvider
 * keeps its OWN React `dirty` state (its beforeunload guard effect still needs to
 * re-run on the change) but PUBLISHES the value here and drops it from the
 * value-memo deps — so the value identity is stable across a dirty flip and only
 * the ~4 components that read `dirty` (topbar / edit-shell / inspector-dock /
 * publish-drawer, via `useDirty()`) re-render.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

let dirty = false;
const listeners = new Set<Listener>();

/** Publish the dirty flag. No-op (no notify) when unchanged. */
export function publishDirty(next: boolean): void {
  if (dirty === next) return;
  dirty = next;
  for (const l of listeners) l();
}

export function subscribeDirty(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDirtySnapshot(): boolean {
  return dirty;
}

/** Server snapshot — never dirty on the server / first paint. */
export function getDirtyServerSnapshot(): boolean {
  return false;
}

/** Subscribe to the live dirty flag (re-renders only on its change). */
export function useDirty(): boolean {
  return useSyncExternalStore(
    subscribeDirty,
    getDirtySnapshot,
    getDirtyServerSnapshot,
  );
}
