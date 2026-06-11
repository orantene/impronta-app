"use client";

/**
 * builder-tree-bridge.ts — WS2 (value-memo stabilization, tree micro-store).
 *
 * The live `builderTree` used to sit in the EditProvider's giant `value`
 * useMemo (both as a value field AND a dep). Every edit produces a new tree
 * reference → the whole context value rebuilt → EVERY useEditContext()
 * consumer (~56 of them) re-rendered on each keystroke/nudge, and ⌘Z (undo)
 * fired the same O(whole-chrome) cascade. That is the "undo feels slow" report.
 *
 * This hoists the live tree OUT of the context value into a process-singleton
 * `useSyncExternalStore` micro-store — the exact shipped pattern in
 * `selection-bridge.ts` / `dirty-bridge.ts` / `hover-bridge.ts`. EditProvider
 * KEEPS its own React `builderTree` state (its mutation pipeline + effects still
 * need it) but PUBLISHES the latest reference here, and the ~17 components that
 * actually read the tree SUBSCRIBE via `useBuilderTree()`. An edit now
 * re-renders only the tree readers, not the whole chrome.
 *
 * The store holds the current tree reference and notifies on every change
 * (a new tree reference always means a real mutation — there is no membership
 * dedupe like the selection Sets, because the provider always hands us a fresh
 * array when, and only when, the tree changed). `Object.is` short-circuits a
 * re-publish of the identical reference so a stray duplicate publish is a no-op.
 *
 * getServerSnapshot returns the SHARED `EMPTY_TREE` reference (the SAME object
 * every call, never a fresh allocation) so hydration is deterministic and
 * `useSyncExternalStore` cannot infinite-loop. EditProvider seeds the real
 * initial tree via a mount-only `useLayoutEffect` so the first client paint
 * already shows the loaded tree (no empty-tree flash).
 */
import { useSyncExternalStore } from "react";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

type Listener = () => void;

/**
 * The one shared empty-tree reference. Returned by getServerSnapshot and used
 * as the initial client value. Must be the SAME object on every call —
 * allocating a fresh `[]` per call makes `useSyncExternalStore` see a new
 * snapshot every render and loop forever.
 */
const EMPTY_TREE: BuilderNodeTree = [];

let builderTree: BuilderNodeTree = EMPTY_TREE;
const listeners = new Set<Listener>();

/** Publish the live builder tree. No-op (no notify) when the reference is unchanged. */
export function publishBuilderTree(next: BuilderNodeTree): void {
  if (Object.is(builderTree, next)) return;
  builderTree = next;
  for (const l of listeners) l();
}

export function subscribeBuilderTree(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBuilderTreeSnapshot(): BuilderNodeTree {
  return builderTree;
}

/** Server snapshot — the SHARED empty-tree ref (same object every call). */
export function getBuilderTreeServerSnapshot(): BuilderNodeTree {
  return EMPTY_TREE;
}

/** Subscribe to the live builder tree (re-renders only when the tree changes). */
export function useBuilderTree(): BuilderNodeTree {
  return useSyncExternalStore(
    subscribeBuilderTree,
    getBuilderTreeSnapshot,
    getBuilderTreeServerSnapshot,
  );
}
