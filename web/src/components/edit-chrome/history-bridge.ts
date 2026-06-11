"use client";

/**
 * history-bridge.ts — WS2 (value-memo stabilization, undo/redo-depth micro-store).
 *
 * `canUndo` (past.length > 0) / `canRedo` (future.length > 0) used to be value
 * fields on the EditProvider `value` useMemo, with `past.length` / `future.length`
 * in its deps. Every edit pushes a history entry (past.length changes) and every
 * ⌘Z pops one — so the whole context value rebuilt on every edit AND every undo,
 * re-rendering all ~56 useEditContext() consumers. Together with the tree dep this
 * is the "undo feels slow" cascade.
 *
 * This hoists the two booleans into a process-singleton `useSyncExternalStore`
 * micro-store (the shipped dirty-bridge / selection-bridge pattern). EditProvider
 * KEEPS its own `past` / `future` React state (the undo machine needs it) but
 * PUBLISHES the derived booleans here, and the ~4 components that gate undo/redo
 * buttons SUBSCRIBE via `useCanUndo()` / `useCanRedo()`. A history depth change
 * now re-renders only those readers, not the whole chrome.
 *
 * Two independent slices so a redo-only consumer is not woken by an undo-only
 * change. Both are primitive booleans → `Object.is`-stable snapshots, no identity
 * hazard. getServerSnapshot is deterministically `false` (nothing to undo/redo
 * on the server / first paint) so hydration matches.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

let canUndo = false;
let canRedo = false;
const undoListeners = new Set<Listener>();
const redoListeners = new Set<Listener>();

/** Publish whether an undo is available. No-op (no notify) when unchanged. */
export function publishCanUndo(next: boolean): void {
  if (canUndo === next) return;
  canUndo = next;
  for (const l of undoListeners) l();
}

/** Publish whether a redo is available. No-op (no notify) when unchanged. */
export function publishCanRedo(next: boolean): void {
  if (canRedo === next) return;
  canRedo = next;
  for (const l of redoListeners) l();
}

export function subscribeCanUndo(listener: Listener): () => void {
  undoListeners.add(listener);
  return () => {
    undoListeners.delete(listener);
  };
}

export function subscribeCanRedo(listener: Listener): () => void {
  redoListeners.add(listener);
  return () => {
    redoListeners.delete(listener);
  };
}

export function getCanUndoSnapshot(): boolean {
  return canUndo;
}

export function getCanRedoSnapshot(): boolean {
  return canRedo;
}

/** Server snapshot — never anything to undo/redo on the server / first paint. */
export function getHistoryServerSnapshot(): boolean {
  return false;
}

/** Subscribe to whether an undo is available (re-renders only on its change). */
export function useCanUndo(): boolean {
  return useSyncExternalStore(
    subscribeCanUndo,
    getCanUndoSnapshot,
    getHistoryServerSnapshot,
  );
}

/** Subscribe to whether a redo is available (re-renders only on its change). */
export function useCanRedo(): boolean {
  return useSyncExternalStore(
    subscribeCanRedo,
    getCanRedoSnapshot,
    getHistoryServerSnapshot,
  );
}
