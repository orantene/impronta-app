"use client";

import { stopBrowserAuthClient } from "@/lib/supabase/client";
import { authCookieScopeVariants, isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";

import { announceSignOut, markSigningOutHere } from "./cross-tab-sign-out";
import { SIGN_OUT_PATH } from "./sign-out-paths";

/**
 * THE sign-out for every Log out control (S1, TUL-708 / TUL-621).
 *
 * Middleware trusts any auth cookie whose JWT verifies locally (`getClaims`),
 * so revoking the refresh token is not enough: every copy of the cookie, at
 * every Domain scope, must be gone, and nothing may write a new one on the
 * way out. The flow is one top-level form POST, no server action:
 *   1. browser side, before navigating: mark this document as signing out
 *      (so its own cross-tab listener cannot reload it), stop the browser
 *      Supabase client's auto-refresh, drop any Supabase session in
 *      local/sessionStorage. The auth COOKIES stay attached to the POST so the
 *      server can revoke the session, and are dropped on `pagehide`;
 *   2. POST /auth/sign-out (or /auth/client-sign-out on talent hosts):
 *      revokes the session server-side, expires every scope + chunk with raw
 *      Set-Cookie headers, `no-store`, 303 to home. The proxy skips its
 *      session refresh on that request, so no cookie is re-minted;
 *   3. the 303 is a full page load: no router cache, no stale RSC tree.
 */
export function clearBrowserAuthStorage(win: Window = window): void {
  stopBrowserAuthClient();
  for (const store of [safeStorage(win, "localStorage"), safeStorage(win, "sessionStorage")]) {
    if (!store) continue;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k.startsWith("sb-") || k.includes("supabase.auth"))) keys.push(k);
    }
    for (const k of keys) store.removeItem(k);
  }
}

export function clearBrowserAuthCookies(doc: Document = document, win: Window = window): void {
  const scopes = authCookieScopeVariants(win.location.hostname);
  for (const part of doc.cookie.split(";")) {
    const name = part.split("=")[0]?.trim() ?? "";
    if (!isSupabaseAuthCookie(name)) continue;
    for (const domain of scopes) {
      doc.cookie = domain
        ? `${name}=; Path=/; Max-Age=0; Domain=${domain}`
        : `${name}=; Path=/; Max-Age=0`;
    }
  }
}

/** Storage + cookies together. Only safe AFTER the sign-out request has left the browser. */
export function clearBrowserAuthState(doc: Document = document, win: Window = window): void {
  clearBrowserAuthStorage(win);
  clearBrowserAuthCookies(doc, win);
}

/**
 * Everything the browser may do BEFORE the sign-out POST leaves, and nothing that would stop it:
 *  - mark this document as the one signing out, so its own cross-tab listeners do not
 *    `location.reload()` and supersede the POST;
 *  - stop the browser Supabase client and drop its local/sessionStorage session (neither
 *    affects the request);
 *  - DO NOT expire the auth cookies yet. The POST has to carry them: the route revokes the
 *    session from the request's cookies (`signOut({ scope: "global" })`), so cookies expired
 *    first meant an anonymous POST that revoked nothing. The server response already expires
 *    every scope with raw Set-Cookie; this page's own copies are dropped on `pagehide`, i.e. once
 *    the navigation to the response commits (the request is long gone by then).
 */
export function prepareBrowserSignOut(doc: Document = document, win: Window = window): void {
  markSigningOutHere(win);
  clearBrowserAuthStorage(win);
  win.addEventListener("pagehide", () => clearBrowserAuthCookies(doc, win), { once: true });
}

function safeStorage(win: Window, kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return win[kind];
  } catch {
    return null;
  }
}

/** Imperative entry point: prepare the browser, then full-page POST sign-out (cookies still attached). */
export function signOutEverywhere(path: string = SIGN_OUT_PATH): void {
  // Mark first: the broadcast below is delivered to this document's own listeners too.
  markSigningOutHere();
  announceSignOut();
  try {
    prepareBrowserSignOut();
  } catch {
    // Never block the server sign-out on a browser-side cleanup failure.
  }
  const form = document.createElement("form");
  form.method = "post";
  form.action = path;
  form.style.display = "none";
  document.body.appendChild(form);
  form.submit();
}
