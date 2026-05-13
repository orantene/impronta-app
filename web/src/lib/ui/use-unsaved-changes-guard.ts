"use client";

import { useEffect } from "react";

/**
 * Warn the user before they navigate away from a form with unsaved changes.
 *
 * Hooks into the browser's `beforeunload` event (covers tab close, back
 * button, hard refresh) — fires the native "Leave site?" dialog when
 * `dirty` is true. Same pattern as edit-context and media-page already
 * use; this is the canonical reusable hook so settings + other forms
 * don't reinvent it.
 *
 * Limitations:
 *   - In-app `Link` navigation cannot be blocked from a hook alone in
 *     Next.js App Router (no useBlocker primitive yet). For in-app nav,
 *     pair this with an explicit `confirm()` in the destination link's
 *     onClick when dirty.
 *   - Browsers ignore the custom message and show their own generic
 *     "Changes you made may not be saved" copy — that's a browser-level
 *     decision, nothing we can do about it.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers require returnValue to be set to a non-empty string.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/**
 * Confirm-dialog helper for in-app navigation away from a dirty form.
 * Use in `onClick` handlers on links/buttons that would lose form state:
 *
 *   onClick={(e) => { if (!confirmLeaveIfDirty(dirty)) e.preventDefault(); }}
 *
 * Returns true if the user wants to proceed (or form is clean), false
 * if they cancelled.
 */
export function confirmLeaveIfDirty(dirty: boolean): boolean {
  if (!dirty) return true;
  if (typeof window === "undefined") return true;
  return window.confirm("You have unsaved changes. Leave without saving?");
}
