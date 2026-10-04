/**
 * Cross-route intent: gallery "Add to my site" → open the builder Add gallery
 * on the Apps tab (optionally highlighting one app).
 *
 * Module memory for soft navigations; sessionStorage for hard loads of
 * `/talent/page-builder?panel=add&app=…`.
 */

const STORAGE_KEY = "tulala:builder-app-intent";

let pendingAppId: string | null = null;

export function requestBuilderAppIntent(appId: string): void {
  const id = appId.trim();
  if (!id) return;
  pendingAppId = id;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode / quota */
  }
}

export function takeBuilderAppIntent(): string | null {
  const mem = pendingAppId;
  pendingAppId = null;
  if (typeof window === "undefined") return mem;
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return mem ?? stored;
}
