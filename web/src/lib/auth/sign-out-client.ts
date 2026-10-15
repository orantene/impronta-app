"use client";

import { stopBrowserAuthClient } from "@/lib/supabase/client";
import { authCookieScopeVariants, isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";

import { SIGN_OUT_PATH } from "./sign-out-paths";

/**
 * THE sign-out for every Log out control (S1, TUL-708 / TUL-621).
 *
 * Middleware trusts any auth cookie whose JWT verifies locally (`getClaims`),
 * so revoking the refresh token is not enough: every copy of the cookie, at
 * every Domain scope, must be gone, and nothing may write a new one on the
 * way out. The flow is one top-level form POST, no server action:
 *   1. browser side, before navigating: stop the browser Supabase client's
 *      auto-refresh, expire every `sb-*` auth cookie this page can see at
 *      every scope, drop any Supabase session in local/sessionStorage;
 *   2. POST /auth/sign-out (or /auth/client-sign-out on talent hosts):
 *      revokes the session server-side, expires every scope + chunk with raw
 *      Set-Cookie headers, `no-store`, 303 to home. The proxy skips its
 *      session refresh on that request, so no cookie is re-minted;
 *   3. the 303 is a full page load: no router cache, no stale RSC tree.
 */
export function clearBrowserAuthState(doc: Document = document, win: Window = window): void {
  stopBrowserAuthClient();
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

function safeStorage(win: Window, kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return win[kind];
  } catch {
    return null;
  }
}

/** Imperative entry point: clear browser state, then full-page POST sign-out. */
export function signOutEverywhere(path: string = SIGN_OUT_PATH): void {
  try {
    clearBrowserAuthState();
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
