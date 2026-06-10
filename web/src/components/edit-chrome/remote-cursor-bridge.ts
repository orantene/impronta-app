"use client";

/**
 * remote-cursor-bridge.ts — WS1-B (live cursors) micro-store.
 *
 * Holds the latest broadcast cursor (+ selection) for each remote editor tab,
 * keyed by tabId. A process-singleton `useSyncExternalStore` store (the shipped
 * selection-bridge / dirty-bridge pattern) so ONLY the small remote-cursors overlay
 * re-renders on a cursor move — the heavy canvas and the ~56 `useEditContext`
 * consumers never re-render. Cursor data is pure ephemeral Realtime broadcast — it
 * never touches the database or the builder tree.
 */
import { useSyncExternalStore } from "react";

export interface RemoteCursor {
  tabId: string;
  /** data-builder-node-id the cursor is anchored to (fractional position within it). */
  nodeId: string;
  fx: number;
  fy: number;
  /** Display name + stable color for the peer. */
  name: string;
  color: string;
  /** The node id the peer currently has SELECTED (for selection awareness, WS1-C). */
  selectedNodeId: string | null;
  /** epoch ms of the last update (for pruning idle/disconnected peers). */
  lastSeen: number;
}

const EMPTY: ReadonlyMap<string, RemoteCursor> = new Map();
let cursors: ReadonlyMap<string, RemoteCursor> = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Insert/replace a peer's cursor. Always allocates a fresh Map (snapshot identity). */
export function upsertRemoteCursor(next: RemoteCursor): void {
  const map = new Map(cursors);
  map.set(next.tabId, next);
  cursors = map;
  emit();
}

/** Remove a peer's cursor (presence leave). No-op if absent. */
export function removeRemoteCursor(tabId: string): void {
  if (!cursors.has(tabId)) return;
  const map = new Map(cursors);
  map.delete(tabId);
  cursors = map;
  emit();
}

/** Drop any cursor whose tabId is not in `liveTabIds` (presence membership). */
export function reconcileRemoteCursors(liveTabIds: ReadonlySet<string>): void {
  let changed = false;
  const map = new Map(cursors);
  for (const tabId of map.keys()) {
    if (!liveTabIds.has(tabId)) {
      map.delete(tabId);
      changed = true;
    }
  }
  if (!changed) return;
  cursors = map;
  emit();
}

/** Clear everything (editor unmount). */
export function resetRemoteCursors(): void {
  if (cursors.size === 0) return;
  cursors = EMPTY;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlyMap<string, RemoteCursor> {
  return cursors;
}

function getServerSnapshot(): ReadonlyMap<string, RemoteCursor> {
  return EMPTY;
}

/** Subscribe to the live remote-cursor map (re-renders only the overlay). */
export function useRemoteCursors(): ReadonlyMap<string, RemoteCursor> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
