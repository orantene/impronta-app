"use client";

/**
 * Anywhere-in-the-app → "open the support panel (Home: ask a question)".
 * SupportLauncher listens and owns the panel state. The `support-ticket`
 * drawer needs a ticketId and shows "could not be loaded" without one, so
 * entry points that have no ticket (Help drawer, drawer footers) call this.
 */
export const SUPPORT_PANEL_OPEN_EVENT = "tulala:support-open";

export function openSupportPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPPORT_PANEL_OPEN_EVENT));
}
