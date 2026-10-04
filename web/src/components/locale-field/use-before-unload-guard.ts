"use client";

/**
 * Warn before a reload / tab close while a form holds unsaved edits. The
 * top-bar language switch reloads the page, so a dirty editor would otherwise
 * lose its draft without a word. Browsers show their own generic text.
 */
import { useEffect } from "react";

export function useBeforeUnloadGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need a returnValue to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
