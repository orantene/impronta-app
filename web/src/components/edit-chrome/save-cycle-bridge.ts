"use client";

/**
 * save-cycle-bridge.ts — perf spine (save-cycle micro-store).
 *
 * `saving`, `pageVersion` and `lastDraftSavedAt` lived in the EditProvider's
 * giant `value` useMemo deps, so EVERY save cycle (setSaving(true) → version
 * bump → lastDraftSavedAt → setSaving(false)) rebuilt the whole context value
 * 2-4 times — and every `useEditContext()` consumer (~72 call sites)
 * re-rendered on each flip, on every routine autosave.
 *
 * This hoists all three into the shipped micro-store pattern
 * (dirty-bridge.ts / selection-bridge.ts): EditProvider KEEPS its own React
 * state (its effects — queued-history flush, beforeunload nudge, undo-persist
 * rebase — still need to re-run on the change) but PUBLISHES the values here
 * and drops them from the value-memo deps. Only the components that actually
 * read a slice subscribe to it.
 *
 * THREE independent slices so a consumer that reads only one is not woken by
 * a change to another:
 *   - `saving`          — boolean, save in flight.
 *   - `pageVersion`     — number | null, CAS version (bumps once per landed save).
 *   - `lastDraftSavedAt` — string | null, ISO stamp of the last landed save.
 *
 * `getSavingSnapshot()` is exported for NON-reactive reads inside event
 * handlers (keyboard shortcuts, undo/redo lanes) — a handler that only needs
 * the current value at call time must not subscribe (that would re-render its
 * whole host component per save flip, recreating the exact tax this removes).
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

function createSlice<T>(initial: T, serverValue: T) {
  let current = initial;
  const listeners = new Set<Listener>();
  return {
    publish(next: T): void {
      if (Object.is(current, next)) return;
      current = next;
      for (const l of listeners) l();
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): T {
      return current;
    },
    getServerSnapshot(): T {
      return serverValue;
    },
  };
}

const savingSlice = createSlice<boolean>(false, false);
const pageVersionSlice = createSlice<number | null>(null, null);
const lastDraftSavedAtSlice = createSlice<string | null>(null, null);

/** Publish the save-in-flight flag. No-op (no notify) when unchanged. */
export const publishSaving = savingSlice.publish;
/** Non-reactive read for event handlers / imperative lanes. */
export const getSavingSnapshot = savingSlice.getSnapshot;

/** Subscribe to the live save-in-flight flag. */
export function useSaving(): boolean {
  return useSyncExternalStore(
    savingSlice.subscribe,
    savingSlice.getSnapshot,
    savingSlice.getServerSnapshot,
  );
}

/** Publish the CAS page version. No-op (no notify) when unchanged. */
export const publishPageVersion = pageVersionSlice.publish;

/** Subscribe to the live CAS page version (bumps once per landed save). */
export function usePageVersion(): number | null {
  return useSyncExternalStore(
    pageVersionSlice.subscribe,
    pageVersionSlice.getSnapshot,
    pageVersionSlice.getServerSnapshot,
  );
}

/** Publish the last-draft-saved ISO stamp. No-op (no notify) when unchanged. */
export const publishLastDraftSavedAt = lastDraftSavedAtSlice.publish;

/** Subscribe to the last-draft-saved ISO stamp (drives the topbar SaveStatus). */
export function useLastDraftSavedAt(): string | null {
  return useSyncExternalStore(
    lastDraftSavedAtSlice.subscribe,
    lastDraftSavedAtSlice.getSnapshot,
    lastDraftSavedAtSlice.getServerSnapshot,
  );
}
