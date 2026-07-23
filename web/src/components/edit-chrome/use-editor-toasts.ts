"use client";

/**
 * use-editor-toasts — the editor's transient feedback state, peeled out of
 * edit-context.tsx (W4-F2 god-file decomposition): the mutation-error toast
 * (with fingerprint de-noising + the W3-T2(b) sticky conflict/save-failed
 * exemption), the "Saved" draft chip, the CANVAS-4 "Template applied — Undo?"
 * toast, and the CANVAS-7 clipboard-success toast.
 *
 * The four hand-wired setTimeout auto-hide choreographies edit-context used
 * to carry are now ONE `useTransientState` hook (below) parameterized by ttl
 * + an optional sticky predicate. Timing is IDENTICAL: each effect keyed on
 * the value re-arms on every set (so a copy→paste burst re-fires the window),
 * and a sticky value (VERSION_CONFLICT / SAVE_FAILED) never auto-dismisses.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  BuilderClipboardAction,
  BuilderClipboardActionToast,
  EditMutationError,
} from "./edit-context-types";

function normalizeMutationError(
  input: string | EditMutationError,
): EditMutationError {
  if (typeof input === "string") {
    return { message: input };
  }
  return {
    message: input.message,
    operation: input.operation,
    code: input.code,
    details:
      input.details && input.details.length > 0 ? input.details : undefined,
  };
}

function mutationErrorFingerprint(input: EditMutationError): string {
  return [
    input.message,
    input.operation ?? "",
    input.code ?? "",
    ...(input.details ?? []),
  ].join("|");
}

/**
 * ONE transient-state primitive for every auto-hiding toast. `null` = hidden.
 * Setting a (truthy) value arms a fresh auto-clear timer; setting a NEW value
 * while visible re-arms it (the effect is keyed on the value, exactly like
 * the four bespoke effects this replaces). An optional `isSticky` predicate
 * exempts decision-bearing values from the timer entirely — they stay up
 * until explicitly cleared (W3-T2(b): conflict/save-failed offer a choice).
 */
function useTransientState<T>(
  ttlMs: number,
  isSticky?: (value: T) => boolean,
): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!value) return;
    if (isSticky?.(value)) return;
    const t = setTimeout(() => setValue(null), ttlMs);
    return () => clearTimeout(t);
  }, [value, ttlMs, isSticky]);
  return [value, setValue];
}

// W3-T2(b) — recoverable, decision-bearing failures (a co-editor's save wins →
// VERSION_CONFLICT; the draft didn't persist → SAVE_FAILED) must NOT
// auto-dismiss. They offer a real choice (reload latest / keep my version) and
// disappearing on a 5s timer would silently swallow that choice. Every other
// (advisory) code keeps the 5s ttl so transient gesture errors don't squat the
// layout. Module-level so its identity never churns the effect.
const mutationErrorIsSticky = (e: EditMutationError): boolean =>
  e.code === "VERSION_CONFLICT" || e.code === "SAVE_FAILED";

export function useEditorToasts(input: {
  /**
   * Runs when the operator explicitly dismisses the mutation-error toast.
   * W3-T2 — the provider uses this to drop its parked conflict-recovery tree
   * (dismissing the conflict toast means "go with the reloaded latest").
   */
  onDismissMutationError: () => void;
}) {
  const { onDismissMutationError } = input;

  // Most recent mutation error. Auto-clears after 5s — the operator
  // probably already undid or retried, and we'd rather err toward quiet
  // than keep a stale error chip up.
  const [mutationError, setMutationError] =
    useTransientState<EditMutationError>(5000, mutationErrorIsSticky);
  const lastMutationErrorRef = useRef<{
    fingerprint: string;
    at: number;
  } | null>(null);
  const reportMutationError = useCallback(
    (message: string | EditMutationError) => {
      const normalized = normalizeMutationError(message);
      // Benign no-op edits (re-applying identical props, or a UI gesture that
      // re-sends current values) are NOT failures — never surface a toast.
      if (
        normalized.code === "NO_CHANGE" ||
        /no changes to apply/i.test(normalized.message ?? "")
      ) {
        return;
      }
      const fingerprint = mutationErrorFingerprint(normalized);
      const now = Date.now();
      const previous = lastMutationErrorRef.current;
      // De-noise repeated failures fired in the same user gesture cycle
      // (e.g. keyboard-repeat at layout boundaries). Keep the first toast
      // visible and avoid replacing it with identical copies.
      if (
        previous &&
        previous.fingerprint === fingerprint &&
        now - previous.at < 1200
      ) {
        return;
      }
      lastMutationErrorRef.current = { fingerprint, at: now };
      setMutationError(normalized);
    },
    [setMutationError],
  );
  const clearMutationError = useCallback(() => {
    setMutationError(null);
    // W3-T2 — dismissing the conflict toast means "go with the reloaded
    // (latest) version", so the provider drops the parked recovery tree too.
    onDismissMutationError();
  }, [setMutationError, onDismissMutationError]);

  // Most recent successful Save draft press. Auto-clears after 4s so the
  // chip doesn't squat the layout — the operator has already moved on.
  const [lastDraftSavedAt, setLastDraftSavedAt] = useTransientState<string>(4000);
  const clearDraftSavedToast = useCallback(
    () => setLastDraftSavedAt(null),
    [setLastDraftSavedAt],
  );

  // CANVAS-4 — the shared "Template applied — Undo?" toast. Set by
  // applyTemplateWithUndo on every surface; auto-clears after 8s (longer than
  // the 4s Saved chip so the operator has a real window to reconsider a
  // whole-page replace). The Undo button in the toast calls undo().
  const [templateAppliedToast, setTemplateAppliedToast] = useTransientState<{
    label: string;
  }>(8000);
  const clearTemplateAppliedToast = useCallback(
    () => setTemplateAppliedToast(null),
    [setTemplateAppliedToast],
  );
  const notifyTemplateApplied = useCallback(
    (label: string) => setTemplateAppliedToast({ label }),
    [setTemplateAppliedToast],
  );

  // CANVAS-7 — the shared clipboard-success toast. Raised by the copy/cut/
  // paste/duplicate chokepoints in edit-context via `notifyClipboardAction`.
  // The `nonce` bump makes a copy→paste burst coalesce into ONE chip whose
  // auto-hide timer re-arms on each gesture (the effect re-runs on the nonce
  // change), so a rapid sequence never stacks multiple toasts. 3.2s window —
  // long enough to read, short enough to stay out of the way.
  const [clipboardActionToast, setClipboardActionToast] =
    useTransientState<BuilderClipboardActionToast>(3200);
  const clipboardActionNonceRef = useRef(0);
  const clearClipboardActionToast = useCallback(
    () => setClipboardActionToast(null),
    [setClipboardActionToast],
  );
  const notifyClipboardAction = useCallback(
    (action: BuilderClipboardAction, count: number) => {
      clipboardActionNonceRef.current += 1;
      setClipboardActionToast({
        action,
        count: Math.max(1, count),
        nonce: clipboardActionNonceRef.current,
      });
    },
    [setClipboardActionToast],
  );

  return {
    mutationError,
    reportMutationError,
    clearMutationError,
    lastDraftSavedAt,
    setLastDraftSavedAt,
    clearDraftSavedToast,
    templateAppliedToast,
    setTemplateAppliedToast,
    clearTemplateAppliedToast,
    notifyTemplateApplied,
    clipboardActionToast,
    clearClipboardActionToast,
    notifyClipboardAction,
  };
}
