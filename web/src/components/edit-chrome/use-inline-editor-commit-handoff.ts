"use client";

/**
 * CANVAS-7B — the inline-editor → node-history undo handoff, extracted from
 * InlineEditor so the seam stays under the shared edit-chrome line budget.
 *
 * While an inline text editor is focused, ⌘Z/⌘⇧Z are owned by the editor's own
 * text history (edit-shell defers via `isEditableKeyboardTarget`). The hazard is
 * the moment right AFTER the operator leaves the editor: the overlay commits its
 * text asynchronously, and a ⌘Z fired before the commit lands in node history
 * would undo the PRIOR node op and silently drop the freshly-typed text.
 *
 * This hook wires the two halves of the fix on the InlineEditor side:
 *   - `runCommit` wraps the overlay's `onCommit` so the in-flight commit promise
 *     is tracked in a ref. Blur / Enter / outside-click AND the undo-handoff all
 *     route through this one function — there is never a parallel commit path.
 *   - the effect registers a synchronous-to-call commit handle on the shared
 *     bridge while an overlay is open. EditContext.undo/redo await that handle
 *     (via `commitActiveInlineEditor`) BEFORE reading the history stack: it
 *     forces the open overlay's own `commit()` (identical to a blur) and resolves
 *     once the resulting node-history push has settled. Deregistered on close so
 *     a stale handle never fires.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";

import { registerInlineEditorCommit } from "./canvas-lexical-bridge";

interface InlineEditorCommitHandoff {
  /** Wrap for the overlay's `onCommit` — tracks the in-flight commit promise. */
  runCommit: (next: string) => void;
  /** Passed to `<CanvasEditOverlay commitRef>` — the overlay stashes commit() here. */
  overlayCommitRef: MutableRefObject<(() => void) | null>;
}

export function useInlineEditorCommitHandoff(input: {
  /** True while an inline edit overlay is open (i.e. `activeEdit !== null`). */
  isEditing: boolean;
  /** Commits (or cancels) the active inline edit; resolves after the push. */
  endActiveEdit: (commit: boolean, next?: string) => Promise<void>;
}): InlineEditorCommitHandoff {
  const { isEditing, endActiveEdit } = input;
  // The open overlay stashes its own commit() here; pendingCommitRef holds the
  // in-flight commit promise the undo-handoff awaits before a node-level undo.
  const overlayCommitRef = useRef<(() => void) | null>(null);
  const pendingCommitRef = useRef<Promise<void> | null>(null);

  const runCommit = useCallback(
    (next: string) => {
      const p = endActiveEdit(true, next);
      pendingCommitRef.current = p;
      void p.finally(() => {
        if (pendingCommitRef.current === p) pendingCommitRef.current = null;
      });
    },
    [endActiveEdit],
  );

  useEffect(() => {
    if (!isEditing) {
      registerInlineEditorCommit(null);
      return;
    }
    registerInlineEditorCommit(async () => {
      // Force the same commit the blur path runs (idempotent — the overlay's
      // committedRef guards against a double-commit). This synchronously fires
      // onCommit → runCommit, populating pendingCommitRef.
      overlayCommitRef.current?.();
      // Await the commit chain so the node-history push has been applied before
      // the caller reads the undo stack. If a commit was already in flight (e.g.
      // a blur landed first), await that instead.
      const pending = pendingCommitRef.current;
      if (pending) await pending;
    });
    return () => registerInlineEditorCommit(null);
  }, [isEditing]);

  return { runCommit, overlayCommitRef };
}
