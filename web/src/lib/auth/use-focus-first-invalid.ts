"use client";

import { useEffect } from "react";

/**
 * TUL-1098: when a form action comes back with an error, move focus to the first invalid field
 * (or the first text input of the form that shows the error), so keyboard and screen-reader users
 * land where the fix goes. The error text itself is announced by `AuthNotice` (role="alert").
 * Finds the form from the rendered alert, so callers need no refs.
 */
export function useFocusFirstInvalidOnError(error: string | null | undefined): void {
  useEffect(() => {
    if (!error) return;
    const form = document.querySelector('[role="alert"]')?.closest("form");
    if (!form) return;
    const target =
      form.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      form.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="checkbox"]):not([disabled])');
    target?.focus();
  }, [error]);
}
