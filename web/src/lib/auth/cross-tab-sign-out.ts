"use client";

/**
 * TUL-788: signing out in one tab must not leave other tabs showing the old identity.
 *
 * `announceSignOut()` is called by the one sign-out entry point (`signOutEverywhere`) and posts on
 * a same-origin BroadcastChannel. `CrossTabSignOutListener` (mounted once in the root layout)
 * reloads a tab that HAD a Supabase auth cookie when it loaded, so signed-out marketing tabs are
 * left alone. The channel name matches the client /account area's listener (#3756).
 */

import { isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";

export const SESSION_CHANNEL = "tulala-session";
export const SIGNED_OUT_MESSAGE = "signed-out";

export function hasAuthCookie(cookieString: string): boolean {
  return cookieString
    .split(";")
    .some((part) => {
      const name = part.split("=")[0]?.trim() ?? "";
      // The session token only: a code-verifier alone is a login in progress, not a session.
      return isSupabaseAuthCookie(name) && name.includes("-auth-token");
    });
}

export function announceSignOut(): void {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage(SIGNED_OUT_MESSAGE);
    channel.close();
  } catch {
    /* other tabs refresh on their next navigation */
  }
}
