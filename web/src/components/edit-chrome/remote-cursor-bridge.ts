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

/**
 * How long a peer's cursor + selection ring survive with no further broadcast.
 *
 * Broadcasts go out at ~22fps WHILE the peer moves the pointer (BROADCAST_MS in
 * remote-cursors-layer). A peer who stops moving stops broadcasting, so without
 * a TTL their ring stays on your canvas until presence tears the channel down —
 * which never happens if their tab is simply idle, backgrounded, or on a laptop
 * that went to sleep. That is half of the owner's stuck border.
 *
 * 8s is comfortably longer than any pause inside a real gesture and short
 * enough that a walked-away peer's ring clears while you are still looking at
 * the screen.
 */
export const REMOTE_CURSOR_TTL_MS = 8_000;

/**
 * Drop every cursor whose `lastSeen` is older than the TTL. Returns true when
 * something was pruned (so a caller can skip an emit it does not need).
 *
 * `lastSeen` was written on every upsert since WS1-B and read by nobody — the
 * field's own doc comment promised "for pruning idle/disconnected peers" and
 * the pruning was never built. This is it.
 */
export function pruneStaleRemoteCursors(now: number = Date.now()): boolean {
  let changed = false;
  const map = new Map(cursors);
  for (const [tabId, cursor] of map) {
    if (now - cursor.lastSeen > REMOTE_CURSOR_TTL_MS) {
      map.delete(tabId);
      changed = true;
    }
  }
  if (!changed) return false;
  cursors = map;
  emit();
  return true;
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

/**
 * The live map, for callers outside React (the TTL sweep's own test). Exported
 * rather than reaching into the module singleton from a test file.
 */
export function getRemoteCursorsSnapshot(): ReadonlyMap<string, RemoteCursor> {
  return cursors;
}

function getServerSnapshot(): ReadonlyMap<string, RemoteCursor> {
  return EMPTY;
}

/** Subscribe to the live remote-cursor map (re-renders only the overlay). */
export function useRemoteCursors(): ReadonlyMap<string, RemoteCursor> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
