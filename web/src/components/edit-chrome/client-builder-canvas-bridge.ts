/**
 * Client-canvas builder-tree bridge (W3 Sub-step B).
 *
 * The storefront body (`homepage-cms-sections.tsx`, where the canvas DOM lives)
 * renders in the page `{children}` slot. The in-place editor's `EditProvider`
 * is mounted as a SIBLING subtree by `<EditChromeMount>` in the root layout —
 * it does NOT wrap the body. React context therefore cannot cross from
 * `EditProvider` into the body, so `<ClientBuilderCanvas>` (which lives in the
 * body) cannot read `builderTree` straight off `useEditContext()`.
 *
 * This module is the minimal cross-subtree bridge: a process-singleton store
 * that `EditProvider` PUBLISHES the live `builderTree` into, and that
 * `<ClientBuilderCanvas>` SUBSCRIBES to via `useSyncExternalStore`. It is a
 * deliberately tiny slice of the Sub-step E selector store — scoped to exactly
 * the one value the client canvas needs.
 *
 * SAFETY: both the publish (EditProvider) and the subscribe (ClientBuilderCanvas)
 * are gated behind `isBuilderClientCanvasEnabled()`. With the flag OFF nothing
 * touches this store and the legacy server-render path is byte-identical.
 */
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";

type Listener = () => void;

let currentTree: BuilderNodeTree | null = null;
const listeners = new Set<Listener>();

/**
 * Publish the latest in-memory tree. Called from `EditProvider` (flag-gated).
 * Stores the reference as-is; the canvas's `React.memo` boundaries rely on
 * `Object.is` identity, so callers must pass the same immutable-update tree
 * they hold in state (not a clone).
 */
export function publishBuilderCanvasTree(tree: BuilderNodeTree | null): void {
  if (Object.is(currentTree, tree)) return;
  currentTree = tree;
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` subscribe — returns an unsubscribe fn. */
export function subscribeBuilderCanvasTree(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore` snapshot getter. Stable reference between publishes. */
export function getBuilderCanvasTreeSnapshot(): BuilderNodeTree | null {
  return currentTree;
}
