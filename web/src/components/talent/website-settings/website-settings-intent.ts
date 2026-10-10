"use client";

/**
 * Deep link into Website settings (PR 7): "Manage languages" (top bar) and
 * "Change in Website settings" (Account settings) ask for the Languages group,
 * then switch the talent page to "public-page". Mi sitio can also open Chat &
 * inquiries (Booking assistant). PublicPageEditor takes a mount intent and can
 * open groups from on-page entries. In-memory only: a reload drops it, which is
 * the right outcome for a navigation hint.
 */
export type WebsiteSettingsIntentView = "lang" | "chat";

let pending: WebsiteSettingsIntentView | null = null;

export function requestWebsiteSettingsView(view: WebsiteSettingsIntentView): void {
  pending = view;
}

/** Read and clear the pending view. */
export function takeWebsiteSettingsIntent(): WebsiteSettingsIntentView | null {
  const v = pending;
  pending = null;
  return v;
}
