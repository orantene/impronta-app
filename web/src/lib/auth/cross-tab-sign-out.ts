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

const SIGNING_OUT_FLAG = "__tulalaSigningOutHere";

/**
 * A BroadcastChannel delivers a message to every OTHER channel object with the same name,
 * including the listener mounted in the SENDER's own document. Without this flag the signing-out
 * tab received its own "signed-out", called `location.reload()`, and that navigation superseded the
 * sign-out form POST (it never reached the server; the page ended on /login with the server session
 * still alive). The sign-out entry point marks its own document before announcing.
 */
export function markSigningOutHere(win: object | undefined = typeof window === "undefined" ? undefined : window): void {
  if (!win) return;
  try {
    (win as Record<string, unknown>)[SIGNING_OUT_FLAG] = true;
  } catch {
    /* frozen window: best effort */
  }
}

export function isSigningOutHere(win: object | undefined = typeof window === "undefined" ? undefined : window): boolean {
  return Boolean(win && (win as Record<string, unknown>)[SIGNING_OUT_FLAG]);
}

/** Whether a received message must reload THIS tab: another tab signed out, not this one. */
export function shouldReloadOnSignOut(data: unknown, win?: object): boolean {
  return data === SIGNED_OUT_MESSAGE && !isSigningOutHere(win);
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
