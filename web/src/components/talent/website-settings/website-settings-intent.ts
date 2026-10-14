"use client";

/**
 * Deep link into Website settings (PR 7): "Manage languages" (top bar) and
 * "Change in Website settings" (Account settings) ask for the Languages group,
 * then switch the talent page to "public-page". Mi sitio Settings (card 36)
 * asks for Chat & inquiries so Booking assistant (AI) is one tap away.
 * PublicPageEditor takes the intent once on mount and opens the screen on
 * that group. In-memory only: a reload drops it, which is the right outcome
 * for a navigation hint.
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

/**
 * Settings > "Hide a public page" opens My presence on "Where I appear", where
 * the per-page hide switches live (not the slower My website tab). One-shot.
 */
export type PresenceTabIntent = "appear";

let pendingTab: PresenceTabIntent | null = null;

export function requestPresenceTab(tab: PresenceTabIntent): void {
  pendingTab = tab;
}

export function takePresenceTabIntent(): PresenceTabIntent | null {
  const v = pendingTab;
  pendingTab = null;
  return v;
}
