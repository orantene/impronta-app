"use client";

/**
 * use-undo-persistence — #18 UNDO-SURVIVES-RELOAD persistence machinery,
 * peeled out of edit-context.tsx (W4-F2 god-file decomposition). Owns the
 * debounced localStorage write of the undo `past` tail + the synchronous
 * flush on unmount / pagehide / visibilitychange→hidden. The provider owns
 * the `past` stack itself (rehydrated via `rehydratePersistedUndoStack`);
 * this hook only mirrors + persists it. Behavior is IDENTICAL to the former
 * inline blocks — see the W1-T5(a)/W1-L2 comments preserved inline.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { getEditSessionId } from "./presence-provider";
import { UNDO_PERSIST_CAP, type HistoryEntry } from "./edit-context-internal";

export function useUndoPersistence(input: {
  undoPersistKey: string | null;
  past: HistoryEntry[];
  pageVersion: number | null;
}) {
  const { undoPersistKey, past, pageVersion } = input;

  // #18 — Persist `past` to localStorage. We write only the tail
  // (UNDO_PERSIST_CAP entries) so the serialised size stays small even for
  // large builder-tree snapshots.
  //
  // PERF: the serialize+write used to run SYNCHRONOUSLY on the commit path of
  // every mutation, blocking the main thread mid-interaction. We now DEBOUNCE
  // it off the hot path (~500ms after the last change) so a burst of rapid
  // edits coalesces into a single write. Correctness is preserved by always
  // serialising the LATEST `past` (read from a ref at flush time) and by
  // FLUSHING any pending write synchronously on unmount and when the page is
  // being hidden/unloaded (pagehide + visibilitychange→hidden) — so a reload
  // immediately after an edit never loses the persisted undo tail.
  const undoPersistDataRef = useRef<{
    key: string | null;
    past: HistoryEntry[];
    baseVersion: number | null;
  }>({ key: undoPersistKey, past, baseVersion: pageVersion });
  useLayoutEffect(() => {
    undoPersistDataRef.current = {
      key: undoPersistKey,
      past,
      baseVersion: pageVersion,
    };
  });
  const undoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushUndoPersist = useCallback(() => {
    if (undoPersistTimerRef.current !== null) {
      clearTimeout(undoPersistTimerRef.current);
      undoPersistTimerRef.current = null;
    }
    if (typeof window === "undefined") return;
    const { key, past: latestPast, baseVersion } = undoPersistDataRef.current;
    if (!key) return;
    try {
      const tail = latestPast.slice(-UNDO_PERSIST_CAP);
      // W1-T5(a) — write a VERSIONED envelope so rehydrate can drop a stack that
      // a concurrent session has made stale (baseVersion ≠ loaded version).
      // W1-L2 — also stamp the per-tab session token so a same-tab reload can
      // recognise its OWN beacon-driven version advance and keep the stack.
      window.localStorage.setItem(
        key,
        JSON.stringify({
          baseVersion,
          sessionId: getEditSessionId(),
          entries: tail,
        }),
      );
    } catch {
      // Quota exceeded or private-browsing block — silently skip.
    }
  }, []);

  // Debounced write — reschedules on every `past` change OR pageVersion change;
  // the serialize+write runs ~500ms after the last edit, off the interaction hot
  // path. W1-T5(a): pageVersion is a dep so that after a draft save bumps the
  // version (which lands ~after the persist debounce that the edit itself armed)
  // the stack is RE-STAMPED with the session's latest version. Re-stamping with
  // a newer version + the same entries is always safe (the entries didn't
  // change; only our knowledge of the current version improved), and it's what
  // lets a same-session reload match (baseVersion === loaded version) while a
  // concurrent session's advance is detected as stale.
  useEffect(() => {
    if (!undoPersistKey || typeof window === "undefined") return;
    if (undoPersistTimerRef.current !== null) {
      clearTimeout(undoPersistTimerRef.current);
    }
    undoPersistTimerRef.current = setTimeout(() => {
      undoPersistTimerRef.current = null;
      flushUndoPersist();
    }, 500);
    return () => {
      if (undoPersistTimerRef.current !== null) {
        clearTimeout(undoPersistTimerRef.current);
        undoPersistTimerRef.current = null;
      }
    };
  }, [past, pageVersion, undoPersistKey, flushUndoPersist]);

  // Flush on unmount and when the page is hidden/unloaded so a reload right
  // after an edit never loses the persisted undo tail. visibilitychange→hidden
  // is the reliable signal on mobile/bfcache; pagehide covers desktop unload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageHide = () => flushUndoPersist();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushUndoPersist();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Component unmount — write whatever is pending synchronously.
      flushUndoPersist();
    };
  }, [flushUndoPersist]);

  return { undoPersistDataRef, flushUndoPersist };
}
