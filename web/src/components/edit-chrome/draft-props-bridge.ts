"use client";

/**
 * draft-props-bridge.ts — Wave 3 item 3.1 (draftProps micro-store).
 *
 * `draftProps` (the inspector's working copy of the selected section's props)
 * changes on EVERY keystroke in a curated content panel. While it lived in the
 * EditProvider `value` useMemo deps, each keystroke rebuilt the whole context
 * value → every `useEditContext()` consumer (~70 components) re-rendered per
 * character typed.
 *
 * This hoists the draftProps VALUE into a process-singleton
 * useSyncExternalStore micro-store (the shipped dirty-bridge / hover-bridge /
 * builder-tree-bridge pattern). EditProvider keeps its OWN React state (the
 * setDraftProps write API is unchanged) but PUBLISHES the value here and drops
 * it from the value-memo deps — so the context value identity is stable across
 * a typing burst and only the two real readers (inspector-dock, inline-editor)
 * re-render, via `useDraftProps()`.
 */
import { useSyncExternalStore } from "react";

type DraftProps = Record<string, unknown> | null;
type Listener = () => void;

let draftProps: DraftProps = null;
const listeners = new Set<Listener>();

/** Publish the working copy. No-op (no notify) when reference-unchanged. */
export function publishDraftProps(next: DraftProps): void {
  if (draftProps === next) return;
  draftProps = next;
  for (const l of listeners) l();
}

export function subscribeDraftProps(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDraftPropsSnapshot(): DraftProps {
  return draftProps;
}

/** Server snapshot — no working copy on the server / first paint. */
export function getDraftPropsServerSnapshot(): DraftProps {
  return null;
}

/** Subscribe to the live working copy (re-renders only on its change). */
export function useDraftProps(): DraftProps {
  return useSyncExternalStore(
    subscribeDraftProps,
    getDraftPropsSnapshot,
    getDraftPropsServerSnapshot,
  );
}
