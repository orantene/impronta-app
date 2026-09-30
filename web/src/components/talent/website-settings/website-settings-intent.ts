"use client";

/**
 * Deep link into Website settings (PR 7): "Manage languages" (top bar) and
 * "Change in Website settings" (Account settings) ask for the Languages group,
 * then switch the talent page to "public-page". PublicPageEditor takes the
 * intent once on mount and opens the screen on that group. In-memory only: a
 * reload drops it, which is the right outcome for a navigation hint.
 */
export type WebsiteSettingsIntentView = "lang";

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
